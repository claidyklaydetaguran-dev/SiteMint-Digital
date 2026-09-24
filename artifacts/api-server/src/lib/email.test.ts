/**
 * Launch security audit (2026-09-24): every visitor-typed value that reaches
 * the notification and acknowledgement emails must render as text. Before
 * this fix `buildTeamEmailHtml` and `buildClientEmailHtml` interpolated the
 * raw strings, so a public form submission could inject markup into the
 * team inbox and into the acknowledgement sent to whatever address the
 * submitter typed.
 */
import { describe, expect, it } from "vitest";
import { buildClientEmailHtml, buildTeamEmailHtml, escapeHtml } from "./email.js";

const payload = {
  formName: `Discovery <script>alert("x")</script>`,
  name: `Eve <img src=x onerror="alert(1)">`,
  email: `victim@example.com"><a href="https://evil.example">`,
  phone: `<b>555</b>`,
  company: `Acme & "Sons"`,
  service: `<iframe src="https://evil.example"></iframe>`,
  pageUrl: `https://sitemintdigital.com/discovery?x=<svg/onload=alert(1)>`,
  ip: `1.2.3.4<script>`,
  fields: {
    goals: `<a href="https://evil.example">click</a>`,
    services: ["<b>web</b>", "crm"],
    nested: { note: "<i>hi</i>" },
  },
};

describe("escapeHtml", () => {
  it("neutralises every HTML-significant character", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
});

describe("team notification email", () => {
  const html = buildTeamEmailHtml(payload);
  it("contains no raw tag from any submitted value", () => {
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).not.toMatch(/<iframe/i);
    // An escaped "onerror=" inside text is inert; only a live attribute matters.
    expect(html).not.toMatch(/<[a-z][^>]*onerror=/i);
    expect(html).not.toMatch(/<svg[^>]*onload/i);
    expect(html).not.toContain("https://evil.example\">");
  });
  it("still shows the submitted text, escaped", () => {
    expect(html).toContain("Eve &lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("Acme &amp; &quot;Sons&quot;");
    expect(html).toContain("&lt;b&gt;web&lt;/b&gt;, crm");
  });
  it("keeps the mailto link attribute-safe", () => {
    const href = /href="mailto:([^"]*)"/.exec(html)?.[1] ?? "";
    expect(href).toBe("victim@example.comahrefhttpsevil.example");
    expect(href).not.toContain("<");
    expect(href).not.toContain('"');
  });
});

describe("client acknowledgement email", () => {
  it("escapes the first name", () => {
    const html = buildClientEmailHtml(`<script>alert(1)</script>Eve`);
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;Eve");
  });
});
