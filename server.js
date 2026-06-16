require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const Database = require("better-sqlite3");
const leadConfirmation = require("./netlify/functions/lead-confirmation").handler;
const adminOrderConfirmation = require("./netlify/functions/admin-order-confirmation").handler;
const paymentConfirmation = require("./netlify/functions/payment-confirmation").handler;
const resendTest = require("./netlify/functions/resend-test").handler;

const app = express();
const ROOT = __dirname;
const HOST = process.env.HOST || "127.0.0.1";
const PORT = process.env.PORT || 3000;
const BRAIN_DB_PATH = process.env.BRAIN_DB_PATH || path.join(ROOT, "brain.db");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
const USE_LOCAL_ADMIN_API = String(process.env.USE_LOCAL_ADMIN_API || "true").toLowerCase() !== "false";

let dbInstance;

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

function jsonConfig(res, body) {
  res.type("application/javascript; charset=utf-8").send(body);
}

function publicConfigValue(value) {
  return JSON.stringify(value || "");
}

function getDb() {
  if (!fs.existsSync(BRAIN_DB_PATH)) {
    const error = new Error(`Không tìm thấy brain.db tại ${BRAIN_DB_PATH}`);
    error.statusCode = 500;
    throw error;
  }

  if (!dbInstance) {
    dbInstance = new Database(BRAIN_DB_PATH);
    dbInstance.pragma("foreign_keys = ON");
  }

  return dbInstance;
}

function parseMoney(value) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^\d]/g, "");
  return Number(cleaned || 0);
}

function normalizeDateTime(value) {
  if (value) return String(value).trim();
  return new Date().toISOString();
}

function requireAdminToken(req, res, next) {
  if (!ADMIN_TOKEN) return next();

  const headerToken = req.get("x-admin-token") || "";
  const queryToken = req.query.token || "";

  if (headerToken === ADMIN_TOKEN || queryToken === ADMIN_TOKEN) return next();
  return res.status(401).json({ ok: false, error: "Token admin không hợp lệ." });
}

function getId(req) {
  const id = Number(req.params.id || 0);
  if (!Number.isInteger(id) || id <= 0) {
    const error = new Error("ID không hợp lệ.");
    error.statusCode = 400;
    throw error;
  }
  return id;
}

app.get("/admin", (req, res) => {
  res.sendFile(path.join(ROOT, "admin", "index.html"));
});

app.get("/admin/", (req, res) => {
  res.sendFile(path.join(ROOT, "admin", "index.html"));
});

app.get("/admin/admin-config.js", (req, res) => {
  jsonConfig(
    res,
    `window.AGENTROCKET_ADMIN_CONFIG = {
  appsScriptUrl: ${publicConfigValue(USE_LOCAL_ADMIN_API ? "" : APPS_SCRIPT_URL)},
  apiBaseUrl: "/api",
  useLocalApi: ${USE_LOCAL_ADMIN_API ? "true" : "false"}
};\n`
  );
});

app.get("/assets/js/lead-config.js", (req, res) => {
  jsonConfig(res, `window.AGENTROCKET_LEAD_WEBHOOK_URL = ${publicConfigValue(APPS_SCRIPT_URL)};\n`);
});

app.get("/assets/js/payment-config.js", (req, res) => {
  jsonConfig(
    res,
    `window.AGENTROCKET_PAYMENT_CONFIG = {
  appsScriptUrl: ${publicConfigValue(APPS_SCRIPT_URL)}
};\n`
  );
});

function createNetlifyEvent(req) {
  return {
    httpMethod: req.method,
    headers: req.headers || {},
    queryStringParameters: req.query || {},
    body: req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : "",
  };
}

function mountNetlifyFunction(route, handler) {
  app.all(route, async (req, res) => {
    const result = await handler(createNetlifyEvent(req));
    res.status(result.statusCode || 200);

    Object.entries(result.headers || {}).forEach(([key, value]) => {
      res.set(key, value);
    });

    res.send(result.body || "");
  });
}

mountNetlifyFunction("/.netlify/functions/lead-confirmation", leadConfirmation);
mountNetlifyFunction("/.netlify/functions/admin-order-confirmation", adminOrderConfirmation);
mountNetlifyFunction("/.netlify/functions/payment-confirmation", paymentConfirmation);
mountNetlifyFunction("/.netlify/functions/resend-test", resendTest);

app.use(express.static(ROOT, { extensions: ["html"] }));

app.get("/api/products", requireAdminToken, (req, res) => {
  const rows = getDb().prepare("select * from products order by id desc").all();
  res.json({ ok: true, data: rows });
});

app.post("/api/products", requireAdminToken, (req, res) => {
  const data = req.body || {};
  const name = String(data.name || "").trim();
  const productType = String(data.product_type || "").trim();
  const description = String(data.description || "").trim();
  const stockRemaining = data.stock_remaining === "" || data.stock_remaining === null || data.stock_remaining === undefined
    ? null
    : Number(data.stock_remaining);

  if (!name) return res.status(400).json({ ok: false, error: "Tên sản phẩm là bắt buộc." });
  if (!["physical", "digital", "service"].includes(productType)) {
    return res.status(400).json({ ok: false, error: "Loại sản phẩm không hợp lệ." });
  }

  const result = getDb()
    .prepare(
      "insert into products (name, product_type, price, description, stock_remaining) values (?, ?, ?, ?, ?)"
    )
    .run(name, productType, parseMoney(data.price), description, stockRemaining);

  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put("/api/products/:id", requireAdminToken, (req, res) => {
  const data = req.body || {};
  const stockRemaining = data.stock_remaining === "" || data.stock_remaining === null || data.stock_remaining === undefined
    ? null
    : Number(data.stock_remaining);

  getDb()
    .prepare(
      "update products set name = ?, product_type = ?, price = ?, description = ?, stock_remaining = ? where id = ?"
    )
    .run(
      String(data.name || "").trim(),
      String(data.product_type || "").trim(),
      parseMoney(data.price),
      String(data.description || "").trim(),
      stockRemaining,
      getId(req)
    );

  res.json({ ok: true });
});

app.get("/api/customers", requireAdminToken, (req, res) => {
  const rows = getDb().prepare("select * from customers order by id desc").all();
  res.json({ ok: true, data: rows });
});

app.post("/api/customers", requireAdminToken, (req, res) => {
  const data = req.body || {};
  const name = String(data.name || "").trim();

  if (!name) return res.status(400).json({ ok: false, error: "Tên khách hàng là bắt buộc." });

  const result = getDb()
    .prepare("insert into customers (name, phone, zalo, registered_at) values (?, ?, ?, ?)")
    .run(
      name,
      String(data.phone || "").trim(),
      String(data.zalo || "").trim(),
      normalizeDateTime(data.registered_at)
    );

  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put("/api/customers/:id", requireAdminToken, (req, res) => {
  const data = req.body || {};

  getDb()
    .prepare("update customers set name = ?, phone = ?, zalo = ?, registered_at = ? where id = ?")
    .run(
      String(data.name || "").trim(),
      String(data.phone || "").trim(),
      String(data.zalo || "").trim(),
      normalizeDateTime(data.registered_at),
      getId(req)
    );

  res.json({ ok: true });
});

app.get("/api/orders", requireAdminToken, (req, res) => {
  const rows = getDb()
    .prepare(
      `select
        o.*,
        c.name as customer_name,
        p.name as product_name,
        p.product_type as product_type
      from orders o
      left join customers c on c.id = o.customer_id
      left join products p on p.id = o.product_id
      order by o.id desc`
    )
    .all();

  res.json({ ok: true, data: rows });
});

app.post("/api/orders", requireAdminToken, (req, res) => {
  const data = req.body || {};
  const db = getDb();
  const customerId = Number(data.customer_id || 0);
  const productId = Number(data.product_id || 0);

  if (customerId <= 0 || productId <= 0) {
    return res.status(400).json({ ok: false, error: "Khách hàng và sản phẩm là bắt buộc." });
  }

  const tx = db.transaction(() => {
    const product = db.prepare("select id, product_type, stock_remaining from products where id = ?").get(productId);
    if (!product) {
      const error = new Error("Không tìm thấy sản phẩm.");
      error.statusCode = 400;
      throw error;
    }

    if (product.product_type === "physical") {
      if (product.stock_remaining !== null && product.stock_remaining <= 0) {
        const error = new Error("Sản phẩm vật lý đã hết tồn kho.");
        error.statusCode = 400;
        throw error;
      }

      db.prepare(
        "update products set stock_remaining = case when stock_remaining is null then null else stock_remaining - 1 end where id = ?"
      ).run(productId);
    }

    return db
      .prepare("insert into orders (customer_id, product_id, amount, order_status, purchased_at) values (?, ?, ?, ?, ?)")
      .run(
        customerId,
        productId,
        parseMoney(data.amount),
        String(data.order_status || "new").trim(),
        normalizeDateTime(data.purchased_at)
      );
  });

  const result = tx();
  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put("/api/orders/:id", requireAdminToken, (req, res) => {
  const data = req.body || {};

  getDb()
    .prepare(
      "update orders set customer_id = ?, product_id = ?, amount = ?, order_status = ?, purchased_at = ? where id = ?"
    )
    .run(
      Number(data.customer_id || 0),
      Number(data.product_id || 0),
      parseMoney(data.amount),
      String(data.order_status || "new").trim(),
      normalizeDateTime(data.purchased_at),
      getId(req)
    );

  res.json({ ok: true });
});

app.delete("/api/:resource/:id", requireAdminToken, (req, res) => {
  const tableMap = {
    products: "products",
    customers: "customers",
    orders: "orders",
  };
  const table = tableMap[req.params.resource];

  if (!table) return res.status(404).json({ ok: false, error: "Không tìm thấy API." });

  getDb().prepare(`delete from ${table} where id = ?`).run(getId(req));
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ ok: false, error: err.message || "Lỗi server." });
});

app.listen(PORT, HOST, () => {
  console.log(`AgentRocket server đang chạy tại http://${HOST}:${PORT}`);
  console.log(`Admin: http://${HOST}:${PORT}/admin`);
  console.log(`brain.db: ${BRAIN_DB_PATH}`);
});
