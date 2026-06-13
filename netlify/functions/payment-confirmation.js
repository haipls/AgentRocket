const { Resend } = require("resend");

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatVND(amount) {
  return new Intl.NumberFormat("vi-VN").format(Number(amount) || 0) + "đ";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return jsonResponse(500, { error: "Missing Resend environment variables" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const customer = payload.customer || {};
  const customerEmail = String(customer.zalo || customer.email || "").trim();

  if (!isValidEmail(customerEmail)) {
    return jsonResponse(200, { ok: true, skipped: true, reason: "No valid customer email" });
  }

  const customerName = String(customer.name || "").trim() || "anh/chị";
  const amountText = formatVND(payload.amount);
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: `AgentRocket <${fromEmail}>`,
      to: [customerEmail],
      subject: `Thông tin thanh toán ${payload.productName || "AgentRocket"}`,
      html: `
        <p>Chào ${escapeHtml(customerName)},</p>
        <p>AgentRocket đã tạo thông tin thanh toán cho đơn hàng của anh/chị.</p>
        <table style="border-collapse:collapse;border:1px solid #e5e7eb;">
          <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Sản phẩm</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(payload.productName)}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Mã đơn</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(payload.orderId)}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Số tiền</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(amountText)}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Ngân hàng</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(payload.bankCode)}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Chủ tài khoản</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(payload.accountHolder)}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Số tài khoản</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(payload.accountNumber)}</td></tr>
          <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Nội dung chuyển khoản</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(payload.transferContent)}</td></tr>
        </table>
        <p>Vui lòng chuyển khoản đúng số tiền và đúng nội dung để hệ thống ghi nhận nhanh hơn.</p>
        <p>Trân trọng,<br>AgentRocket</p>
      `,
      text: [
        `Chào ${customerName},`,
        "",
        "AgentRocket đã tạo thông tin thanh toán cho đơn hàng của anh/chị.",
        `Sản phẩm: ${payload.productName || ""}`,
        `Mã đơn: ${payload.orderId || ""}`,
        `Số tiền: ${amountText}`,
        `Ngân hàng: ${payload.bankCode || ""}`,
        `Chủ tài khoản: ${payload.accountHolder || ""}`,
        `Số tài khoản: ${payload.accountNumber || ""}`,
        `Nội dung chuyển khoản: ${payload.transferContent || ""}`,
        "",
        "Vui lòng chuyển khoản đúng số tiền và đúng nội dung để hệ thống ghi nhận nhanh hơn.",
        "",
        "Trân trọng,",
        "AgentRocket",
      ].join("\n"),
    });

    if (error) {
      return jsonResponse(502, { error });
    }

    return jsonResponse(200, { ok: true, id: data && data.id });
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
};
