# AgentRocket Landing Page

Website tĩnh dùng Netlify để deploy, Netlify Functions để gửi email qua Resend, và Apps Script + Google Sheets để lưu dữ liệu lead/thanh toán/admin.

## Yêu cầu môi trường

- Node.js 18+.
- Netlify project đã kết nối GitHub.
- Domain gửi email đã verify trong Resend.
- Apps Script web app đang hoạt động.

## Biến môi trường trên Netlify

Thiết lập trong Netlify:

```text
RESEND_API_KEY=...
RESEND_FROM_EMAIL=agentrocket@vungkiemtien.com
RESEND_TEST_TO_EMAIL=...
```

Không đưa API key hoặc token vào file JavaScript public.

## Cấu hình local

Tạo file `.env` từ `.env.example` nếu cần lưu token local. File `.env` đã được `.gitignore`.

Admin token không còn hardcode trong `admin/admin-config.js`. Khi vào trang admin, mở URL dạng:

```text
https://ar.vungkiemtien.com/admin/?token=ADMIN_TOKEN_CUA_BAN
```

Sau lần đầu, token được lưu trong `localStorage` của trình duyệt.

## Deploy Netlify

Netlify dùng cấu hình trong `netlify.toml`:

```text
Build command: npm run build
Publish directory: .
Functions directory: netlify/functions
```

Quy trình deploy:

```powershell
git status
git add .
git commit -m "Mô tả thay đổi"
git push
```

Sau khi push, kiểm tra Netlify Deploys. Deploy hợp lệ phải có trạng thái `Published`.

## Kiểm tra sau deploy

1. Submit form waitlist bằng email có `+test` để nhận đủ 3 email ngay.
2. Tạo đơn thanh toán hoặc order admin theo luồng cần kiểm tra.
3. Kiểm tra sender email là domain riêng, ví dụ `agentrocket@vungkiemtien.com`.
4. Kiểm tra Apps Script/Google Sheets vẫn ghi dữ liệu đúng.

## Lưu ý bảo mật

- Không commit `.env`, `resend_config.txt`, API key, password hoặc token.
- Nếu token từng bị commit vào GitHub public, hãy rotate token trong Apps Script.
- Apps Script URL đang nằm trong frontend vì đây là endpoint client gọi trực tiếp. Logic bảo mật phải nằm trong Apps Script.
