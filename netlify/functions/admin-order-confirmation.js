const fs = require("fs");
const path = require("path");
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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function loadConfigValue(key) {
  if (process.env[key]) {
    return process.env[key];
  }

  const configPath = path.join(process.cwd(), "resend_config.txt");
  if (!fs.existsSync(configPath)) {
    return "";
  }

  const content = fs.readFileSync(configPath, "utf8");
  const line = content
    .split(/\r?\n/)
    .find((item) => item.trim().startsWith(`${key}=`));

  return line ? line.slice(line.indexOf("=") + 1).trim() : "";
}

function formatVND(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + "đ";
}

function productTypeLabel(type) {
  return {
    physical: "sản phẩm vật lý",
    digital: "sản phẩm số",
    service: "dịch vụ",
  }[type] || "sản phẩm";
}

function deliveryInstruction(product) {
  if (product.product_type === "digital") {
    return "Với sản phẩm số, anh/chị sẽ nhận tài liệu hoặc link truy cập qua email/kênh liên hệ đã để lại. Nếu cần kiểm tra thêm thông tin đơn, đội ngũ sẽ nhắn lại trước khi gửi.";
  }

  if (product.product_type === "physical") {
    return "Với sản phẩm vật lý, đội ngũ sẽ liên hệ để xác nhận thông tin nhận hàng trước khi gửi. Không cần phức tạp, mình chỉ cần chắc đúng người, đúng địa chỉ.";
  }

  return "Với dịch vụ, đội ngũ sẽ liên hệ để chốt bước tiếp theo: phạm vi, lịch làm việc và phần cần chuẩn bị. Mục tiêu là đi từ flow thật của anh/chị, không dựng một thứ xa thực tế.";
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = loadConfigValue("RESEND_API_KEY");
  const fromEmail = loadConfigValue("RESEND_FROM_EMAIL");

  if (!apiKey || !fromEmail) {
    return jsonResponse(500, { error: "Missing Resend configuration" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const customer = payload.customer || {};
  const product = payload.product || {};
  const order = payload.order || {};
  const customerEmail = String(customer.zalo || customer.email || "").trim();

  if (!isValidEmail(customerEmail)) {
    return jsonResponse(200, { ok: true, skipped: true, reason: "No valid customer email" });
  }

  const customerName = String(customer.name || "").trim() || "anh/chị";
  const productName = product.name || order.product_name || "sản phẩm AgentRocket";
  const amountText = formatVND(order.amount || product.price);
  const instruction = deliveryInstruction(product);
  const productType = productTypeLabel(product.product_type);
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: `AgentRocket <${fromEmail}>`,
      to: [customerEmail],
      subject: `AgentRocket xác nhận đơn hàng: ${productName}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
          <p>Chào ${escapeHtml(customerName)},</p>
          <p>AgentRocket đã ghi nhận đơn hàng của anh/chị.</p>
          <p>Thông tin đơn hàng:</p>
          <table style="border-collapse:collapse;border:1px solid #e5e7eb;">
            <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Sản phẩm</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(productName)}</td></tr>
            <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Loại</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(productType)}</td></tr>
            <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Số tiền</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(amountText)}</td></tr>
            <tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">Trạng thái</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(order.order_status || "new")}</td></tr>
          </table>
          <p>${escapeHtml(instruction)}</p>
          <p>Thật ra, phần quan trọng không phải là mua thêm một công cụ. Phần quan trọng là anh/chị có một bước tiếp theo rõ ràng hơn cho flow của mình.</p>
          <p>Cảm ơn anh/chị đã tin AgentRocket.</p>
          <p>AgentRocket AI</p>
        </div>
      `,
      text: [
        `Chào ${customerName},`,
        "",
        "AgentRocket đã ghi nhận đơn hàng của anh/chị.",
        "",
        `Sản phẩm: ${productName}`,
        `Loại: ${productType}`,
        `Số tiền: ${amountText}`,
        `Trạng thái: ${order.order_status || "new"}`,
        "",
        instruction,
        "",
        "Thật ra, phần quan trọng không phải là mua thêm một công cụ. Phần quan trọng là anh/chị có một bước tiếp theo rõ ràng hơn cho flow của mình.",
        "",
        "Cảm ơn anh/chị đã tin AgentRocket.",
        "",
        "AgentRocket AI",
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
