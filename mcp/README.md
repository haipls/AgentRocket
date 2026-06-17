# AgentRocket MCP Server

MCP server cho GoClaw agent gọi dữ liệu vận hành AgentRocket từ `brain.db` trên VPS.

## Transport

- Transport: `streamable-http`
- URL nội bộ mặc định: `http://127.0.0.1:3001/mcp`
- Health check: `http://127.0.0.1:3001/health`
- Nguồn dữ liệu: `brain.db`, thông qua API nội bộ của website.

Nếu GoClaw chạy trong Docker và dashboard chặn private IP, dùng Caddy reverse proxy public có header bảo vệ:

```text
https://rocket.vungkiemtien.com/mcp
X-AgentRocket-MCP-Token: <token trong Caddyfile>
```

## Environment

Server dùng chung `.env` ở root repo:

```env
MCP_HOST=127.0.0.1
MCP_PORT=3001
SERVER_API_BASE_URL=http://127.0.0.1:3000
ADMIN_TOKEN=...
BRAIN_DB_PATH=/opt/agentrocket/brain.db
```

`ADMIN_TOKEN` phải giống token website dùng để bảo vệ `/api`.

## Run

```bash
npm install --omit=dev
npm run mcp:start
```

## Tools

- `get_daily_business_summary`
- `list_new_leads`
- `get_payment_and_order_status`

Ba tool này đọc dữ liệu từ `brain.db`, không gọi Apps Script/Google Sheets.

## systemd sample

```ini
[Unit]
Description=AgentRocket MCP server
After=network.target agentrocket.service

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
