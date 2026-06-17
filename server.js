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
const SEPAY_WEBHOOK_TOKEN = process.env.SEPAY_WEBHOOK_TOKEN || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const USE_LOCAL_ADMIN_API = String(process.env.USE_LOCAL_ADMIN_API || "true").toLowerCase() !== "false";

const PAYMENT_PRODUCTS = {
  FLOWLEAD: {
    name: "Bản Đồ Flow Lead 1 Trang",
    productType: "digital",
    amount: 2000,
  },
  ARSDFY: {
    name: "Agent Rocket Sales - Done For You",
    productType: "service",
    amount: 12000000,
  },
  ARFLOW: {
    name: "Phí cấu hình triển khai AgentRocket AI",
    productType: "service",
    amount: 12000000,
  },
  AR12D: {
    name: "Thử Thách AI 12 Ngày Tạo Hệ Thống Bán Hàng Của Riêng Bạn",
    productType: "service",
    amount: 5000000,
  },
};

let dbInstance;

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

function jsonConfig(res, body) {
  res.type("application/javascript; charset=utf-8").send(body);
}

function publicConfigValue(value) {
  return JSON.stringify(value || "");
}

function nowIso() {
  return new Date().toISOString();
}

function todayInVietnam() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date()).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getDb() {
  if (!fs.existsSync(BRAIN_DB_PATH)) {
    const error = new Error(`Không tìm thấy brain.db tại ${BRAIN_DB_PATH}`);
    error.statusCode = 500;
    throw error;
  }

  if (!dbInstance) {
    dbInstance = new Database(BRAIN_DB_PATH);
    dbInstance.pragma("journal_mode = WAL");
    dbInstance.pragma("foreign_keys = ON");
    migrateDb(dbInstance);
  }

  return dbInstance;
}

function getColumns(db, tableName) {
  return db.prepare(`pragma table_info(${tableName})`).all().map((column) => column.name);
}

function addColumnIfMissing(db, tableName, columnName, definition) {
  const columns = getColumns(db, tableName);
  if (!columns.includes(columnName)) {
    db.exec(`alter table ${tableName} add column ${columnName} ${definition}`);
  }
}

function migrateDb(db) {
  db.exec(`
    create table if not exists products (
      id integer primary key autoincrement,
      name text not null,
      product_type text not null check (product_type in ('physical', 'digital', 'service')),
      price real not null,
      description text,
      stock_remaining integer,
      check (product_type != 'physical' or stock_remaining is not null),
      check (stock_remaining is null or stock_remaining >= 0)
    );

    create table if not exists customers (
      id integer primary key autoincrement,
      name text not null,
      phone text,
      zalo text,
      registered_at text
    );

    create table if not exists orders (
      id integer primary key autoincrement,
      customer_id integer not null,
      product_id integer not null,
      amount real not null,
      order_status text not null,
      purchased_at text not null,
      foreign key (customer_id) references customers(id),
      foreign key (product_id) references products(id)
    );

    create table if not exists leads (
      id integer primary key autoincrement,
      lead_id text not null unique,
      status text not null,
      submitted_at text not null,
      source text,
      page_url text,
      user_agent text,
      fullname text,
      company text,
      phone text,
      email_or_zalo text,
      industry text,
      size text,
      revenue text,
      leads_monthly text,
      pain text,
      roi_staff text,
      roi_salary text,
      roi_repetitive_time_percent text,
      roi_automation_percent text,
      roi_leads_monthly text,
      roi_conversion_rate text,
      roi_average_order_value text,
      roi_saving_estimated text,
      roi_revenue_estimated text,
      roi_net_estimated text,
      lead_channel text,
      lead_storage text,
      first_ai_task text,
      readiness text,
      raw_payload text
    );

    create table if not exists payment_events (
      id integer primary key autoincrement,
      order_id integer,
      order_code text,
      amount real,
      content text,
      gateway text,
      gateway_transaction_id text,
      paid_at text,
      raw_payload text,
      created_at text not null
    );
  `);

  addColumnIfMissing(db, "products", "product_code", "text");
  addColumnIfMissing(db, "customers", "lead_id", "text");
  addColumnIfMissing(db, "orders", "order_code", "text");
  addColumnIfMissing(db, "orders", "payment_content", "text");
  addColumnIfMissing(db, "orders", "product_code", "text");
  addColumnIfMissing(db, "orders", "source_url", "text");
  addColumnIfMissing(db, "orders", "paid_at", "text");
  addColumnIfMissing(db, "orders", "gateway", "text");
  addColumnIfMissing(db, "orders", "gateway_transaction_id", "text");
  addColumnIfMissing(db, "orders", "gateway_raw", "text");

  db.exec(`
    create unique index if not exists idx_products_product_code on products(product_code) where product_code is not null and product_code != '';
    create unique index if not exists idx_customers_lead_id on customers(lead_id) where lead_id is not null and lead_id != '';
    create unique index if not exists idx_orders_order_code on orders(order_code) where order_code is not null and order_code != '';
    create index if not exists idx_leads_submitted_at on leads(submitted_at);
    create index if not exists idx_orders_purchased_at on orders(purchased_at);
    create index if not exists idx_orders_paid_at on orders(paid_at);
    create index if not exists idx_orders_status on orders(order_status);
  `);
}

function parseMoney(value) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[^\d]/g, "");
  return Number(cleaned || 0);
}

function normalizeDateTime(value) {
  if (value) return String(value).trim();
  return nowIso();
}

function dateTextFromValue(value) {
  if (!value) return "";
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const viMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (viMatch) return `${viMatch[3]}-${viMatch[2]}-${viMatch[1]}`;
  return "";
}

function formatVnd(value) {
  return `${new Intl.NumberFormat("vi-VN").format(parseMoney(value))}đ`;
}

function sanitizeCode(value, max = 40) {
  return String(value || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, max);
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

async function notifyTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !text) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
      }),
    });
  } catch (error) {
    console.error("[Telegram Notify Error]", error.message);
  }
}

function buildLeadRecord(payload) {
  const lead = payload.lead || {};
  const roi = payload.roi || {};
  const survey = payload.survey || {};

  return {
    lead_id: String(payload.leadId || "").trim(),
    status: String(payload.status || "qualified").trim(),
    submitted_at: normalizeDateTime(payload.submittedAt),
    source: payload.source || "",
    page_url: payload.pageUrl || "",
    user_agent: payload.userAgent || "",
    fullname: lead.fullname || "",
    company: lead.company || "",
    phone: lead.phone || "",
    email_or_zalo: lead.email || lead.zalo || "",
    industry: lead.industry || "",
    size: lead.size || "",
    revenue: lead.revenue || "",
    leads_monthly: lead.leads || "",
    pain: lead.pain || "",
    roi_staff: roi.staff || "",
    roi_salary: roi.salary || "",
    roi_repetitive_time_percent: roi.repetitiveTimePercent || "",
    roi_automation_percent: roi.automationPercent || "",
    roi_leads_monthly: roi.leadsMonthly || "",
    roi_conversion_rate: roi.conversionRate || "",
    roi_average_order_value: roi.averageOrderValue || "",
    roi_saving_estimated: roi.savingEstimated || "",
    roi_revenue_estimated: roi.revenueEstimated || "",
    roi_net_estimated: roi.netRoiEstimated || "",
    lead_channel: survey.leadChannel || "",
    lead_storage: survey.leadStorage || "",
    first_ai_task: survey.firstAiTask || "",
    readiness: survey.readiness || "",
    raw_payload: JSON.stringify(payload),
  };
}

function upsertLead(payload) {
  const record = buildLeadRecord(payload);
  if (!record.lead_id) {
    const error = new Error("Thiếu Lead ID cho lead.");
    error.statusCode = 400;
    throw error;
  }

  const db = getDb();
  db.prepare(`
    insert into leads (
      lead_id, status, submitted_at, source, page_url, user_agent, fullname, company, phone,
      email_or_zalo, industry, size, revenue, leads_monthly, pain, roi_staff, roi_salary,
      roi_repetitive_time_percent, roi_automation_percent, roi_leads_monthly, roi_conversion_rate,
      roi_average_order_value, roi_saving_estimated, roi_revenue_estimated, roi_net_estimated,
      lead_channel, lead_storage, first_ai_task, readiness, raw_payload
    ) values (
      @lead_id, @status, @submitted_at, @source, @page_url, @user_agent, @fullname, @company,
      @phone, @email_or_zalo, @industry, @size, @revenue, @leads_monthly, @pain, @roi_staff,
      @roi_salary, @roi_repetitive_time_percent, @roi_automation_percent, @roi_leads_monthly,
      @roi_conversion_rate, @roi_average_order_value, @roi_saving_estimated,
      @roi_revenue_estimated, @roi_net_estimated, @lead_channel, @lead_storage, @first_ai_task,
      @readiness, @raw_payload
    )
    on conflict(lead_id) do update set
      status = excluded.status,
      submitted_at = excluded.submitted_at,
      source = excluded.source,
      page_url = excluded.page_url,
      user_agent = excluded.user_agent,
      fullname = excluded.fullname,
      company = excluded.company,
      phone = excluded.phone,
      email_or_zalo = excluded.email_or_zalo,
      industry = excluded.industry,
      size = excluded.size,
      revenue = excluded.revenue,
      leads_monthly = excluded.leads_monthly,
      pain = excluded.pain,
      roi_staff = excluded.roi_staff,
      roi_salary = excluded.roi_salary,
      roi_repetitive_time_percent = excluded.roi_repetitive_time_percent,
      roi_automation_percent = excluded.roi_automation_percent,
      roi_leads_monthly = excluded.roi_leads_monthly,
      roi_conversion_rate = excluded.roi_conversion_rate,
      roi_average_order_value = excluded.roi_average_order_value,
      roi_saving_estimated = excluded.roi_saving_estimated,
      roi_revenue_estimated = excluded.roi_revenue_estimated,
      roi_net_estimated = excluded.roi_net_estimated,
      lead_channel = excluded.lead_channel,
      lead_storage = excluded.lead_storage,
      first_ai_task = excluded.first_ai_task,
      readiness = excluded.readiness,
      raw_payload = excluded.raw_payload
  `).run(record);

  return record;
}

function buildLeadTelegramMessage(record) {
  return [
    "Lead mới từ AgentRocket AI",
    "",
    `Trạng thái: ${record.status}`,
    `Thời gian: ${record.submitted_at}`,
    `Họ tên: ${record.fullname}`,
    `Doanh nghiệp: ${record.company}`,
    `Điện thoại: ${record.phone}`,
    `Email/Zalo: ${record.email_or_zalo}`,
    `Ngành: ${record.industry}`,
    `Quy mô: ${record.size}`,
    `Doanh thu: ${record.revenue}`,
    `Lead/tháng: ${record.leads_monthly}`,
    `Vấn đề: ${record.pain}`,
    "",
    "Khảo sát tùy chọn:",
    `Kênh lead chính: ${record.lead_channel}`,
    `Nơi lưu lead: ${record.lead_storage}`,
    `Tác vụ AI ưu tiên: ${record.first_ai_task}`,
    `Mức độ sẵn sàng: ${record.readiness}`,
    "",
    `ROI ròng ước tính: ${record.roi_net_estimated}`,
    `Lead ID: ${record.lead_id}`,
    `URL: ${record.page_url}`,
  ].join("\n");
}

function getProductByCodeOrCreate(productCode) {
  const db = getDb();
  const code = sanitizeCode(productCode, 32);
  const config = PAYMENT_PRODUCTS[code];
  if (!config) {
    const error = new Error(`Mã sản phẩm thanh toán không hợp lệ: ${code}`);
    error.statusCode = 400;
    throw error;
  }

  let product = db.prepare("select * from products where product_code = ?").get(code);
  if (product) return product;

  const result = db.prepare(`
    insert into products (product_code, name, product_type, price, description, stock_remaining)
    values (?, ?, ?, ?, ?, ?)
  `).run(code, config.name, config.productType, config.amount, "Tạo tự động từ trang thanh toán", null);

  return db.prepare("select * from products where id = ?").get(result.lastInsertRowid);
}

function upsertPaymentCustomer(customerPayload = {}) {
  const db = getDb();
  const leadId = sanitizeCode(customerPayload.leadId, 80);
  const phone = String(customerPayload.phone || "").trim();

  let customer = leadId
    ? db.prepare("select * from customers where lead_id = ?").get(leadId)
    : null;

  if (!customer && phone) {
    customer = db.prepare("select * from customers where phone = ? order by id desc").get(phone);
  }

  const name = String(customerPayload.name || "").trim() || "Khách thanh toán";
  const zalo = String(customerPayload.zalo || "").trim();

  if (customer) {
    db.prepare("update customers set name = ?, phone = ?, zalo = ?, lead_id = coalesce(nullif(?, ''), lead_id) where id = ?")
      .run(name, phone, zalo, leadId, customer.id);
    return db.prepare("select * from customers where id = ?").get(customer.id);
  }

  const result = db.prepare("insert into customers (name, phone, zalo, registered_at, lead_id) values (?, ?, ?, ?, ?)")
    .run(name, phone, zalo, nowIso(), leadId);

  return db.prepare("select * from customers where id = ?").get(result.lastInsertRowid);
}

function createPendingPaymentOrder(payload) {
  const orderCode = sanitizeCode(payload.orderId, 32);
  if (!orderCode) {
    const error = new Error("Thiếu mã đơn hàng.");
    error.statusCode = 400;
    throw error;
  }

  const product = getProductByCodeOrCreate(payload.productCode);
  const customer = upsertPaymentCustomer(payload.customer || {});
  const productConfig = PAYMENT_PRODUCTS[product.product_code];
  const amount = productConfig ? productConfig.amount : parseMoney(payload.amount || product.price);
  const transferContent = String(payload.transferContent || "").trim();
  const db = getDb();

  const existing = db.prepare("select id, order_status from orders where order_code = ?").get(orderCode);
  if (existing) {
    const updates = {
      customer_id: customer.id,
      product_id: product.id,
      amount,
      payment_content: transferContent,
      product_code: product.product_code,
      source_url: payload.pageUrl || "",
      id: existing.id,
    };

    if (existing.order_status === "paid") {
      db.prepare(`
        update orders set customer_id = @customer_id, product_id = @product_id, amount = @amount,
        payment_content = @payment_content, product_code = @product_code, source_url = @source_url
        where id = @id
      `).run(updates);
    } else {
      db.prepare(`
        update orders set customer_id = @customer_id, product_id = @product_id, amount = @amount,
        order_status = 'pending_payment', payment_content = @payment_content,
        product_code = @product_code, source_url = @source_url
        where id = @id
      `).run(updates);
    }
  } else {
    db.prepare(`
      insert into orders (
        order_code, customer_id, product_id, amount, order_status, purchased_at,
        payment_content, product_code, source_url
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderCode,
      customer.id,
      product.id,
      amount,
      "pending_payment",
      nowIso(),
      transferContent,
      product.product_code,
      payload.pageUrl || ""
    );
  }

  return {
    orderId: orderCode,
    productId: product.id,
    customerId: customer.id,
    paymentContent: transferContent,
  };
}

function getOrderByCodeOrId(orderId) {
  const db = getDb();
  const code = String(orderId || "").trim();
  if (!code) return null;

  return db.prepare(`
    select
      o.*,
      c.name as customer_name,
      p.name as product_name,
      p.product_type as product_type
    from orders o
    left join customers c on c.id = o.customer_id
    left join products p on p.id = o.product_id
    where o.order_code = ? or cast(o.id as text) = ?
  `).get(code, code);
}

function getPaymentOrderStatus(payload) {
  const orderCode = sanitizeCode(payload.orderId || payload.order_id, 32);
  if (!orderCode) {
    const error = new Error("Thiếu mã đơn hàng.");
    error.statusCode = 400;
    throw error;
  }

  const order = getOrderByCodeOrId(orderCode);
  if (!order) {
    return {
      orderId: orderCode,
      status: "not_found",
      paid: false,
    };
  }

  return {
    orderId: order.order_code || String(order.id),
    status: order.order_status || "",
    paid: order.order_status === "paid",
    paidAt: order.paid_at || "",
  };
}

function assertPaymentAmountMatches(order, paidAmount) {
  if (!paidAmount) return;
  const expectedAmount = Number(order.amount || 0);
  if (expectedAmount > 0 && Number(paidAmount) !== expectedAmount) {
    const error = new Error(`Số tiền thanh toán không khớp. Kỳ vọng ${expectedAmount}, nhận ${paidAmount}.`);
    error.statusCode = 400;
    throw error;
  }
}

function extractWebhookContent(payload) {
  return String(
    payload.content ||
    payload.transfer_content ||
    payload.description ||
    payload.transaction_content ||
    payload.memo ||
    payload.raw ||
    ""
  );
}

function extractOrderCodeFromContent(content) {
  const match = String(content || "").match(/\bO[0-9A-Za-z]{8,24}\b/);
  return match ? match[0] : "";
}

function extractWebhookAmount(payload) {
  return parseMoney(
    payload.amount ||
    payload.transferAmount ||
    payload.transfer_amount ||
    payload.money ||
    payload.value ||
    ""
  );
}

function extractWebhookTransactionId(payload) {
  return String(
    payload.id ||
    payload.transaction_id ||
    payload.referenceCode ||
    payload.reference_code ||
    payload.code ||
    ""
  );
}

function extractWebhookPaidAt(payload) {
  return String(
    payload.transactionDate ||
    payload.transaction_date ||
    payload.created_at ||
    payload.time ||
    nowIso()
  );
}

function markOrderPaidFromPayload(payload, gateway = "sepay") {
  const content = extractWebhookContent(payload);
  const orderCode = payload.orderId || payload.order_id || extractOrderCodeFromContent(content);
  if (!orderCode) {
    const error = new Error(`Không tìm thấy mã đơn trong nội dung chuyển khoản: ${content}`);
    error.statusCode = 400;
    throw error;
  }

  const order = getOrderByCodeOrId(orderCode);
  if (!order) {
    const error = new Error(`Không tìm thấy đơn hàng ứng với mã: ${orderCode}`);
    error.statusCode = 404;
    throw error;
  }

  const amount = extractWebhookAmount(payload);
  assertPaymentAmountMatches(order, amount);

  const transactionId = extractWebhookTransactionId(payload);
  const paidAt = extractWebhookPaidAt(payload);
  const raw = JSON.stringify(payload);
  const db = getDb();

  db.prepare(`
    update orders set amount = ?, order_status = 'paid', payment_content = ?, paid_at = ?,
    gateway = ?, gateway_transaction_id = ?, gateway_raw = ?
    where id = ?
  `).run(amount || order.amount, content, paidAt, gateway, transactionId, raw, order.id);

  db.prepare(`
    insert into payment_events (order_id, order_code, amount, content, gateway, gateway_transaction_id, paid_at, raw_payload, created_at)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(order.id, order.order_code || String(order.id), amount || order.amount, content, gateway, transactionId, paidAt, raw, nowIso());

  notifyTelegram([
    "Thanh toán mới từ SePay",
    "",
    `Mã đơn: ${order.order_code || order.id}`,
    `Số tiền: ${amount || order.amount}`,
    `Nội dung: ${content}`,
  ].join("\n"));

  return {
    orderId: order.order_code || String(order.id),
    status: "paid",
  };
}

function listProducts() {
  return getDb().prepare("select * from products order by id desc").all();
}

function listCustomers() {
  return getDb().prepare("select * from customers order by id desc").all();
}

function listOrders() {
  return getDb().prepare(`
    select
      o.*,
      coalesce(o.order_code, cast(o.id as text)) as display_id,
      c.name as customer_name,
      p.name as product_name,
      p.product_type as product_type
    from orders o
    left join customers c on c.id = o.customer_id
    left join products p on p.id = o.product_id
    order by o.id desc
  `).all();
}

function listLeads(fromDate, toDate, status = "all", limit = 50) {
  const rows = getDb().prepare("select * from leads order by submitted_at desc, id desc").all();
  return rows.filter((lead) => {
    const leadDate = dateTextFromValue(lead.submitted_at);
    const statusMatches = status === "all" || String(lead.status || "") === status;
    return statusMatches && leadDate >= fromDate && leadDate <= toDate;
  }).slice(0, limit);
}

function compactOrder(order) {
  return {
    id: order.order_code || String(order.id || ""),
    internal_id: order.id,
    customer_id: order.customer_id || "",
    customer_name: order.customer_name || "",
    product_id: order.product_id || "",
    product_name: order.product_name || "",
    product_type: order.product_type || "",
    amount: parseMoney(order.amount),
    amount_text: formatVnd(order.amount),
    order_status: order.order_status || "",
    payment_content: order.payment_content || "",
    product_code: order.product_code || "",
    source_url: order.source_url || "",
    purchased_at: order.purchased_at || "",
    paid_at: order.paid_at || "",
    gateway: order.gateway || "",
    gateway_transaction_id: order.gateway_transaction_id || "",
  };
}

function dailyBusinessSummary(dateText, status = "all") {
  const leads = listLeads(dateText, dateText, status, 500);
  const orders = listOrders();
  const ordersOnDate = orders.filter((order) => (
    dateTextFromValue(order.purchased_at) === dateText ||
    dateTextFromValue(order.paid_at) === dateText
  ));
  const orderStatusCounts = ordersOnDate.reduce((result, order) => {
    const key = order.order_status || "unknown";
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
  const paidOrders = ordersOnDate.filter((order) => order.order_status === "paid");
  const pendingOrders = ordersOnDate.filter((order) => ["pending_payment", "new"].includes(order.order_status));
  const paidRevenue = paidOrders.reduce((sum, order) => sum + parseMoney(order.amount), 0);
  const attentionItems = [];

  leads.slice(0, 5).forEach((lead) => {
    attentionItems.push({
      type: "lead",
      message: `Lead mới: ${lead.fullname || "Không tên"} - ${lead.company || "Chưa có doanh nghiệp"}`,
      lead_id: lead.lead_id,
    });
  });

  pendingOrders.slice(0, 5).forEach((order) => {
    attentionItems.push({
      type: "order",
      message: `Đơn cần theo dõi: ${order.order_code || order.id} - ${order.customer_name || "Khách chưa rõ"} - ${formatVnd(order.amount)}`,
      order_id: order.order_code || String(order.id),
    });
  });

  return {
    date: dateText,
    source: "brain_db",
    lead_count: leads.length,
    order_count: ordersOnDate.length,
    order_status_counts: orderStatusCounts,
    paid_order_count: paidOrders.length,
    pending_order_count: pendingOrders.length,
    paid_revenue: paidRevenue,
    paid_revenue_text: formatVnd(paidRevenue),
    attention_items: attentionItems.slice(0, 5),
  };
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
  appsScriptUrl: "",
  apiBaseUrl: "/api",
  useLocalApi: ${USE_LOCAL_ADMIN_API ? "true" : "false"}
};\n`
  );
});

app.get("/assets/js/lead-config.js", (req, res) => {
  jsonConfig(res, `window.AGENTROCKET_LEAD_WEBHOOK_URL = "/api/leads";\n`);
});

app.get("/assets/js/payment-config.js", (req, res) => {
  jsonConfig(
    res,
    `window.AGENTROCKET_PAYMENT_CONFIG = {
  apiBaseUrl: "/api/payments",
  appsScriptUrl: ""
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

app.post("/api/leads", async (req, res, next) => {
  try {
    const record = upsertLead({ ...(req.body || {}), status: "qualified" });
    notifyTelegram(buildLeadTelegramMessage(record));
    res.json({ ok: true, data: { leadId: record.lead_id } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/leads", requireAdminToken, (req, res) => {
  const fromDate = String(req.query.from_date || req.query.date || todayInVietnam());
  const toDate = String(req.query.to_date || req.query.date || fromDate);
  const status = String(req.query.status || "all");
  const limit = Math.min(Number(req.query.limit || 50), 200);
  res.json({ ok: true, data: listLeads(fromDate, toDate, status, limit) });
});

app.get("/api/summary/daily", requireAdminToken, (req, res) => {
  const date = String(req.query.date || todayInVietnam());
  res.json({ ok: true, data: dailyBusinessSummary(date, String(req.query.status || "all")) });
});

app.get("/api/products", requireAdminToken, (req, res) => {
  res.json({ ok: true, data: listProducts() });
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
    .prepare("insert into products (name, product_type, price, description, stock_remaining, product_code) values (?, ?, ?, ?, ?, ?)")
    .run(name, productType, parseMoney(data.price), description, stockRemaining, sanitizeCode(data.product_code, 32) || null);

  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put("/api/products/:id", requireAdminToken, (req, res) => {
  const data = req.body || {};
  const stockRemaining = data.stock_remaining === "" || data.stock_remaining === null || data.stock_remaining === undefined
    ? null
    : Number(data.stock_remaining);

  getDb()
    .prepare("update products set name = ?, product_type = ?, price = ?, description = ?, stock_remaining = ?, product_code = ? where id = ?")
    .run(
      String(data.name || "").trim(),
      String(data.product_type || "").trim(),
      parseMoney(data.price),
      String(data.description || "").trim(),
      stockRemaining,
      sanitizeCode(data.product_code, 32) || null,
      getId(req)
    );

  res.json({ ok: true });
});

app.get("/api/customers", requireAdminToken, (req, res) => {
  res.json({ ok: true, data: listCustomers() });
});

app.post("/api/customers", requireAdminToken, (req, res) => {
  const data = req.body || {};
  const name = String(data.name || "").trim();

  if (!name) return res.status(400).json({ ok: false, error: "Tên khách hàng là bắt buộc." });

  const result = getDb()
    .prepare("insert into customers (name, phone, zalo, registered_at, lead_id) values (?, ?, ?, ?, ?)")
    .run(
      name,
      String(data.phone || "").trim(),
      String(data.zalo || "").trim(),
      normalizeDateTime(data.registered_at),
      sanitizeCode(data.lead_id, 80) || null
    );

  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put("/api/customers/:id", requireAdminToken, (req, res) => {
  const data = req.body || {};

  getDb()
    .prepare("update customers set name = ?, phone = ?, zalo = ?, registered_at = ?, lead_id = ? where id = ?")
    .run(
      String(data.name || "").trim(),
      String(data.phone || "").trim(),
      String(data.zalo || "").trim(),
      normalizeDateTime(data.registered_at),
      sanitizeCode(data.lead_id, 80) || null,
      getId(req)
    );

  res.json({ ok: true });
});

app.get("/api/orders", requireAdminToken, (req, res) => {
  res.json({ ok: true, data: listOrders() });
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
    const product = db.prepare("select id, product_type, stock_remaining, product_code from products where id = ?").get(productId);
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

      db.prepare("update products set stock_remaining = case when stock_remaining is null then null else stock_remaining - 1 end where id = ?")
        .run(productId);
    }

    return db
      .prepare(`
        insert into orders (customer_id, product_id, amount, order_status, purchased_at, product_code, payment_content, paid_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        customerId,
        productId,
        parseMoney(data.amount),
        String(data.order_status || "new").trim(),
        normalizeDateTime(data.purchased_at),
        product.product_code || "",
        String(data.payment_content || "").trim(),
        String(data.paid_at || "").trim()
      );
  });

  const result = tx();
  res.json({ ok: true, id: result.lastInsertRowid });
});

app.put("/api/orders/:id", requireAdminToken, (req, res) => {
  const data = req.body || {};

  getDb()
    .prepare(`
      update orders set customer_id = ?, product_id = ?, amount = ?, order_status = ?,
      purchased_at = ?, payment_content = ?, paid_at = ? where id = ?
    `)
    .run(
      Number(data.customer_id || 0),
      Number(data.product_id || 0),
      parseMoney(data.amount),
      String(data.order_status || "new").trim(),
      normalizeDateTime(data.purchased_at),
      String(data.payment_content || "").trim(),
      String(data.paid_at || "").trim(),
      getId(req)
    );

  res.json({ ok: true });
});

app.post("/api/payments/create_pending_order", (req, res, next) => {
  try {
    res.json({ ok: true, data: createPendingPaymentOrder(req.body || {}) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/get_order_status", (req, res, next) => {
  try {
    res.json({ ok: true, data: getPaymentOrderStatus(req.body || {}) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/sepay-webhook", (req, res, next) => {
  try {
    if (!SEPAY_WEBHOOK_TOKEN || req.query.token !== SEPAY_WEBHOOK_TOKEN) {
      return res.status(401).json({ ok: false, error: "Token SePay webhook không hợp lệ." });
    }

    res.json({ ok: true, data: markOrderPaidFromPayload(req.body || {}, "sepay") });
  } catch (error) {
    next(error);
  }
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

app.get("/api/mcp/daily-business-summary", requireAdminToken, (req, res) => {
  const date = String(req.query.date || todayInVietnam());
  res.json({ ok: true, data: dailyBusinessSummary(date, String(req.query.status || "all")) });
});

app.get("/api/mcp/new-leads", requireAdminToken, (req, res) => {
  const fromDate = String(req.query.from_date || req.query.date || todayInVietnam());
  const toDate = String(req.query.to_date || req.query.date || fromDate);
  const status = String(req.query.status || "all");
  const limit = Math.min(Number(req.query.limit || 10), 50);
  res.json({
    ok: true,
    data: {
      source: "brain_db",
      from_date: fromDate,
      to_date: toDate,
      status,
      total: listLeads(fromDate, toDate, status, 500).length,
      leads: listLeads(fromDate, toDate, status, limit),
    },
  });
});

app.get("/api/mcp/payment-order-status", requireAdminToken, (req, res) => {
  const orderId = String(req.query.order_id || "").trim();
  const status = String(req.query.status || "all");
  const limit = Math.min(Number(req.query.limit || 10), 50);
  let orders = listOrders();

  if (orderId) {
    const found = getOrderByCodeOrId(orderId);
    return res.json({
      ok: true,
      data: found
        ? { source: "brain_db", order_id: orderId, found: true, order: compactOrder(found) }
        : { source: "brain_db", order_id: orderId, found: false, message: "Không tìm thấy đơn hàng." },
    });
  }

  if (status !== "all") {
    orders = orders.filter((order) => String(order.order_status || "") === status);
  }

  const totalAmount = orders.reduce((sum, order) => sum + parseMoney(order.amount), 0);
  res.json({
    ok: true,
    data: {
      source: "brain_db",
      status,
      total: orders.length,
      total_amount: totalAmount,
      total_amount_text: formatVnd(totalAmount),
      orders: orders.slice(0, limit).map(compactOrder),
    },
  });
});

app.use((err, req, res, next) => {
  const status = err.statusCode || 500;
  res.status(status).json({ ok: false, error: err.message || "Lỗi server." });
});

app.listen(PORT, HOST, () => {
  getDb();
  console.log(`AgentRocket server đang chạy tại http://${HOST}:${PORT}`);
  console.log(`Admin: http://${HOST}:${PORT}/admin`);
  console.log(`brain.db: ${BRAIN_DB_PATH}`);
});
