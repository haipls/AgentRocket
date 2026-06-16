# Deploy VPS Ubuntu

## Stack hiện tại

- Website public là HTML/CSS/JavaScript tĩnh.
- Server production dùng Node.js + Express trong `server.js`.
- Email dùng Resend qua các Netlify Function cũ, hiện vẫn giữ code để tham chiếu/migrate.
- Public lead/payment vẫn dùng Apps Script/Google Sheets qua biến `APPS_SCRIPT_URL`.
- Admin trên VPS dùng API local `/api/*` và kết nối SQLite `brain.db`.

## Biến môi trường cần có

Tạo file `.env` trên VPS:

```env
PORT=3000
BRAIN_DB_PATH=/opt/agentrocket/brain.db
ADMIN_TOKEN=thay_bang_token_admin_that
APPS_SCRIPT_URL=https://script.google.com/macros/s/.../exec
USE_LOCAL_ADMIN_API=true

RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=agentrocket@vungkiemtien.com
RESEND_TEST_TO_EMAIL=email_test@example.com

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SEPAY_WEBHOOK_TOKEN=
SHEET_ID=
SHEET_NAME=
```

## Lệnh chạy server

```bash
npm install
npm run start
```

Nếu chạy bằng PM2:

```bash
npm install -g pm2
pm2 start server.js --name agentrocket
pm2 save
```

## Cổng lắng nghe

Server đọc cổng từ `PORT`, nếu không có thì dùng `3000`.

```js
process.env.PORT || 3000
```

## Ghi chú dữ liệu

- Không commit `.env`, `resend_config.txt`, `brain.db`, hoặc file backup database.
- Đặt `brain.db` ngoài repo, ví dụ `/opt/agentrocket/brain.db`.
- Với trạng thái hiện tại, không tự động migrate Apps Script/Google Sheets sang SQLite. Public form vẫn gửi về Apps Script; admin VPS đọc/ghi SQLite qua `/api`.
