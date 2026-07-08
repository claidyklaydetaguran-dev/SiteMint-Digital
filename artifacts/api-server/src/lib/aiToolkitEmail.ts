import { getResend } from "./email.js";

const FROM_ADDRESS = process.env["RESEND_FROM_EMAIL"] ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>";

function buildDeliveryEmailHtml(downloadUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0b1220;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#111a2e;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">
    <div style="background:#0f1729;padding:32px;text-align:center;">
      <div style="display:inline-flex;align-items:center;gap:10px;">
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="9" fill="#1e293b"/>
          <rect width="40" height="40" rx="9" fill="white" fill-opacity="0.08"/>
          <path d="M20 11L29 20L20 29L11 20Z" fill="#34d399" opacity="0.90"/>
          <path d="M20 16L24 20L20 24L16 20Z" fill="#1e293b"/>
          <circle cx="20" cy="13" r="2.5" fill="#34d399"/>
        </svg>
        <span style="color:#ffffff;font-size:20px;font-weight:700;font-family:Georgia,serif;">SiteMint <span style="color:#94a3b8;">Digital</span></span>
      </div>
    </div>
    <div style="padding:36px 32px;">
      <h1 style="color:#ffffff;font-size:24px;margin:0 0 16px;">Your SMB AI Toolkit is ready 🎉</h1>
      <p style="color:#cbd5e1;line-height:1.7;margin:0 0 24px;">
        Thanks for your purchase! Your 50+ ready-to-use AI prompts for marketing,
        sales, customer service, operations, and finance are ready to download.
      </p>
      <div style="text-align:center;margin:0 0 28px;">
        <a href="${downloadUrl}" style="display:inline-block;background:#34d399;color:#0b1220;font-weight:700;padding:14px 28px;border-radius:8px;text-decoration:none;">
          Download Your AI Toolkit
        </a>
      </div>
      <p style="color:#94a3b8;line-height:1.7;margin:0 0 8px;font-size:14px;">
        If the button doesn't work, copy and paste this link into your browser:
      </p>
      <p style="color:#60a5fa;word-break:break-all;font-size:13px;margin:0 0 28px;">${downloadUrl}</p>
      <p style="color:#cbd5e1;line-height:1.7;margin:0 0 8px;">
        Every prompt is written to work directly in ChatGPT, Claude, or Gemini —
        just fill in the [brackets] and go.
      </p>
      <p style="color:#cbd5e1;line-height:1.7;margin:0 0 28px;">
        Questions, or want us to build custom AI workflows for your business?
        Reach out any time at
        <a href="mailto:info.sitemint@gmail.com" style="color:#60a5fa;">info.sitemint@gmail.com</a>.
      </p>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin-bottom:20px;"/>
      <p style="color:#64748b;font-size:12px;margin:0;">SiteMint Digital Solutions</p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendAiToolkitDeliveryEmail(params: {
  to: string;
  downloadUrl: string;
}): Promise<void> {
  const resend = getResend();
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: [params.to],
    subject: "Your SMB AI Toolkit is ready to download",
    html: buildDeliveryEmailHtml(params.downloadUrl),
  });
}
