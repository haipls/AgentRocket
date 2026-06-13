const fs = require("fs");
const path = require("path");

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

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function getSiteOrigin(payload, event) {
  if (payload.pageUrl) {
    try {
      return new URL(payload.pageUrl).origin;
    } catch (error) {
      // Ignore malformed pageUrl and fall back to request host.
    }
  }

  const host = event.headers.host || event.headers.Host;
  return host ? `https://${host}` : "https://ar.vungkiemtien.com";
}

function toParagraphHtml(text) {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function buildEmailBody(sequenceNumber, content, links = []) {
  const linkHtml = links
    .map(
      (link) =>
        `<p><a href="${escapeHtml(link.url)}" style="color:#0f766e;font-weight:600;">${escapeHtml(link.label)}</a></p>`
    )
    .join("\n");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
      ${toParagraphHtml(content)}
      ${linkHtml}
      <p style="margin-top:24px;color:#6b7280;font-size:13px;">Email ${sequenceNumber} trong chuỗi AgentRocket AI.</p>
    </div>
  `;
}

function createSequences(origin) {
  const paymentLinks = {
    flowLead: `${origin}/payments/ban-do-flow-lead-thanh-toan.html`,
    challenge: `${origin}/payments/thu-thach-ai-12-ngay-thanh-toan.html`,
    dfy: `${origin}/payments/dfy-thanh-toan.html`,
  };

  return [
    {
      sequenceNumber: 1,
      subject: "Cảm ơn anh/chị đã để lại thông tin",
      content: `Chào anh/chị,

Mình là đội AgentRocket AI.

Mình làm một việc khá rõ: giúp chủ SME nhìn lại flow lead, sales và follow-up trước khi đưa AI vào vận hành thật.

Không cần phức tạp.

Nhiều khi vấn đề không nằm ở việc thiếu công cụ. Vấn đề nằm ở chỗ lead vào rồi không ai biết bước tiếp theo là gì, ai xử lý, lưu dữ liệu ở đâu và follow-up khi nào.

Trong vài ngày tới, mình sẽ gửi anh/chị vài chia sẻ ngắn. Không phải để bán hàng ngay. Mà để anh/chị nhìn rõ hơn hệ thống bán hàng hiện tại đang kẹt ở đâu.

Nếu flow rõ hơn, AI mới có chỗ để phát huy.

Hẹn gặp anh/chị ở email sau.

AgentRocket AI`,
    },
    {
      sequenceNumber: 2,
      subject: "Một flow tốt thường bắt đầu từ điểm rất nhỏ",
      delayDays: 2,
      content: `Chào anh/chị,

Có một thứ mình để ý.

Nhiều hệ thống bán hàng không hỏng vì thiếu AI. Chúng hỏng vì thiếu điểm kiểm soát.

Ví dụ đơn giản thôi.

Một khách để lại thông tin. Nhưng sau đó không ai chắc:

- lead đến từ đâu;
- ai sẽ xử lý;
- cần hỏi thêm thông tin gì;
- dữ liệu được lưu ở đâu;
- nếu khách chưa mua thì follow-up vào lúc nào.

Nhìn từng việc thì nhỏ. Nhưng khi ghép lại, đó là cả một flow sales.

Và thật ra, chatbot, form, sheet hay AI Agent chỉ nên xuất hiện sau khi flow đó đã rõ.

Nếu chưa rõ flow, tự động hóa chỉ làm một quy trình rối chạy nhanh hơn.

Một câu hỏi nhỏ anh/chị có thể tự rà soát hôm nay:

“Khi có một lead mới, bước tiếp theo có đang rõ đến mức người khác làm thay mình được không?”

Nếu câu trả lời là chưa, đó là điểm nên sửa trước.

Không cần làm lớn. Chỉ cần làm rõ một đoạn flow.

AgentRocket AI`,
    },
    {
      sequenceNumber: 3,
      subject: "Nếu anh/chị muốn làm phần này bài bản hơn",
      delayDays: 3,
      content: `Chào anh/chị,

Ở email trước, mình có nói về một điểm: hệ thống tốt không bắt đầu từ công cụ. Nó bắt đầu từ flow rõ.

Đó cũng là lý do AgentRocket AI có 3 lựa chọn, tùy mức anh/chị đang cần.

Nếu anh/chị muốn tự rà lại nhanh trong 20-30 phút, bắt đầu bằng Bản Đồ Flow Lead 1 Trang.

Đây là một file PDF ngắn giúp anh/chị nhìn lại flow lead của mình: lead vào từ đâu, ai xử lý, hỏi gì, lưu dữ liệu nào và follow-up khi nào.

Anh/chị sẽ có:

- khung 5 bước để vẽ lại đường đi của lead;
- bảng điền nhanh cho người phụ trách, dữ liệu cần lưu và điểm kiểm soát;
- checklist trước khi đưa AI vào flow;
- một prompt mẫu để nhờ AI rà lại flow lead;
- file PDF một trang, dễ in ra hoặc gửi cho đội sales cùng rà.

Nếu anh/chị muốn đi sâu hơn và tự dựng bản hệ thống đầu tiên, chọn Thử Thách AI 12 Ngày Tạo Hệ Thống Bán Hàng Của Riêng Bạn.

Trong 12 ngày, anh/chị sẽ nhìn lại flow sales, chọn đúng một đoạn việc lặp lại để tự động hóa trước, tạo cấu trúc nhận lead, hỏi thông tin, phân loại và nhắc follow-up.

Mục tiêu không phải học AI cho nhiều. Mục tiêu là biết nên tự động hóa đoạn nào trước.

Nếu anh/chị đã nói chuyện xong, đã rõ phạm vi và muốn bên mình cấu hình giúp flow đầu tiên, chọn Agent Rocket Sales - Done For You.

Gói này dành cho doanh nghiệp muốn có một hệ thống sales tự động ở mức vừa đủ để chạy thật: lead vào đâu, ai xử lý, hỏi gì, lưu ở đâu và follow-up khi nào.

Bên mình sẽ chốt flow đầu tiên, cấu hình phần tự động hóa có thể chạy ngay, kiểm tra vận hành và hướng dẫn để anh/chị hiểu hệ thống đang chạy ra sao.

Đơn giản thôi.

Nếu anh/chị chưa rõ flow, bắt đầu bằng bản PDF.

Nếu muốn tự làm có hướng dẫn, đi với thử thách 12 ngày.

Nếu muốn có người dựng cùng từ đầu, chọn Done For You.

Thử chọn đúng mức mình đang cần. Flow rõ hơn thì việc đưa AI vào vận hành sẽ nhẹ hơn rất nhiều.

AgentRocket AI`,
      links: [
        { label: "Thanh toán Bản Đồ Flow Lead 1 Trang", url: paymentLinks.flowLead },
        { label: "Thanh toán Thử Thách AI 12 Ngày", url: paymentLinks.challenge },
        { label: "Thanh toán Agent Rocket Sales - Done For You", url: paymentLinks.dfy },
      ],
    },
  ];
}

async function sendResendEmail(apiKey, message) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = body.message || body.error || `Resend error ${response.status}`;
    throw new Error(detail);
  }

  return body;
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

  const lead = payload.lead || {};
  const customerEmail = String(lead.email || "").trim();

  if (!isValidEmail(customerEmail)) {
    return jsonResponse(200, { ok: true, skipped: true, reason: "No valid customer email" });
  }

  const now = new Date();
  const origin = getSiteOrigin(payload, event);
  const isTestMode = customerEmail.toLowerCase().includes("+test");
  const sequences = createSequences(origin);

  try {
    const results = [];

    for (const sequence of sequences) {
      const scheduledAt = !isTestMode && sequence.delayDays
        ? addDays(now, sequence.delayDays).toISOString()
        : undefined;
      const message = {
        from: `AgentRocket <${fromEmail}>`,
        to: [customerEmail],
        subject: sequence.subject,
        html: buildEmailBody(sequence.sequenceNumber, sequence.content, sequence.links),
        text: [
          sequence.content,
          ...(sequence.links || []).map((link) => `${link.label}: ${link.url}`),
        ].join("\n\n"),
        tags: [
          { name: "source", value: "waitlist" },
          { name: "sequence", value: `email_${sequence.sequenceNumber}` },
        ],
      };

      if (scheduledAt) {
        message.scheduledAt = scheduledAt;
      }

      const data = await sendResendEmail(apiKey, message);
      results.push({
        sequenceNumber: sequence.sequenceNumber,
        id: data.id,
        scheduledAt: scheduledAt || null,
      });
    }

    return jsonResponse(200, {
      ok: true,
      testMode: isTestMode,
      emails: results,
    });
  } catch (error) {
    return jsonResponse(500, { error: error.message });
  }
};
