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

function readField(source, key) {
  return source && source[key] ? String(source[key]) : "";
}

function buildRows(items) {
  return items
    .filter((item) => item.value)
    .map(
      (item) =>
        `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:600;">${escapeHtml(item.label)}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${escapeHtml(item.value)}</td></tr>`
    )
    .join("");
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const notifyEmail = process.env.RESEND_LEAD_NOTIFY_EMAIL;

  if (!apiKey || !fromEmail || !notifyEmail) {
    return jsonResponse(500, { error: "Missing Resend environment variables" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const lead = payload.lead || {};
  const survey = payload.survey || {};
  const roi = payload.roi || {};
  const company = readField(lead, "company") || "Lead mới";
  const submittedAt = payload.submittedAt || new Date().toISOString();

  const leadRows = buildRows([
    { label: "Lead ID", value: payload.leadId },
    { label: "Thời điểm", value: submittedAt },
    { label: "Công ty", value: readField(lead, "company") },
    { label: "Ngành", value: readField(lead, "industry") },
    { label: "Quy mô", value: readField(lead, "size") },
    { label: "Doanh thu", value: readField(lead, "revenue") },
    { label: "Số lead/tháng", value: readField(lead, "leads") },
    { label: "Tên liên hệ", value: readField(lead, "name") },
    { label: "Email/Zalo", value: readField(lead, "email") },
    { label: "Số điện thoại", value: readField(lead, "phone") },
    { label: "Vấn đề chính", value: readField(lead, "pain") },
    { label: "Trang gửi form", value: payload.pageUrl },
  ]);

  const surveyRows = buildRows([
    { label: "Kênh lead", value: survey.leadChannel },
    { label: "Nơi lưu lead", value: survey.leadStorage },
    { label: "Tác vụ AI đầu tiên", value: survey.firstAiTask },
    { label: "Mức sẵn sàng", value: survey.readiness },
  ]);

  const roiRows = buildRows([
    { label: "Tiết kiệm ước tính", value: roi.savingEstimated },
    { label: "Doanh thu tăng thêm ước tính", value: roi.revenueEstimated },
    { label: "ROI ròng ước tính", value: roi.netRoiEstimated },
  ]);

  const html = `
    <h2>Lead mới từ AgentRocket</h2>
    <p>Có lead mới vừa gửi form trên website.</p>
    <h3>Thông tin lead</h3>
    <table style="border-collapse:collapse;border:1px solid #e5e7eb;">${leadRows}</table>
    <h3>Khảo sát flow</h3>
    <table style="border-collapse:collapse;border:1px solid #e5e7eb;">${surveyRows}</table>
    <h3>ROI calculator</h3>
    <table style="border-collapse:collapse;border:1px solid #e5e7eb;">${roiRows}</table>
  `;

  const text = [
    "Lead mới từ AgentRocket",
    `Lead ID: ${payload.leadId || ""}`,
    `Thời điểm: ${submittedAt}`,
    `Công ty: ${readField(lead, "company")}`,
    `Tên liên hệ: ${readField(lead, "name")}`,
    `Email/Zalo: ${readField(lead, "email")}`,
    `Số điện thoại: ${readField(lead, "phone")}`,
    `Vấn đề chính: ${readField(lead, "pain")}`,
    `Trang gửi form: ${payload.pageUrl || ""}`,
  ].join("\n");

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: `AgentRocket <${fromEmail}>`,
      to: [notifyEmail],
      subject: `Lead mới từ website: ${company}`,
      html,
      text,
      replyTo: readField(lead, "email") || undefined,
    });

    if (error) {
      return jsonResponse(502, { error });
    }

    return jsonResponse(200, { ok: true, id: data && data.id });
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
};
