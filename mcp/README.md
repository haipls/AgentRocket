# AgentRocket MCP Server

MCP server cho GoClaw agent gọi dữ liệu vận hành AgentRocket qua Apps Script/Google Sheets.

## Transport

- Transport: `streamable-http`
- URL nội bộ: `http://127.0.0.1:3001/mcp`
- Health check: `http://127.0.0.1:3001/health`
- Bind mặc định: `127.0.0.1`, không public ra internet.

## Environment

Server dùng chung `.env` ở root repo:

```env
MCP_HOST=127.0.0.1
MCP_PORT=3001
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
ADMIN_TOKEN=...
```

`APPS_SCRIPT_URL` phải trỏ tới Apps Script Web App đã deploy code có `?mcp=1`.

## Run

```bash
npm install --omit=dev
npm run mcp:start
```

## Tools

- `get_daily_business_summary`
- `list_new_leads`
- `get_payment_and_order_status`

Nguồn dữ liệu của 3 tool này là Apps Script/Google Sheets.

## GoClaw Config

Thêm MCP server vào `config.json` của GoClaw:

```json
{
  "tools": {
    "mcp_servers": {
      "agentrocket": {
        "transport": "streamable-http",
        "url": "http://127.0.0.1:3001/mcp",
        "tool_prefix": "agentrocket_",
        "timeout_sec": 30,
        "enabled": true
      }
    }
  }
}
```

Sau đó restart GoClaw hoặc reconnect MCP server trong dashboard, rồi grant server cho agent cần dùng.

## systemd sample

```ini
[Unit]
Description=AgentRocket MCP server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/agentrocket
EnvironmentFile=/opt/agentrocket/.env
ExecStart=/usr/bin/node /opt/agentrocket/mcp/server.mjs
Restart=always
RestartSec=5
User=root
Group=root

[Install]
WantedBy=multi-user.target
```

## Logs

Mỗi lần tool được gọi, server log ra console:

```text
[2026-06-16T00:00:00.000Z] mcp_tool_call tool=list_new_leads status=start
[2026-06-16T00:00:00.500Z] mcp_tool_call tool=list_new_leads status=success
```
