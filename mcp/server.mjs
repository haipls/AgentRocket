import "dotenv/config";

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HOST = process.env.MCP_HOST || "127.0.0.1";
const PORT = Number(process.env.MCP_PORT || 3001);
const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL || "http://127.0.0.1:3000";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

const app = express();
app.use(express.json({ limit: "1mb" }));

function timestamp() {
  return new Date().toISOString();
}

function logToolCall(toolName, status, detail = "") {
  console.log(`[${timestamp()}] mcp_tool_call tool=${toolName} status=${status}${detail ? ` ${detail}` : ""}`);
}

function success(message, data) {
  return { success: true, message, data };
}

function fail(message, details = {}) {
  return { success: false, message, details };
}

function toolResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function assertConfigured() {
  if (!SERVER_API_BASE_URL) {
    throw new Error("Thiếu SERVER_API_BASE_URL trong môi trường MCP.");
  }

  if (!ADMIN_TOKEN) {
    throw new Error("Thiếu ADMIN_TOKEN trong môi trường MCP.");
  }
}

async function callServerApi(path, params) {
  assertConfigured();

  const url = new URL(path, SERVER_API_BASE_URL);
  url.searchParams.set("token", ADMIN_TOKEN);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`Server API trả response không phải JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok || !body.ok) {
    throw new Error(body.error || `Server API lỗi HTTP ${response.status}`);
  }

  if (body.data === undefined) {
    throw new Error("Server API chưa trả data cho MCP.");
  }

  return body.data;
}

function validateDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${fieldName} phải có định dạng YYYY-MM-DD.`);
  }

  return value;
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

function normalizeLimit(value, fallback = 10, max = 50) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(Math.floor(number), max);
}

async function runTool(toolName, args, callback) {
  logToolCall(toolName, "start");

  try {
    const data = await callback(args || {});
    logToolCall(toolName, "success");
    return toolResult(success(`${toolName} hoàn tất.`, data));
  } catch (error) {
    const message = error.message || `${toolName} thất bại.`;
    logToolCall(toolName, "error", `message=${JSON.stringify(message)}`);
    return toolResult(fail(message));
  }
}

function createMcpServer() {
  const server = new McpServer({
    name: "agentrocket-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "get_daily_business_summary",
    {
      title: "AgentRocket daily business summary",
      description: "Tổng hợp lead, đơn hàng, doanh thu và việc cần chú ý trong ngày từ brain.db trên VPS.",
      inputSchema: {
        date: z.string().optional().describe("Ngày cần xem theo YYYY-MM-DD, mặc định là hôm nay GMT+7."),
        source: z.literal("brain_db").optional().describe("Nguồn dữ liệu, hiện hỗ trợ brain_db."),
      },
    },
    async (args) => runTool("get_daily_business_summary", args, async (input) => {
      const date = validateDate(input.date || todayInVietnam(), "date");
      return callServerApi("/api/mcp/daily-business-summary", {
        date,
        source: "brain_db",
      });
    })
  );

  server.registerTool(
    "list_new_leads",
    {
      title: "List AgentRocket new leads",
      description: "Liệt kê lead mới từ brain.db theo khoảng ngày, trạng thái và limit.",
      inputSchema: {
        from_date: z.string().optional().describe("Ngày bắt đầu theo YYYY-MM-DD, mặc định là hôm nay GMT+7."),
        to_date: z.string().optional().describe("Ngày kết thúc theo YYYY-MM-DD, mặc định bằng from_date."),
        status: z.string().optional().describe("Trạng thái lead, ví dụ qualified hoặc all."),
        limit: z.number().int().positive().max(50).optional().describe("Số lead tối đa, tối đa 50."),
      },
    },
    async (args) => runTool("list_new_leads", args, async (input) => {
      const fromDate = validateDate(input.from_date || todayInVietnam(), "from_date");
      const toDate = validateDate(input.to_date || fromDate, "to_date");

      if (toDate < fromDate) {
        throw new Error("to_date không được nhỏ hơn from_date.");
      }

      return callServerApi("/api/mcp/new-leads", {
        from_date: fromDate,
        to_date: toDate,
        status: input.status || "all",
        limit: normalizeLimit(input.limit),
      });
    })
  );

  server.registerTool(
    "get_payment_and_order_status",
    {
      title: "Get AgentRocket payment and order status",
      description: "Kiểm tra một đơn hàng hoặc liệt kê đơn hàng theo trạng thái từ brain.db trên VPS.",
      inputSchema: {
        order_id: z.string().optional().describe("Mã đơn cần kiểm tra, ví dụ O..."),
        status: z.string().optional().describe("Trạng thái đơn: pending_payment, paid, processing, done, cancelled hoặc all."),
        limit: z.number().int().positive().max(50).optional().describe("Số đơn tối đa khi không truyền order_id, tối đa 50."),
      },
    },
    async (args) => runTool("get_payment_and_order_status", args, async (input) => {
      const orderId = input.order_id ? String(input.order_id).trim() : "";
      const status = input.status || "all";
      const allowedStatuses = ["pending_payment", "paid", "processing", "done", "cancelled", "new", "all"];

      if (orderId && !/^[A-Za-z0-9_-]{1,40}$/.test(orderId)) {
        throw new Error("order_id chỉ được chứa chữ, số, dấu _ hoặc -, tối đa 40 ký tự.");
      }

      if (!allowedStatuses.includes(status)) {
        throw new Error(`status không hợp lệ. Cho phép: ${allowedStatuses.join(", ")}.`);
      }

      return callServerApi("/api/mcp/payment-order-status", {
        order_id: orderId,
        status,
        limit: normalizeLimit(input.limit),
      });
    })
  );

  return server;
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "agentrocket-mcp",
    transport: "streamable-http",
    host: HOST,
    port: PORT,
    serverApiConfigured: Boolean(SERVER_API_BASE_URL),
    source: "brain_db",
  });
});

app.all("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error(`[${timestamp()}] mcp_request_error ${error.stack || error.message}`);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: error.message || "MCP request failed",
        },
        id: null,
      });
    }
  }
});

app.listen(PORT, HOST, () => {
  console.log(`[${timestamp()}] AgentRocket MCP server listening at http://${HOST}:${PORT}/mcp`);
});
