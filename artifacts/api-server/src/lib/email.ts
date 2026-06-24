import { Resend } from "resend";

let _resend: Resend | null = null;

export function getResend(): Resend {
  if (!_resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(apiKey);
  }
  return _resend;
}

const TEAM_EMAIL = "info.sitemint@gmail.com";
const FROM_ADDRESS = process.env.RESEND_FROM_EMAIL ?? "SiteMint Digital Solutions <noreply@sitemintdigital.com>";

export interface FormSubmissionData {
  formName: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  service?: string;
  pageUrl?: string;
  ip?: string;
  fields: Record<string, unknown>;
}

function formatFieldValue(val: unknown): string {
  if (val === null || val === undefined || val === "") return "—";
  if (Array.isArray(val)) return val.join(", ") || "—";
  return String(val);
}

function buildTeamEmailHtml(data: FormSubmissionData): string {
  const now = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "full",
    timeStyle: "short",
  });

  const fieldRows = Object.entries(data.fields)
    .map(([k, v]) => {
      const label = k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
      return `<tr><td style="padding:6px 12px;font-weight:600;color:#374151;width:200px;vertical-align:top;">${label}</td><td style="padding:6px 12px;color:#111827;">${formatFieldValue(v)}</td></tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:680px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">
    <div style="background:#1e293b;padding:28px 32px;">
      <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:20px;">
        <svg width="36" height="36" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="40" height="40" rx="9" fill="#1e293b"/>
          <rect width="40" height="40" rx="9" fill="white" fill-opacity="0.08"/>
          <path d="M20 11L29 20L20 29L11 20Z" fill="#34d399" opacity="0.90"/>
          <path d="M20 16L24 20L20 24L16 20Z" fill="#1e293b"/>
          <circle cx="20" cy="13" r="2.5" fill="#34d399"/>
        </svg>
        <span style="color:#ffffff;font-size:20px;font-weight:700;font-family:Georgia,serif;">SiteMint <span style="color:#94a3b8;">Digital</span></span>
      </div>
      <h1 style="color:#ffffff;margin:0 0 4px;font-size:22px;">New Website Inquiry</h1>
      <p style="color:#94a3b8;margin:0;font-size:15px;">${data.formName}</p>
    </div>
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr style="background:#f8fafc;"><td style="padding:6px 12px;font-weight:600;color:#374151;width:200px;">Date &amp; Time</td><td style="padding:6px 12px;color:#111827;">${now} PT</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;color:#374151;">Full Name</td><td style="padding:6px 12px;color:#111827;">${data.name}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 12px;font-weight:600;color:#374151;">Email</td><td style="padding:6px 12px;color:#111827;"><a href="mailto:${data.email}" style="color:#3b82f6;">${data.email}</a></td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;color:#374151;">Phone</td><td style="padding:6px 12px;color:#111827;">${data.phone || "—"}</td></tr>
        <tr style="background:#f8fafc;"><td style="padding:6px 12px;font-weight:600;color:#374151;">Company</td><td style="padding:6px 12px;color:#111827;">${data.company || "—"}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:600;color:#374151;">Service Interested In</td><td style="padding:6px 12px;color:#111827;">${data.service || "—"}</td></tr>
        ${data.ip ? `<tr style="background:#f8fafc;"><td style="padding:6px 12px;font-weight:600;color:#374151;">Visitor IP</td><td style="padding:6px 12px;color:#111827;">${data.ip}</td></tr>` : ""}
        ${data.pageUrl ? `<tr><td style="padding:6px 12px;font-weight:600;color:#374151;">Page URL</td><td style="padding:6px 12px;color:#111827;">${data.pageUrl}</td></tr>` : ""}
      </table>

      <h2 style="font-size:16px;color:#1e293b;margin:0 0 12px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">All Form Fields</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${fieldRows}
      </table>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;">
      SiteMint Digital Solutions · <a href="mailto:info.sitemint@gmail.com" style="color:#3b82f6;">info.sitemint@gmail.com</a> · 949-880-6515
    </div>
  </div>
</body>
</html>`;
}

function buildClientEmailHtml(firstName: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:32px auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1);">
    <div style="background:#1e293b;padding:28px 32px;">
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
      <h1 style="color:#1e293b;font-size:24px;margin:0 0 16px;">Thank You for Reaching Out, ${firstName}!</h1>
      <p style="color:#374151;line-height:1.7;margin:0 0 16px;">
        We have successfully received your submission and our team is currently reviewing your inquiry.
      </p>
      <p style="color:#374151;line-height:1.7;margin:0 0 24px;">
        One of our team members will get back to you as soon as possible, typically within <strong>1 business day</strong>.
      </p>

      <div style="background:#f8fafc;border-left:4px solid #1e293b;padding:20px 24px;border-radius:0 8px 8px 0;margin-bottom:28px;">
        <p style="color:#1e293b;font-weight:700;margin:0 0 12px;font-size:15px;">Our Services</p>
        <ul style="color:#374151;margin:0;padding-left:20px;line-height:2;">
          <li>Website Development</li>
          <li>Web Applications</li>
          <li>CRM Systems</li>
          <li>Automation Solutions</li>
          <li>AI-Powered Business Tools</li>
          <li>SEO &amp; Digital Growth Solutions</li>
        </ul>
      </div>

      <p style="color:#374151;line-height:1.7;margin:0 0 8px;">If your request is urgent, please contact us directly:</p>
      <p style="color:#374151;margin:0 0 4px;"><strong>Phone:</strong> 949-880-6515</p>
      <p style="color:#374151;margin:0 0 28px;"><strong>Email:</strong> <a href="mailto:info.sitemint@gmail.com" style="color:#3b82f6;">info.sitemint@gmail.com</a></p>

      <p style="color:#374151;line-height:1.7;margin:0 0 32px;">Thank you for considering SiteMint Digital.</p>

      <hr style="border:none;border-top:1px solid #e5e7eb;margin-bottom:24px;"/>

      <p style="color:#374151;margin:0 0 4px;font-weight:700;">Best Regards,</p>
      <p style="color:#374151;margin:0 0 2px;">SiteMint Digital Solutions</p>
      <br/>
      <p style="color:#374151;margin:0 0 2px;"><strong>Technical Director</strong> — Claidy Taguran</p>
      <p style="color:#374151;margin:0 0 2px;"><strong>Head of Strategy</strong> — Shasta Greene</p>
      <p style="color:#374151;margin:0;"><strong>Project &amp; Admin Manager</strong> — Saisa Lorraigne</p>
    </div>
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;">
      SiteMint Digital Solutions · <a href="mailto:info.sitemint@gmail.com" style="color:#3b82f6;">info.sitemint@gmail.com</a> · 949-880-6515
    </div>
  </div>
</body>
</html>`;
}

export interface EmailResult {
  teamSent: boolean;
  clientSent: boolean;
  errors: string[];
}

export async function sendFormEmails(data: FormSubmissionData): Promise<EmailResult> {
  const resend = getResend();
  const errors: string[] = [];
  let teamSent = false;
  let clientSent = false;

  const firstName = data.name.split(" ")[0] || data.name;

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: [TEAM_EMAIL],
      subject: `New Website Inquiry - ${data.formName}`,
      html: buildTeamEmailHtml(data),
    });
    teamSent = true;
  } catch (err) {
    errors.push(`Team notification failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: [data.email],
      subject: "Thank You for Contacting SiteMint Digital",
      html: buildClientEmailHtml(firstName),
    });
    clientSent = true;
  } catch (err) {
    errors.push(`Client acknowledgement failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { teamSent, clientSent, errors };
}
