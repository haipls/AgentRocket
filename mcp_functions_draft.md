# MCP Functions Draft cho Telegram AgentRocket

## 1. `get_daily_business_summary`

- **Input params**
  - `date`: `string` - ngày cần xem theo định dạng `YYYY-MM-DD`, mặc định nên là hôm nay theo GMT+7.
  - `source`: `string` - nguồn dữ liệu, giai đoạn đầu cố định là `google_sheets`.
- **Output dự kiến**
  - Tổng số lead mới.
  - Số lead theo trạng thái/chất lượng nếu có.
  - Số đơn mới, đơn pending payment, đơn paid.
  - Tổng doanh thu đã thanh toán.
  - Danh sách 3-5 việc cần chú ý nhất trong ngày.
- **Tình huống dùng hàng ngày**
  - Mỗi sáng hỏi Telegram: "Hôm nay tình hình AgentRocket thế nào?" để có bản tóm tắt vận hành trong 30 giây.
- **Độ ưu tiên**: 5

## 2. `list_new_leads`

- **Input params**
  - `from_date`: `string` - ngày bắt đầu, định dạng `YYYY-MM-DD`.
  - `to_date`: `string` - ngày kết thúc, định dạng `YYYY-MM-DD`.
  - `status`: `string` - trạng thái lead cần lọc, ví dụ `qualified`, `all`.
  - `limit`: `number` - số lead tối đa trả về.
- **Output dự kiến**
  - Danh sách lead gồm `lead_id`, họ tên, doanh nghiệp, số điện thoại, email/Zalo, ngành, quy mô, lead/tháng, vấn đề chính, ROI ròng ước tính, kênh lead, nơi lưu lead, tác vụ AI ưu tiên, URL trang.
  - Tổng số lead khớp điều kiện.
- **Tình huống dùng hàng ngày**
  - Khi có lead mới hoặc cuối ngày, hỏi "Có lead nào mới hôm nay không?" để gọi/chăm sóc ngay.
- **Độ ưu tiên**: 5

## 3. `get_payment_and_order_status`

- **Input params**
  - `order_id`: `string` - mã đơn cần kiểm tra, ví dụ `O...`; có thể để trống nếu muốn xem danh sách.
  - `status`: `string` - trạng thái cần lọc, ví dụ `pending_payment`, `paid`, `processing`, `done`, `cancelled`, `all`.
  - `limit`: `number` - số đơn tối đa trả về.
- **Output dự kiến**
  - Nếu có `order_id`: trả trạng thái đơn, khách hàng, sản phẩm, số tiền, nội dung chuyển khoản, ngày mua, ngày thanh toán, gateway, mã giao dịch.
  - Nếu không có `order_id`: trả danh sách đơn theo trạng thái và tổng tiền.
- **Tình huống dùng hàng ngày**
  - Khi khách nhắn "em chuyển khoản rồi", hỏi Telegram mã đơn để kiểm tra paid/pending và đối soát nhanh.
- **Độ ưu tiên**: 5

## 4. `mark_followup_task`

- **Input params**
  - `target_type`: `string` - loại đối tượng, ví dụ `lead`, `customer`, `order`.
  - `target_id`: `string` - mã lead/customer/order.
  - `note`: `string` - nội dung cần follow-up.
  - `due_at`: `string` - thời điểm nhắc lại theo ISO hoặc `YYYY-MM-DD HH:mm`.
  - `assignee`: `string` - người phụ trách, ví dụ `owner`, `sales`, tên nhân sự.
- **Output dự kiến**
  - Xác nhận đã tạo/cập nhật việc follow-up.
  - Thông tin target, deadline, người phụ trách, ghi chú.
  - Cảnh báo nếu target không tồn tại hoặc thiếu thông tin liên hệ.
- **Tình huống dùng hàng ngày**
  - Sau khi đọc một lead mới, nhắn Telegram "nhắc tôi gọi lại lead này chiều mai" để không bỏ sót follow-up.
- **Độ ưu tiên**: 4

## 5. `run_agentrocket_health_check`

- **Input params**
  - `check_scope`: `string` - phạm vi kiểm tra, ví dụ `all`, `website`, `admin`, `email`, `apps_script`, `database`.
  - `include_logs`: `boolean` - có lấy log lỗi gần nhất hay không.
- **Output dự kiến**
  - Trạng thái website public `rocket.vungkiemtien.com`.
  - Trạng thái service `agentrocket`.
  - Trạng thái Caddy.
  - Kiểm tra admin/API đọc được database.
  - Kiểm tra Apps Script URL có phản hồi.
  - Kiểm tra cấu hình Resend có tồn tại.
  - Nếu lỗi, trả nguyên nhân ngắn và bước xử lý đề xuất.
- **Tình huống dùng hàng ngày**
  - Khi thấy form/email/admin bất thường, hỏi Telegram "kiểm tra hệ thống AgentRocket" để biết lỗi nằm ở website, Caddy, Apps Script, email hay database.
- **Độ ưu tiên**: 4

## Ghi chú triển khai

- Nguồn dữ liệu thật cho 3 function đầu tiên là Apps Script/Google Sheets, vì public lead/payment đang ghi dữ liệu ở đó.
- MCP server Node sẽ gọi Apps Script Web App bằng action bảo vệ token, không đọc `brain.db` cho 3 function đầu tiên.
- `brain.db` vẫn giữ cho admin VPS/local, nhưng chưa dùng làm nguồn dữ liệu chính cho Telegram MCP.
- Ba function nên build đầu tiên: `get_daily_business_summary`, `list_new_leads`, `get_payment_and_order_status`.
- Apps Script cần expose các action đọc dữ liệu: `get_daily_business_summary`, `list_new_leads`, `get_payment_and_order_status`.
