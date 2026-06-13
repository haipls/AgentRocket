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

  const lead = payload.lead || {};
  const customerEmail = String(lead.email || "").trim();

  if (!isValidEmail(customerEmail)) {
    return jsonResponse(200, { ok: true, skipped: true, reason: "No valid customer email" });
  }

  const customerName = String(lead.name || "").trim();
  const greetingName = customerName || "anh/chị";
  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: `AgentRocket <${fromEmail}>`,
      to: [customerEmail],
      subject: "AgentRocket đã nhận thông tin của anh/chị",
      html: `
        <p>Chào ${escapeHtml(greetingName)},</p>
        <p>AgentRocket đã nhận được thông tin đăng ký rà soát flow AI Agent đầu tiên của anh/chị.</p>
        <p>Đội ngũ sẽ xem trước thông tin và liên hệ lại qua kênh phù hợp để trao đổi bước tiếp theo.</p>
        <p>Trân trọng,<br>AgentRocket</p>
      `,
      text: [
        `Chào ${greetingName},`,
        "",
        "AgentRocket đã nhận được thông tin đăng ký rà soát flow AI Agent đầu tiên của anh/chị.",
        "Đội ngũ sẽ xem trước thông tin và liên hệ lại qua kênh phù hợp để trao đổi bước tiếp theo.",
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
