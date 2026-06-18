import type { DiscoverySubmission } from "@workspace/db";

type FormData = Record<string, unknown>;

// ── Display helpers ────────────────────────────────────────────────────────────

const BUDGET_LABELS: Record<string, string> = {
  "under1k": "Under $1,000",
  "1k-2.5k": "$1,000 – $2,500",
  "2.5k-5k": "$2,500 – $5,000",
  "5k-10k": "$5,000 – $10,000",
  "10k-plus": "$10,000+",
};

const TIMELINE_LABELS: Record<string, string> = {
  "asap": "ASAP",
  "30-days": "Within 30 Days",
  "60-days": "Within 60 Days",
  "90-days": "Within 90 Days",
  "flexible": "Flexible",
};

const SERVICE_LABELS: Record<string, string> = {
  "new-website": "New Website",
  "redesign": "Website Redesign",
  "web-app": "Web Application",
  "crm": "CRM Development",
  "seo": "SEO Services",
  "blog": "Blog Content",
  "maintenance": "Maintenance & Support",
  "automation": "AI Automation",
  "consultation": "Consultation",
};

const DECISION_LABELS: Record<string, string> = {
  "just-me": "Just Me",
  "business-partner": "Business Partner",
  "board": "Board of Directors",
  "marketing-team": "Marketing Team",
  "other": "Other",
};

function labelBudget(v: string): string { return BUDGET_LABELS[v] || v; }
function labelTimeline(v: string): string { return TIMELINE_LABELS[v] || v; }
function labelDecision(v: string): string { return DECISION_LABELS[v] || v; }
function labelServices(arr: string[]): string {
  return arr.map(s => SERVICE_LABELS[s] || s).join(", ");
}

// ── Lead Scoring ──────────────────────────────────────────────────────────────

export function calculateLeadScore(data: FormData): number {
  let raw = 0;

  // Budget (max 3)
  raw += ({ "under1k": 1, "1k-2.5k": 1, "2.5k-5k": 2, "5k-10k": 3, "10k-plus": 3 } as Record<string, number>)[data.budget as string] || 0;

  // Timeline (max 3)
  raw += ({ "asap": 3, "30-days": 2, "60-days": 1, "90-days": 1, "flexible": 0 } as Record<string, number>)[data.timeline as string] || 0;

  // Decision maker (max 3)
  raw += ({ "just-me": 3, "business-partner": 2, "board": 1, "marketing-team": 2, "other": 1 } as Record<string, number>)[data.decisionMaker as string] || 0;

  // Pain indicators (max 2)
  const text = JSON.stringify(data).toLowerCase();
  const painKeywords = ["frustrat", "lost revenue", "wasted time", "behind competitor", "poor customer", "inefficien", "urgent", "asap", "struggling"];
  if (painKeywords.some(k => text.includes(k))) raw += 2;

  // Normalize to 1–10 (max raw = 11)
  return Math.min(10, Math.max(1, Math.round((raw / 11) * 10)));
}

// ── CRM Tags ──────────────────────────────────────────────────────────────────

export function calculateTags(data: FormData, score: number): string[] {
  const tags: string[] = [];
  const services = (data.services as string[]) || [];
  const features = [
    ...((data.marketingFeatures as string[]) || []),
    ...((data.salesFeatures as string[]) || []),
    ...((data.membershipFeatures as string[]) || []),
    ...((data.automationFeatures as string[]) || []),
  ];

  // Service tags
  if (services.some(s => ["new-website", "redesign"].includes(s))) tags.push("Website Lead");
  if (services.includes("web-app")) tags.push("Web App Lead");
  if (services.includes("crm") || features.includes("crm-integration")) tags.push("CRM Lead");
  if (services.includes("seo")) tags.push("SEO Lead");
  if (services.includes("automation") || features.includes("ai-chatbot") || features.includes("workflow-automation")) tags.push("AI Automation Lead");
  if (services.includes("maintenance")) tags.push("Maintenance Lead");
  if (services.includes("blog")) tags.push("Blog/Content Lead");

  // Industry
  if (data.industry === "Nonprofit") { tags.push("Nonprofit"); tags.push("Mission Driven"); }
  if (data.industry === "Real Estate") tags.push("Real Estate");
  if (data.industry === "Medical") tags.push("Medical");

  // Budget
  if (["5k-10k", "10k-plus"].includes(data.budget as string)) tags.push("High Budget");
  if (["under1k", "1k-2.5k"].includes(data.budget as string)) tags.push("Cost Conscious");

  // Heat
  if (score >= 8) tags.push("Hot Lead");
  else if (score >= 5) tags.push("Warm Lead");
  else tags.push("Cold Lead");

  // Timeline
  if (["asap", "30-days"].includes(data.timeline as string)) tags.push("Urgent Project");

  // Motivation
  const textLower = JSON.stringify(data).toLowerCase();
  if (textLower.includes("grow") || textLower.includes("scale") || textLower.includes("expand")) tags.push("Growth Focused");
  if (features.includes("online-payments") || features.includes("product-catalog")) tags.push("E-commerce Interest");

  return [...new Set(tags)];
}

// ── Recommended Package ───────────────────────────────────────────────────────

export function recommendPackage(data: FormData): string {
  const services = (data.services as string[]) || [];
  const features = [
    ...((data.marketingFeatures as string[]) || []),
    ...((data.salesFeatures as string[]) || []),
    ...((data.membershipFeatures as string[]) || []),
    ...((data.automationFeatures as string[]) || []),
  ];
  const premium = ["web-app", "crm", "automation"];
  const premiumFeatures = ["ai-chatbot", "workflow-automation", "user-login", "member-dashboard", "subscription-plans"];
  const growthFeatures = ["crm-integration", "appointment-scheduling", "online-payments", "email-automation"];

  if (
    ["5k-10k", "10k-plus"].includes(data.budget as string) ||
    services.some(s => premium.includes(s)) ||
    features.some(f => premiumFeatures.includes(f))
  ) return "Premium";

  if (
    ["2.5k-5k", "5k-10k"].includes(data.budget as string) ||
    services.includes("seo") ||
    services.includes("blog") ||
    features.some(f => growthFeatures.includes(f))
  ) return "Growth";

  return "Essential";
}

// ── Proposal Generator ────────────────────────────────────────────────────────

export function generateProposal(submission: DiscoverySubmission): string {
  const d = submission.formData as FormData;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const services = (d.services as string[]) || [];
  const goals = (d.projectGoals as string[]) || [];
  const pkg = submission.recommendedPackage || "Growth";

  const primaryService = services.length > 0 ? labelServices(services) : "website development";

  const goalStr = goals.length > 0
    ? goals.map(g => g.replace(/-/g, " ")).join(", ")
    : "grow their online presence";

  const challenges: string[] = [];
  if (d.websiteFrustrations) challenges.push(String(d.websiteFrustrations));
  if (d.websiteMissing) challenges.push(String(d.websiteMissing));
  if (d.biggestFrustration) challenges.push(String(d.biggestFrustration));
  while (challenges.length < 3) challenges.push(
    "Limited online visibility making it difficult to reach ideal customers",
    "Website not aligned with current brand and business goals",
    "Lack of automated systems resulting in manual, time-consuming processes"
  );

  const allFeatures = [
    ...((d.marketingFeatures as string[]) || []),
    ...((d.salesFeatures as string[]) || []),
    ...((d.membershipFeatures as string[]) || []),
    ...((d.automationFeatures as string[]) || []),
    ...((d.otherFeatures as string[]) || []),
  ];
  const integrations = (d.integrations as string[]) || [];

  const hasWebApp = services.includes("web-app");
  const hasSEO = services.includes("seo") || services.includes("blog");
  const hasAutomation = services.includes("automation") || allFeatures.some(f => ["ai-chatbot", "workflow-automation", "email-automation"].includes(f));
  const hasMembership = allFeatures.some(f => ["user-login", "member-dashboard", "subscription-plans"].includes(f));

  let timelineRec = "3 – 5 weeks";
  if (hasWebApp || hasMembership) timelineRec = "6 – 12 weeks";
  else if (hasAutomation) timelineRec = "8 – 14 weeks";
  else if (hasSEO) timelineRec = "4 – 6 weeks";

  const inclPages: string[] = ["Home", "About", "Services", "Contact"];
  if (services.includes("blog") || (d.marketingFeatures as string[] || []).includes("blog")) inclPages.push("Blog");
  if ((d.marketingFeatures as string[] || []).includes("landing-pages")) inclPages.push("Custom Landing Pages");
  if (hasMembership) inclPages.push("Member Dashboard");
  if ((d.salesFeatures as string[] || []).includes("product-catalog")) inclPages.push("Product Catalog");
  if (services.includes("seo")) inclPages.push("SEO-Optimized Content Pages");

  const inclFeatures: string[] = ["Responsive Mobile Design", "Fast Load Performance", "Conversion-Focused Layout", "SEO Foundation"];
  if (allFeatures.includes("lead-forms") || allFeatures.includes("contact-forms")) inclFeatures.push("Lead Capture Forms");
  if (allFeatures.includes("online-payments")) inclFeatures.push("Online Payment Processing");
  if (allFeatures.includes("crm-integration")) inclFeatures.push("CRM Integration");
  if (allFeatures.includes("appointment-scheduling")) inclFeatures.push("Appointment Scheduling");
  if (allFeatures.includes("email-automation")) inclFeatures.push("Email Automation");
  if (allFeatures.includes("ai-chatbot")) inclFeatures.push("AI Chatbot");
  if (allFeatures.includes("newsletter")) inclFeatures.push("Newsletter Signup");
  if (hasMembership) inclFeatures.push("Member Login Portal");

  const displayIntegrations = integrations.filter(i => i !== "other").map(i =>
    i.replace(/-/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a2e; background: #fff; }
  .doc { max-width: 800px; margin: 0 auto; padding: 40px 48px; }
  .logo-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #1a2d5a; }
  .logo-sq { width: 36px; height: 36px; background: #1a2d5a; color: #fff; font-size: 20px; font-weight: bold; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
  .logo-name { font-size: 20px; font-weight: bold; color: #1a2d5a; letter-spacing: 0.5px; }
  .doc-title { font-size: 28px; font-weight: bold; color: #1a2d5a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0 32px; background: #f8f6f1; padding: 24px; border-radius: 8px; border-left: 4px solid #1a2d5a; }
  .meta-group h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 8px; }
  .meta-group p { font-size: 14px; color: #1a1a2e; line-height: 1.6; font-family: 'Arial', sans-serif; }
  .section { margin: 28px 0; }
  .section-title { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #1a2d5a; padding-bottom: 8px; border-bottom: 1px solid #ddd; margin-bottom: 14px; }
  .section p { font-size: 14px; line-height: 1.8; color: #333; font-family: 'Arial', sans-serif; margin-bottom: 8px; }
  .section ul { padding-left: 20px; }
  .section ul li { font-size: 14px; line-height: 1.8; color: #333; font-family: 'Arial', sans-serif; margin-bottom: 4px; }
  .phase-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 12px 0; }
  .phase-card { background: #f8f6f1; border: 1px solid #e0ddd5; border-radius: 8px; padding: 16px; }
  .phase-card h4 { font-size: 13px; font-weight: bold; color: #1a2d5a; margin-bottom: 8px; }
  .phase-card ul { padding-left: 16px; }
  .phase-card li { font-size: 12px; color: #444; font-family: 'Arial', sans-serif; line-height: 1.7; }
  .pkg-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin: 12px 0; }
  .pkg-card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; position: relative; }
  .pkg-card.recommended { border: 2px solid #1a2d5a; }
  .pkg-badge { position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #1a2d5a; color: #fff; font-size: 10px; padding: 2px 10px; border-radius: 10px; font-family: 'Arial', sans-serif; white-space: nowrap; }
  .pkg-name { font-size: 15px; font-weight: bold; color: #1a2d5a; margin-bottom: 8px; }
  .pkg-desc { font-size: 12px; color: #666; font-family: 'Arial', sans-serif; margin-bottom: 8px; line-height: 1.5; }
  .pkg-card ul { padding-left: 16px; }
  .pkg-card li { font-size: 12px; color: #444; font-family: 'Arial', sans-serif; line-height: 1.7; }
  .payment-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-family: 'Arial', sans-serif; font-size: 13px; }
  .payment-table th { background: #1a2d5a; color: #fff; padding: 8px 12px; text-align: left; }
  .payment-table td { padding: 8px 12px; border-bottom: 1px solid #eee; color: #333; }
  .acceptance-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 16px; }
  .sig-line { border-bottom: 1px solid #333; padding-bottom: 4px; margin-bottom: 4px; height: 40px; }
  .sig-label { font-size: 11px; color: #666; font-family: 'Arial', sans-serif; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #999; font-family: 'Arial', sans-serif; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc { padding: 20px; }
  }
</style>
</head>
<body>
<div class="doc">

  <div class="logo-bar">
    <div class="logo-sq">S</div>
    <span class="logo-name">SiteMint Digital Solutions</span>
  </div>

  <div class="doc-title">Project Proposal</div>
  <p style="font-size:13px;color:#888;font-family:'Arial',sans-serif;">Confidential — Prepared Exclusively for ${d.companyName}</p>

  <div class="meta-grid">
    <div class="meta-group">
      <h4>Prepared For</h4>
      <p><strong>${d.contactName}</strong><br>${d.companyName}<br>${d.industry || ""}<br>${d.email}<br>${d.phone || ""}</p>
    </div>
    <div class="meta-group">
      <h4>Prepared By</h4>
      <p><strong>SiteMint Digital Solutions</strong><br>Technical Director: Claidy Taguran<br>Head of Strategy: Shasta Greene<br>Project Manager: Saisa Lorraigne<br>Date: ${date}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Executive Summary</div>
    <p>Based on your discovery form, we understand that <strong>${d.companyName}</strong> is seeking ${primaryService} to help ${goalStr}. ${d.whyNow ? `You shared that "${d.whyNow}" — ` : ""}This tells us timing is important and that the right solution will have a meaningful impact on your business.</p>
    <p>${d.solvePerfectly ? `You indicated that the ideal outcome is: "${d.solvePerfectly}." ` : ""}Our team is prepared to deliver a solution that not only meets your immediate needs but positions ${d.companyName} for sustainable long-term growth.</p>
  </div>

  <div class="section">
    <div class="section-title">Current Challenges</div>
    <ul>
      ${challenges.slice(0, 3).map(c => `<li>${c}</li>`).join("")}
    </ul>
    <p style="margin-top:10px;">Without action, these challenges may result in lost leads, reduced visibility, lower conversion rates, and operational inefficiencies that compound over time.</p>
  </div>

  <div class="section">
    <div class="section-title">Recommended Solution</div>
    <p>Based on your goals and selected services, we recommend the following phased approach:</p>
    <div class="phase-grid">
      <div class="phase-card">
        <h4>Phase 1 — Foundation</h4>
        <ul>
          <li>Website Design & Structure</li>
          <li>Mobile Optimization</li>
          <li>Conversion-Focused Layout</li>
          <li>Contact & Lead Forms</li>
          <li>SEO Foundation</li>
        </ul>
      </div>
      <div class="phase-card">
        <h4>Phase 2 — Growth</h4>
        <ul>
          ${hasSEO ? "<li>Advanced SEO</li>" : ""}
          <li>Lead Capture System</li>
          ${allFeatures.includes("crm-integration") ? "<li>CRM Integration</li>" : ""}
          ${allFeatures.includes("appointment-scheduling") ? "<li>Appointment Scheduling</li>" : ""}
          <li>Analytics Setup</li>
          ${allFeatures.includes("email-automation") ? "<li>Email Automation</li>" : ""}
        </ul>
      </div>
      <div class="phase-card">
        <h4>Phase 3 — Expansion</h4>
        <ul>
          ${hasAutomation ? "<li>AI & Automation Features</li>" : ""}
          ${hasMembership ? "<li>Membership Portal</li>" : ""}
          ${hasWebApp ? "<li>Custom Web Application</li>" : ""}
          <li>Advanced Integrations</li>
          <li>Ongoing Optimization</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Project Scope</div>
    <p><strong>Website Pages:</strong></p>
    <ul>${inclPages.map(p => `<li>${p}</li>`).join("")}</ul>
    <p style="margin-top:12px;"><strong>Included Features:</strong></p>
    <ul>${inclFeatures.map(f => `<li>${f}</li>`).join("")}</ul>
    ${displayIntegrations.length > 0 ? `<p style="margin-top:12px;"><strong>Integrations:</strong></p><ul>${displayIntegrations.map(i => `<li>${i}</li>`).join("")}</ul>` : ""}
    <p style="margin-top:12px;"><strong>Security:</strong></p>
    <ul><li>SSL Configuration</li><li>Security Best Practices</li></ul>
  </div>

  <div class="section">
    <div class="section-title">Recommended Timeline</div>
    <p><strong>Estimated Project Duration: ${timelineRec}</strong></p>
    <p>This estimate is based on your selected services and feature requirements. A detailed project schedule will be provided upon engagement. ${d.launchDate ? `Note: You have indicated a target launch of ${d.launchDate}, which our team will work to accommodate.` : ""}</p>
  </div>

  <div class="section">
    <div class="section-title">Investment Options</div>
    <p>Based on your project requirements, we recommend the <strong>${pkg} Package</strong>. Three options are presented below for your consideration:</p>
    <div class="pkg-grid">
      <div class="pkg-card${pkg === "Essential" ? " recommended" : ""}">
        ${pkg === "Essential" ? '<span class="pkg-badge">Recommended</span>' : ""}
        <div class="pkg-name">Option A — Essential</div>
        <div class="pkg-desc">Best for businesses needing a professional online presence.</div>
        <ul>
          <li>Website Development</li>
          <li>Mobile Optimization</li>
          <li>Contact Forms</li>
          <li>Basic SEO</li>
        </ul>
      </div>
      <div class="pkg-card${pkg === "Growth" ? " recommended" : ""}">
        ${pkg === "Growth" ? '<span class="pkg-badge">Recommended</span>' : ""}
        <div class="pkg-name">Option B — Growth</div>
        <div class="pkg-desc">Best for lead generation and marketing-focused businesses.</div>
        <ul>
          <li>Everything in Essential</li>
          <li>Blog Setup</li>
          <li>Advanced SEO</li>
          <li>CRM Integration</li>
          <li>Lead Automation</li>
        </ul>
      </div>
      <div class="pkg-card${pkg === "Premium" ? " recommended" : ""}">
        ${pkg === "Premium" ? '<span class="pkg-badge">Recommended</span>' : ""}
        <div class="pkg-name">Option C — Premium</div>
        <div class="pkg-desc">Best for web apps, automation, or custom systems.</div>
        <ul>
          <li>Everything in Growth</li>
          <li>AI Features</li>
          <li>Custom Integrations</li>
          <li>Strategy Consulting</li>
          <li>Ongoing Optimization</li>
        </ul>
      </div>
    </div>
    <p style="margin-top:16px;"><strong>Payment Schedule:</strong></p>
    <table class="payment-table">
      <tr><th>Milestone</th><th>Amount</th></tr>
      <tr><td>Deposit to Begin</td><td>50%</td></tr>
      <tr><td>Design Approval</td><td>25%</td></tr>
      <tr><td>Project Completion</td><td>25%</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">Why SiteMint</div>
    <p>SiteMint focuses on business outcomes, not just website design. Every project is built to support lead generation, conversion optimization, search visibility, customer engagement, and long-term growth. Our team of specialists — in technical development, business strategy, and project management — ensures your project is delivered on time, on brand, and built to perform.</p>
  </div>

  <div class="section">
    <div class="section-title">Optional Add-On Services</div>
    <ul>
      <li>Monthly Website Maintenance & Hosting Support</li>
      <li>SEO Management & Reporting</li>
      <li>Content Creation & Copywriting</li>
      <li>Blog Writing (ongoing)</li>
      <li>AI Automation Support</li>
      <li>Strategy & Growth Consulting</li>
    </ul>
  </div>

  <div class="section">
    <div class="section-title">Next Steps</div>
    <ol style="padding-left:20px;font-family:'Arial',sans-serif;font-size:14px;line-height:2;">
      <li>Review this proposal and select your preferred package</li>
      <li>Sign the project agreement</li>
      <li>Submit your initial deposit (50%) to begin</li>
      <li>Schedule your project kickoff call with our team</li>
    </ol>
  </div>

  <div class="section">
    <div class="section-title">Acceptance</div>
    <p style="font-family:'Arial',sans-serif;font-size:13px;">By signing below, ${d.contactName} of ${d.companyName} agrees to engage SiteMint Digital Solutions for the project scope described in this proposal.</p>
    <div class="acceptance-grid" style="margin-top:24px;">
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Client Signature</div>
        <div class="sig-line" style="margin-top:24px;"></div>
        <div class="sig-label">Client Name (Print)</div>
      </div>
      <div>
        <div class="sig-line"></div>
        <div class="sig-label">Date</div>
        <div class="sig-line" style="margin-top:24px;"></div>
        <div class="sig-label">Selected Package (A / B / C)</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>SiteMint Digital Solutions &nbsp;|&nbsp; info.sitemint@gmail.com &nbsp;|&nbsp; 949-880-6515</p>
    <p style="margin-top:4px;">Building websites, applications, and digital systems that help organizations grow.</p>
  </div>

</div>
</body>
</html>`;
}

// ── SOW Generator ─────────────────────────────────────────────────────────────

export function generateSOW(submission: DiscoverySubmission): string {
  const d = submission.formData as FormData;
  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const services = (d.services as string[]) || [];
  const allFeatures = [
    ...((d.marketingFeatures as string[]) || []),
    ...((d.salesFeatures as string[]) || []),
    ...((d.membershipFeatures as string[]) || []),
    ...((d.automationFeatures as string[]) || []),
    ...((d.otherFeatures as string[]) || []),
  ];
  const integrations = ((d.integrations as string[]) || []).filter(i => i !== "other");

  const hasWebApp = services.includes("web-app");
  const hasSEO = services.includes("seo");
  const hasAutomation = services.includes("automation") || allFeatures.some(f => ["ai-chatbot", "workflow-automation", "email-automation"].includes(f));
  const hasMembership = allFeatures.some(f => ["user-login", "member-dashboard", "subscription-plans"].includes(f));

  let timelineRec = "3 – 5 weeks";
  if (hasWebApp || hasMembership) timelineRec = "6 – 12 weeks";
  else if (hasAutomation) timelineRec = "8 – 14 weeks";
  else if (hasSEO || services.includes("blog")) timelineRec = "4 – 6 weeks";

  const inclPages: string[] = ["Home", "About", "Services", "Contact"];
  if (services.includes("blog") || allFeatures.includes("blog")) inclPages.push("Blog");
  if (allFeatures.includes("landing-pages")) inclPages.push("Custom Landing Pages");
  if (hasMembership) inclPages.push("Member Dashboard");
  if (allFeatures.includes("product-catalog")) inclPages.push("Product Catalog");
  if (hasSEO) inclPages.push("SEO Content Pages");

  const inclFeatures: string[] = ["Responsive Mobile Design", "Performance Optimization", "Conversion-Focused Layout", "SEO Meta Setup"];
  if (allFeatures.includes("lead-forms") || allFeatures.includes("contact-forms")) inclFeatures.push("Lead & Contact Forms");
  if (allFeatures.includes("online-payments")) inclFeatures.push("Online Payments");
  if (allFeatures.includes("crm-integration")) inclFeatures.push("CRM Integration");
  if (allFeatures.includes("appointment-scheduling")) inclFeatures.push("Appointment Scheduling");
  if (allFeatures.includes("email-automation")) inclFeatures.push("Email Automation");
  if (allFeatures.includes("ai-chatbot")) inclFeatures.push("AI Chatbot");
  if (hasMembership) inclFeatures.push("Member Login & Dashboard");
  if (allFeatures.includes("newsletter")) inclFeatures.push("Newsletter Signup");

  const displayIntegrations = integrations.map(i =>
    i.replace(/-/g, " ").split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a2e; background: #fff; }
  .doc { max-width: 800px; margin: 0 auto; padding: 40px 48px; }
  .logo-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 3px solid #1a2d5a; }
  .logo-sq { width: 36px; height: 36px; background: #1a2d5a; color: #fff; font-size: 20px; font-weight: bold; display: flex; align-items: center; justify-content: center; border-radius: 4px; }
  .logo-name { font-size: 20px; font-weight: bold; color: #1a2d5a; letter-spacing: 0.5px; }
  .doc-title { font-size: 28px; font-weight: bold; color: #1a2d5a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 24px 0 32px; background: #f8f6f1; padding: 24px; border-radius: 8px; border-left: 4px solid #1a2d5a; }
  .meta-group h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #666; margin-bottom: 8px; }
  .meta-group p { font-size: 14px; color: #1a1a2e; line-height: 1.6; font-family: 'Arial', sans-serif; }
  .section { margin: 28px 0; }
  .section-title { font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #1a2d5a; padding-bottom: 8px; border-bottom: 1px solid #ddd; margin-bottom: 14px; }
  .section p { font-size: 14px; line-height: 1.8; color: #333; font-family: 'Arial', sans-serif; margin-bottom: 8px; }
  .section ul, .section ol { padding-left: 20px; }
  .section li { font-size: 14px; line-height: 1.8; color: #333; font-family: 'Arial', sans-serif; margin-bottom: 4px; }
  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .col-box { background: #f8f6f1; border-radius: 8px; padding: 16px; }
  .col-box h4 { font-size: 13px; font-weight: bold; color: #1a2d5a; margin-bottom: 8px; }
  .payment-table { width: 100%; border-collapse: collapse; margin: 12px 0; font-family: 'Arial', sans-serif; font-size: 13px; }
  .payment-table th { background: #1a2d5a; color: #fff; padding: 8px 12px; text-align: left; }
  .payment-table td { padding: 8px 12px; border-bottom: 1px solid #eee; color: #333; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #999; font-family: 'Arial', sans-serif; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc { padding: 20px; }
  }
</style>
</head>
<body>
<div class="doc">

  <div class="logo-bar">
    <div class="logo-sq">S</div>
    <span class="logo-name">SiteMint Digital Solutions</span>
  </div>

  <div class="doc-title">Scope of Work</div>
  <p style="font-size:13px;color:#888;font-family:'Arial',sans-serif;">Agreement between SiteMint Digital Solutions and ${d.companyName}</p>

  <div class="meta-grid">
    <div class="meta-group">
      <h4>Client</h4>
      <p><strong>${d.contactName}</strong><br>${d.companyName}<br>${d.email}<br>${d.phone || ""}</p>
    </div>
    <div class="meta-group">
      <h4>Service Provider</h4>
      <p><strong>SiteMint Digital Solutions</strong><br>Claidy Taguran — Technical Director<br>Shasta Greene — Head of Strategy<br>Saisa Lorraigne — Project Manager<br>Date: ${date}</p>
    </div>
  </div>

  <div class="section">
    <div class="section-title">1. Project Overview</div>
    <p>This Scope of Work outlines the agreed services, deliverables, timeline, and responsibilities for the ${labelServices(services)} project for ${d.companyName}. This document defines the boundaries of the engagement and serves as the foundation for the project agreement.</p>
  </div>

  <div class="section">
    <div class="section-title">2. Client Goals</div>
    <ul>
      ${d.topGoals ? `<li>${d.topGoals}</li>` : ""}
      ${d.measureSuccess ? `<li>Success metric: ${d.measureSuccess}</li>` : ""}
      ${d.successOutcome ? `<li>Desired outcome: ${d.successOutcome}</li>` : ""}
      ${(!d.topGoals && !d.measureSuccess && !d.successOutcome) ? "<li>Build professional online presence</li><li>Generate leads and inquiries</li><li>Establish trust and credibility</li>" : ""}
    </ul>
  </div>

  <div class="section">
    <div class="section-title">3. Included Services</div>
    <ul>${services.map(s => `<li>${SERVICE_LABELS[s] || s}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <div class="section-title">4. Pages Included</div>
    <ul>${inclPages.map(p => `<li>${p}</li>`).join("")}</ul>
  </div>

  <div class="section">
    <div class="section-title">5. Features Included</div>
    <ul>${inclFeatures.map(f => `<li>${f}</li>`).join("")}</ul>
    ${displayIntegrations.length > 0 ? `<p style="margin-top:10px;"><strong>Integrations:</strong></p><ul>${displayIntegrations.map(i => `<li>${i}</li>`).join("")}</ul>` : ""}
  </div>

  <div class="section">
    <div class="section-title">6. Responsibilities</div>
    <div class="two-col">
      <div class="col-box">
        <h4>Client Responsibilities</h4>
        <ul>
          <li>Provide brand assets (logo, colors, fonts)</li>
          <li>Supply approved content and copy</li>
          <li>Provide photos or approve stock selection</li>
          <li>Review and approve designs within 3 business days</li>
          <li>Designate a single point of contact</li>
          <li>Provide access to existing accounts (if any)</li>
        </ul>
      </div>
      <div class="col-box">
        <h4>SiteMint Responsibilities</h4>
        <ul>
          <li>Deliver design mockups for review</li>
          <li>Build and develop agreed functionality</li>
          <li>Optimize for mobile and performance</li>
          <li>Provide progress updates at key milestones</li>
          <li>Conduct quality testing before launch</li>
          <li>Deploy and configure the final project</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">7. Revision Terms</div>
    <ul>
      <li>Design phase: Up to 2 rounds of revisions included</li>
      <li>Development phase: Up to 2 rounds of minor revisions included</li>
      <li>Revisions beyond included rounds are billed at $75/hour</li>
      <li>Scope changes that alter the project significantly require a new SOW addendum</li>
    </ul>
  </div>

  <div class="section">
    <div class="section-title">8. Timeline</div>
    <p><strong>Estimated Duration: ${timelineRec}</strong></p>
    <p>Timeline begins upon receipt of the signed agreement and initial deposit. Delays caused by client review or content delivery may extend the timeline. A detailed milestone schedule will be provided at kickoff.</p>
    ${d.launchDate ? `<p><strong>Target Launch Date:</strong> ${d.launchDate}</p>` : ""}
  </div>

  <div class="section">
    <div class="section-title">9. Payment Schedule</div>
    <table class="payment-table">
      <tr><th>Milestone</th><th>Amount Due</th><th>Due When</th></tr>
      <tr><td>Initial Deposit</td><td>50%</td><td>Upon signing agreement</td></tr>
      <tr><td>Design Approval</td><td>25%</td><td>Upon client design approval</td></tr>
      <tr><td>Project Completion</td><td>25%</td><td>Upon launch / project delivery</td></tr>
    </table>
  </div>

  <div class="section">
    <div class="section-title">10. Exclusions</div>
    <ul>
      <li>Domain registration and annual renewal fees</li>
      <li>Third-party software licenses or subscriptions (e.g. CRM platforms, email services)</li>
      <li>Professional photography or video production</li>
      <li>Content writing (unless separately agreed)</li>
      <li>Ongoing maintenance beyond the project scope (available as add-on)</li>
    </ul>
  </div>

  <div class="section">
    <div class="section-title">11. Optional Add-Ons</div>
    <ul>
      <li>Monthly Maintenance & Support Plan</li>
      <li>SEO Management & Monthly Reporting</li>
      <li>Content & Blog Writing</li>
      <li>AI Automation & Workflow Setup</li>
      <li>Paid Ads Setup & Management</li>
      <li>Strategy & Growth Consulting</li>
    </ul>
  </div>

  <div class="section">
    <div class="section-title">12. Agreement</div>
    <p style="font-family:'Arial',sans-serif;font-size:13px;">By signing below, both parties agree to the scope, terms, and responsibilities outlined in this document. This Scope of Work becomes binding upon receipt of the signed document and initial deposit.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:32px;">
      <div>
        <div style="border-bottom:1px solid #333;height:40px;margin-bottom:6px;"></div>
        <div style="font-size:11px;color:#666;font-family:'Arial',sans-serif;">Client Signature</div>
        <div style="border-bottom:1px solid #333;height:40px;margin-top:20px;margin-bottom:6px;"></div>
        <div style="font-size:11px;color:#666;font-family:'Arial',sans-serif;">Date</div>
      </div>
      <div>
        <div style="border-bottom:1px solid #333;height:40px;margin-bottom:6px;"></div>
        <div style="font-size:11px;color:#666;font-family:'Arial',sans-serif;">SiteMint Representative</div>
        <div style="border-bottom:1px solid #333;height:40px;margin-top:20px;margin-bottom:6px;"></div>
        <div style="font-size:11px;color:#666;font-family:'Arial',sans-serif;">Date</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <p>SiteMint Digital Solutions &nbsp;|&nbsp; info.sitemint@gmail.com &nbsp;|&nbsp; 949-880-6515</p>
    <p style="margin-top:4px;">Building websites, applications, and digital systems that help organizations grow.</p>
  </div>

</div>
</body>
</html>`;
}

// Label helpers exported for routes
export { labelBudget, labelTimeline, labelDecision, labelServices, SERVICE_LABELS };
