# Cấu trúc project

## Root

- `index.html`: landing page chính của AgentRocket AI.
- `_redirects`: redirect URL cũ sang cấu trúc thư mục mới khi deploy trên Netlify.

## `assets/`

- `assets/css/styles.css`: CSS dùng chung cho landing page và trang thanh toán.
- `assets/js/app.js`: logic landing page, form lead, ROI, chatbot.
- `assets/js/lead-config.js`: cấu hình webhook lead.
- `assets/js/payment-config.js`: cấu hình Apps Script cho luồng thanh toán.
- `assets/js/payment-sync.js`: tạo đơn pending và kiểm tra trạng thái thanh toán qua Apps Script.

## `payments/`

- `payments/ban-do-flow-lead-thanh-toan.html`: trang thanh toán sản phẩm Bản Đồ Flow Lead 1 Trang.
- `payments/thanh-toan.html`: trang thanh toán phí cấu hình khởi động.
- `payments/dfy-thanh-toan.html`: trang thanh toán gói Done For You.
- `payments/thu-thach-ai-12-ngay-thanh-toan.html`: trang thanh toán Thử Thách AI 12 Ngày.

## `products/`

- `products/flow-lead/ban-do-flow-lead-1-trang.pdf`: file PDF sản phẩm.
- `products/flow-lead/ban-do-flow-lead-1-trang.html`: file nguồn HTML dùng để xuất PDF.

## `admin/`

- `admin/index.html`: giao diện admin.
- `admin/admin.css`: CSS riêng cho admin.
- `admin/admin.js`: logic admin đọc/ghi dữ liệu qua Apps Script.
- `admin/admin-config.js`: cấu hình Apps Script URL cho admin.

## `integrations/`

- `integrations/google-apps-script.js`: mã Apps Script dùng cho lead, admin, đơn hàng và SePay webhook.

## `tools/`

- `tools/admin_server.py`: server local hỗ trợ chạy/admin trong môi trường phát triển.

## Đã bỏ

- `netlify/`, `netlify.toml`, `package.json`: luồng Netlify Functions thử nghiệm, không dùng vì thanh toán đi theo Apps Script/Google Sheets.
- `__pycache__/`: cache Python sinh tự động, không cần giữ trong project.
