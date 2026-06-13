const { Resend } = require("resend");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "Missing Resend environment variables" }),
    };
  }

  const resend = new Resend(apiKey);
  const sentAt = new Date().toISOString();

  try {
    const { data, error } = await resend.emails.send({
      from: `AgentRocket <${fromEmail}>`,
      to: [fromEmail],
      subject: "AgentRocket Resend test",
      html: `<p>Email test từ AgentRocket đã gửi thành công qua Resend.</p><p>Thời điểm: ${sentAt}</p>`,
      text: `Email test từ AgentRocket đã gửi thành công qua Resend.\nThời điểm: ${sentAt}`,
    });

    if (error) {
      return {
        statusCode: 502,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error }),
      };
    }

    return {
      statusCode: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true, id: data && data.id }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
