/**
 * Launch security audit (2026-09-24): caller-typed SMS text and model output
 * reach the firm notification emails; they must render as text, never markup.
 */
import { describe, expect, it } from "vitest";

process.env["DATABASE_URL"] ??= "postgresql://127.0.0.1:1/never_connected";

const { buildGenericNotificationHtml, buildLawFirmNotificationHtml } = await import("./intakeAgent.js");

const hostile = `<img src=x onerror="alert(1)">`;

describe("intake notification emails escape caller and model text", () => {
  it("law-firm template", () => {
    const html = buildLawFirmNotificationHtml({
      tier: "Hot",
      callerPhone: `+1555<script>`,
      firmName: `Acme & "Sons" ${hostile}`,
      incidentType: hostile,
      incidentDate: hostile,
      incidentDateNormalized: null,
      injurySeverity: hostile,
      faultDescription: hostile,
      priorAttorney: null,
      summary: `<iframe src="https://evil.example"></iframe>`,
      disqualifyReason: hostile,
    });
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<iframe/i);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("Acme &amp; &quot;Sons&quot;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("generic template", () => {
    const html = buildGenericNotificationHtml({
      tier: "Warm",
      callerPhone: "+15550001111",
      firmName: hostile,
      topic: hostile,
      answersSummary: `<a href="https://evil.example">click</a>`,
      summary: hostile,
      disqualifyReason: null,
    });
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<a href="https:\/\/evil/);
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;click&lt;/a&gt;");
  });
});
