import "dotenv/config";

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const HOST = process.env.MCP_HOST || "127.0.0.1";
const PORT = Number(process.env.MCP_PORT || 3001);
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";
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
  if (!APPS_SCRIPT_URL) {
    throw new Error("Thiếu APPS_SCRIPT_URL trong môi trường MCP.");
  }

  if (!ADMIN_TOKEN) {
    throw new Error("Thiếu ADMIN_TOKEN trong môi trường MCP.");
  }
}

function encodePayload(data) {
  return Buffer.from(JSON.stringify(data || {}), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function callAppsScript(action, payload) {
  assertConfigured();

  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set("mcp", "1");
  url.searchParams.set("token", ADMIN_TOKEN);
  url.searchParams.set("action", action);
  url.searchParams.set("payload", encodePayload(payload));

  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });

  const text = await response.text();
  let body;

  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`Apps Script trả response không phải JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok || !body.ok) {
    throw new Error(body.error || `Apps Script lỗi HTTP ${response.status}`);
  }

  if (body.data === undefined) {
    throw new Error("Apps Script chưa trả data cho action MCP. Cần deploy lại Apps Script Web App với code mới.");
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
      description: "Tổng hợp lead, đơn hàng, doanh thu và việc cần chú ý trong ngày từ Apps Script/Google Sheets.",
      inputSchema: {
        date: z.string().optional().describe("Ngày cần xem theo YYYY-MM-DD, mặc định là hôm nay GMT+7."),
        source: z.literal("google_sheets").optional().describe("Nguồn dữ liệu, hiện hỗ trợ google_sheets."),
      },
    },
    async (args) => runTool("get_daily_business_summary", args, async (input) => {
      const date = validateDate(input.date || todayInVietnam(), "date");
      return callAppsScript("get_daily_business_summary", {
        date,
        source: "google_sheets",
      });
    })
  );

  server.registerTool(
    "list_new_leads",
    {
      title: "List AgentRocket new leads",
      description: "Liệt kê lead mới từ Google Sheets theo khoảng ngày, trạng thái và limit.",
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

      return callAppsScript("list_new_leads", {
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
      description: "Kiểm tra một đơn hàng hoặc liệt kê đơn hàng theo trạng thái từ Google Sheets.",
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

      return callAppsScript("get_payment_and_order_status", {
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
    appsScriptConfigured: Boolean(APPS_SCRIPT_URL),
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
