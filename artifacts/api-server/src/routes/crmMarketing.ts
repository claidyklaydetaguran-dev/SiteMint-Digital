// ── M4: Marketing ───────────────────────────────────────────────────────────
//
// Saved audiences, a visual email designer, and a broadcast that can be
// scheduled, paused, resumed and cancelled — with an honest account of who
// received it and who did not.
//
// Four properties this module exists to hold, and the failure each one
// prevents:
//
//   Re-evaluation   A segment stores conditions, never members. The audience is
//                   resolved from `crm_leads` at the moment a send STARTS, so a
//                   contact who became a client — or unsubscribed — after the
//                   segment was saved is treated as they are today, not as they
//                   were when somebody clicked Save.
//
//   No silent drop  Everybody the segment matched gets a row in
//                   `crm_marketing_recipients`, including the ones that were
//                   never mailed, with the reason. "412 sent" out of a
//                   460-person segment is only a usable number if the other 48
//                   are a list of names. The excluded count is always returned
//                   broken down by reason, and the count and the list come from
//                   the same rows.
//
//   Never "Hi ,"    Every merge token must carry a fallback (`{{first_name|
//                   there}}`). A token without one is a BLOCKER: the send is
//                   refused before it starts, naming the token. Even with a
//                   fallback, preflight reports how many people will see it, so
//                   "half your list is about to be greeted generically" is
//                   visible before the send, not after.
//
//   Honest results  Opens and clicks are NOT tracked for these campaigns —
//                   nothing writes them and no pixel or link rewrite exists. So
//                   `engagement.tracked` is false and the rates are null. A
//                   fabricated 0% would read as "nobody opened it", which is a
//                   different and untrue statement.
//
// Nothing here reaches a customer address by accident. Delivery goes through
// `lib/staffMail.ts`, which hands nothing to the provider at all while
// `CRM_EMAIL_TEST_MODE` is anything other than the exact string "false"; a test
// send is additionally refused unless its recipient is an active staff account.

import { Router, type IRouter, type Request, type Response } from "express";
import {
  and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, ne,
  notInArray, or, sql, type SQL,
} from "drizzle-orm";
import {
  db, crmLeads, crmStaff, crmActivities, crmEmailSuppressions,
  crmMarketingSegments, crmMarketingDesigns, crmMarketingCampaigns,
  crmMarketingExclusions, crmMarketingRecipients,
  CRM_SEGMENT_FIELDS, CRM_SEGMENT_FIELD_OPERATORS, CRM_SEGMENT_MATCH_MODES,
  CRM_EMAIL_BLOCK_TYPES, CRM_MARKETING_CAMPAIGN_TRANSITIONS, CRM_MERGE_FIELDS,
  CRM_STATUSES, CRM_SOURCES, CRM_PRIORITIES, PROJECT_TYPES,
  type CrmSegmentDefinition, type CrmSegmentCondition, type CrmSegmentField,
  type CrmSegmentOperator, type CrmEmailBlock, type CrmMarketingCampaign,
  type CrmMarketingCampaignStatus, type CrmMergeField, type CrmLead,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { trySendStaffMail, staffMailBlockedReason } from "../lib/staffMail.js";
import { draftCampaign, draftingAvailability } from "../lib/campaignDrafting.js";

const router: IRouter = Router();

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function actor(req: Request) {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName || s?.email || "admin" };
}

const trimmed = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

/** Lower-cased, trimmed — the same normalisation `crm_email_suppressions` uses. */
const normalizeEmail = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim().toLowerCase();
  return t ? t : null;
};

/**
 * True when an error is Postgres' unique-violation for a named constraint.
 *
 * Walks the `cause` chain because drizzle wraps the driver error in a
 * `DrizzleQueryError` whose own message is the SQL, not the violation — testing
 * `err.message` alone silently stopped matching and turned a 409 into a 500.
 */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  let cursor: unknown = err;
  for (let depth = 0; cursor && typeof cursor === "object" && depth < 6; depth += 1) {
    const e = cursor as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown };
    if (e.code === "23505" && (e.constraint === constraint || String(e.message ?? "").includes(constraint))) return true;
    if (typeof e.message === "string" && e.message.includes(constraint) && e.message.includes("duplicate key")) return true;
    cursor = e.cause;
  }
  return false;
}

/** Crude, and deliberately so: it rejects blanks and obvious non-mailboxes. */
const looksLikeAddress = (v: string | null | undefined): v is string =>
  !!v && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v);

// ── Segments: turning a definition into SQL ─────────────────────────────────

const SEGMENT_COLUMNS = {
  status: crmLeads.status,
  source: crmLeads.source,
  priority: crmLeads.priority,
  owner: crmLeads.assignedTo,
  service_interest: crmLeads.serviceInterest,
  company: crmLeads.company,
  tag: crmLeads.tags,
  estimated_value: crmLeads.estimatedValue,
  created_at: crmLeads.createdAt,
  last_contacted_at: crmLeads.lastContactedAt,
} as const;

export interface SegmentProblem { index: number; problem: string }

/**
 * Validates a definition before anything is stored or queried.
 *
 * Refusing an operator a field cannot take is not pedantry: a timestamp
 * compared to a tag matches nobody, and a segment that matches nobody for a
 * structural reason looks exactly like one that matches nobody for a business
 * reason. Only one of those is worth acting on, so they must not be confusable.
 */
export function validateSegmentDefinition(raw: unknown): { definition: CrmSegmentDefinition } | { problems: SegmentProblem[] } {
  const problems: SegmentProblem[] = [];
  const body = (raw ?? {}) as Record<string, unknown>;

  const match = body["match"];
  if (typeof match !== "string" || !(CRM_SEGMENT_MATCH_MODES as readonly string[]).includes(match)) {
    problems.push({ index: -1, problem: `"match" must be one of: ${CRM_SEGMENT_MATCH_MODES.join(", ")}.` });
  }

  const rawConditions = Array.isArray(body["conditions"]) ? body["conditions"] : null;
  if (!rawConditions || rawConditions.length === 0) {
    problems.push({ index: -1, problem: "A segment needs at least one condition. An empty one would silently mean 'everybody'." });
    return { problems };
  }

  const conditions: CrmSegmentCondition[] = [];
  rawConditions.forEach((rawCondition, index) => {
    const c = (rawCondition ?? {}) as Record<string, unknown>;
    const field = c["field"];
    const operator = c["operator"];

    if (typeof field !== "string" || !(CRM_SEGMENT_FIELDS as readonly string[]).includes(field)) {
      problems.push({ index, problem: `"${String(field)}" is not a field a segment can test.` });
      return;
    }
    const f = field as CrmSegmentField;
    const allowed = CRM_SEGMENT_FIELD_OPERATORS[f];
    if (typeof operator !== "string" || !(allowed as readonly string[]).includes(operator)) {
      problems.push({ index, problem: `"${f}" cannot be tested with "${String(operator)}". It accepts: ${allowed.join(", ")}.` });
      return;
    }
    const op = operator as CrmSegmentOperator;
    const value = c["value"];

    if (op === "is_set" || op === "is_not_set") {
      conditions.push({ field: f, operator: op });
      return;
    }
    if (op === "in" || op === "not_in") {
      const list = Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
      if (list.length === 0) { problems.push({ index, problem: `"${op}" needs at least one value.` }); return; }
      conditions.push({ field: f, operator: op, value: list });
      return;
    }
    if (op === "gte" || op === "lte" || op === "within_days" || op === "older_than_days") {
      const n = Number(value);
      if (!Number.isFinite(n)) { problems.push({ index, problem: `"${op}" needs a number.` }); return; }
      if ((op === "within_days" || op === "older_than_days") && n < 0) {
        problems.push({ index, problem: `"${op}" needs a number of days that is not negative.` }); return;
      }
      conditions.push({ field: f, operator: op, value: n });
      return;
    }
    const s = trimmed(value);
    if (!s) { problems.push({ index, problem: `"${op}" needs a value.` }); return; }
    conditions.push({ field: f, operator: op, value: s });
  });

  if (problems.length > 0) return { problems };
  return { definition: { match: match as CrmSegmentDefinition["match"], conditions } };
}

function conditionSql(c: CrmSegmentCondition): SQL | undefined {
  const col = SEGMENT_COLUMNS[c.field];
  const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

  switch (c.operator) {
    case "is":
      return eq(col as never, String(c.value));
    // `IS DISTINCT FROM` rather than `<>`, so a contact with no company is
    // matched by "company is not Acme" instead of being silently dropped by
    // SQL's three-valued logic.
    case "is_not":
      return sql`${col} IS DISTINCT FROM ${String(c.value)}`;
    case "in":
      return inArray(col as never, c.value as string[]);
    case "not_in":
      return or(isNull(col as never), notInArray(col as never, c.value as string[]));
    case "contains":
      return ilike(col as never, `%${String(c.value)}%`);
    case "has_tag":
      return sql`${crmLeads.tags} @> ARRAY[${String(c.value)}]::text[]`;
    case "lacks_tag":
      return sql`NOT (${crmLeads.tags} @> ARRAY[${String(c.value)}]::text[])`;
    case "gte":
      return sql`${col} IS NOT NULL AND ${col}::numeric >= ${Number(c.value)}`;
    case "lte":
      return sql`${col} IS NOT NULL AND ${col}::numeric <= ${Number(c.value)}`;
    case "within_days":
      return and(isNotNull(col as never), gte(col as never, daysAgo(Number(c.value))));
    // "Not contacted in 90 days" must include people never contacted at all —
    // they are the most overdue, and excluding them is the opposite of what
    // anybody means by the phrase.
    case "older_than_days":
      return or(isNull(col as never), lt(col as never, daysAgo(Number(c.value))));
    case "is_set":
      return and(isNotNull(col as never), ne(col as never, ""));
    case "is_not_set":
      return or(isNull(col as never), eq(col as never, ""));
    default:
      return undefined;
  }
}

export function segmentWhere(definition: CrmSegmentDefinition): SQL | undefined {
  const parts = definition.conditions.map(conditionSql).filter((s): s is SQL => !!s);
  if (parts.length === 0) return undefined;
  return definition.match === "any" ? or(...parts) : and(...parts);
}

/**
 * Resolves a segment to the contacts that match it RIGHT NOW.
 *
 * There is no cached-members path and no `asOf` parameter, on purpose: every
 * caller — the live count in the builder, the preview list, and the send — runs
 * this same query, so the number somebody sees and the people who get the email
 * cannot come from different definitions of the audience.
 */
export async function resolveSegment(definition: CrmSegmentDefinition): Promise<CrmLead[]> {
  const where = segmentWhere(definition);
  return db.select().from(crmLeads).where(where).orderBy(asc(crmLeads.id));
}

// ── Merge fields ────────────────────────────────────────────────────────────

const MERGE_TOKEN = /\{\{([^}]*)\}\}/g;

export interface MergeTokenProblem { token: string; problem: string }

/** Every `{{...}}` in a piece of copy, with the raw inner text. */
function tokensIn(text: string | null | undefined): { raw: string; field: string; fallback: string | null }[] {
  if (!text) return [];
  const out: { raw: string; field: string; fallback: string | null }[] = [];
  const pattern = new RegExp(MERGE_TOKEN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const inner = (m[1] ?? "").trim();
    const pipe = inner.indexOf("|");
    out.push({
      raw: m[0],
      field: (pipe === -1 ? inner : inner.slice(0, pipe)).trim(),
      fallback: pipe === -1 ? null : inner.slice(pipe + 1).trim(),
    });
  }
  return out;
}

/** Every piece of a campaign that a merge token can appear in. */
function mergeableText(campaign: { subject: string; preheader: string | null; blocks: CrmEmailBlock[] }): string[] {
  return [
    campaign.subject,
    campaign.preheader ?? "",
    ...(campaign.blocks ?? []).map((b) => b.text ?? ""),
  ];
}

/**
 * Finds every merge token that cannot be rendered safely.
 *
 * A token with no fallback is the "Hi ," defect in source form. It is returned
 * as a problem rather than repaired, because the right fallback is a judgement
 * ("there", "hello", the company name) that only the person writing the email
 * can make.
 */
export function mergeTokenProblems(campaign: { subject: string; preheader: string | null; blocks: CrmEmailBlock[] }): MergeTokenProblem[] {
  const problems: MergeTokenProblem[] = [];
  const seen = new Set<string>();
  for (const text of mergeableText(campaign)) {
    for (const t of tokensIn(text)) {
      if (seen.has(t.raw)) continue;
      seen.add(t.raw);
      if (!(t.field in CRM_MERGE_FIELDS)) {
        problems.push({ token: t.raw, problem: `"${t.field}" is not a merge field. It would be sent to the customer exactly as written.` });
      } else if (t.fallback === null || t.fallback === "") {
        problems.push({
          token: t.raw,
          problem: `"${t.field}" has no fallback. Write it as {{${t.field}|something}} — otherwise every contact missing that value gets a blank where this word should be.`,
        });
      }
    }
  }
  return problems;
}

export type MergeValues = Record<CrmMergeField, string | null>;

export function mergeValuesFor(lead: CrmLead): MergeValues {
  const name = (lead.name ?? "").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] ?? null,
    last_name: parts.length > 1 ? parts.slice(1).join(" ") : null,
    full_name: name || null,
    company: trimmed(lead.company),
    email: trimmed(lead.email),
    owner: trimmed(lead.assignedTo),
    service_interest: trimmed(lead.serviceInterest),
    status: trimmed(lead.status),
    source: trimmed(lead.source),
  };
}

/** Substitutes tokens, and reports which ones fell back for this person. */
export function applyMerge(text: string, values: MergeValues): { text: string; fallbacks: string[] } {
  const fallbacks: string[] = [];
  const pattern = new RegExp(MERGE_TOKEN.source, "g");
  const out = text.replace(pattern, (raw, innerRaw: string) => {
    const inner = (innerRaw ?? "").trim();
    const pipe = inner.indexOf("|");
    const field = (pipe === -1 ? inner : inner.slice(0, pipe)).trim();
    const fallback = pipe === -1 ? "" : inner.slice(pipe + 1).trim();
    if (!(field in CRM_MERGE_FIELDS)) return raw;
    const value = values[field as CrmMergeField];
    if (value && value.trim()) return value;
    if (!fallbacks.includes(field)) fallbacks.push(field);
    return fallback;
  });
  return { text: out, fallbacks };
}

// ── Rendering ───────────────────────────────────────────────────────────────

const esc = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only http(s) and mailto survive. A `javascript:` href in an email is junk anyway. */
const safeUrl = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  if (!t) return null;
  return /^(https?:\/\/|mailto:)/i.test(t) ? t : null;
};

const INK = "#153E52";
const MUTED = "#5b6b72";
const ACCENT = "#0B7487";
const RULE = "#dbe6e8";

function blockHtml(block: CrmEmailBlock, values: MergeValues | null): { html: string; fallbacks: string[] } {
  const align = block.align ?? "left";
  const merge = (raw: string | null | undefined): { text: string; fallbacks: string[] } =>
    values ? applyMerge(raw ?? "", values) : { text: raw ?? "", fallbacks: [] };

  switch (block.type) {
    case "heading": {
      const { text, fallbacks } = merge(block.text);
      const size = block.level === 2 ? 18 : 24;
      return {
        fallbacks,
        html: `<tr><td style="padding:0 32px 14px;text-align:${align};"><h${block.level === 2 ? 2 : 1} style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:${size}px;line-height:1.3;color:${INK};font-weight:700;">${esc(text)}</h${block.level === 2 ? 2 : 1}></td></tr>`,
      };
    }
    case "text": {
      const { text, fallbacks } = merge(block.text);
      const paragraphs = text.split(/\n{2,}/).map((p) =>
        `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${MUTED};">${esc(p).replace(/\n/g, "<br/>")}</p>`,
      ).join("");
      return {
        fallbacks,
        html: `<tr><td style="padding:0 32px 6px;text-align:${align};">${paragraphs}</td></tr>`,
      };
    }
    case "image": {
      const url = safeUrl(block.url);
      if (!url) return { html: "", fallbacks: [] };
      const width = block.size && block.size > 0 ? Math.min(block.size, 536) : 536;
      return {
        fallbacks: [],
        html: `<tr><td style="padding:0 32px 18px;text-align:${align};"><img src="${esc(url)}" alt="${esc(block.alt ?? "")}" width="${width}" style="display:block;border:0;outline:none;max-width:100%;height:auto;margin:${align === "center" ? "0 auto" : "0"};"/></td></tr>`,
      };
    }
    case "button": {
      const url = safeUrl(block.url);
      const { text, fallbacks } = merge(block.text);
      if (!url || !text.trim()) return { html: "", fallbacks };
      return {
        fallbacks,
        // A table-wrapped anchor, not a styled <div>: Outlook does not render
        // padding on an inline element, so a <div> button collapses to a link.
        html: `<tr><td style="padding:6px 32px 22px;text-align:${align};"><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr><td style="background:${ACCENT};border-radius:8px;"><a href="${esc(url)}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${esc(text)}</a></td></tr></table></td></tr>`,
      };
    }
    case "divider":
      return { html: `<tr><td style="padding:8px 32px 22px;"><hr style="border:0;border-top:1px solid ${RULE};margin:0;"/></td></tr>`, fallbacks: [] };
    case "spacer": {
      const h = Math.min(Math.max(block.size ?? 16, 4), 96);
      return { html: `<tr><td style="line-height:${h}px;height:${h}px;font-size:0;">&nbsp;</td></tr>`, fallbacks: [] };
    }
    default:
      return { html: "", fallbacks: [] };
  }
}

export interface RenderedEmail {
  subject: string;
  html: string;
  fallbacks: string[];
}

/**
 * Renders the campaign for one contact — or, with `values: null`, as the
 * designer's structural preview with tokens left visible.
 *
 * Tables and inline styles throughout, because the mail clients that matter
 * still discard a stylesheet and still ignore flexbox. The 600px shell with a
 * `max-width:100%` inner table is the one layout that survives Gmail, Outlook
 * and a phone without a media query.
 *
 * This function is the ONLY renderer. The builder's "preview as contact" fetches
 * its output rather than re-implementing it in the browser, so what a person
 * approves is byte-for-byte what is sent.
 */
export function renderEmail(
  campaign: { subject: string; preheader: string | null; blocks: CrmEmailBlock[] },
  values: MergeValues | null,
  opts: { testBanner?: boolean } = {},
): RenderedEmail {
  const fallbacks: string[] = [];
  const collect = (list: string[]) => { for (const f of list) if (!fallbacks.includes(f)) fallbacks.push(f); };

  const subjectResult = values ? applyMerge(campaign.subject, values) : { text: campaign.subject, fallbacks: [] };
  collect(subjectResult.fallbacks);

  const preheaderResult = values
    ? applyMerge(campaign.preheader ?? "", values)
    : { text: campaign.preheader ?? "", fallbacks: [] };
  collect(preheaderResult.fallbacks);

  const rows = (campaign.blocks ?? []).map((b) => {
    const r = blockHtml(b, values);
    collect(r.fallbacks);
    return r.html;
  }).join("");

  const banner = opts.testBanner
    ? `<tr><td style="background:#fdf3d8;border-bottom:1px solid #e8d9a8;padding:12px 32px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b5518;"><strong>TEST SEND</strong> — this copy went to a staff address only. No customer received it.</td></tr>`
    : "";

  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(subjectResult.text)}</title>
</head>
<body style="margin:0;padding:0;background:#f2f6f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheaderResult.text)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f6f7;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border:1px solid ${RULE};border-radius:12px;overflow:hidden;">
${banner}
<tr><td style="background:${INK};padding:18px 32px;">
  <span style="font-family:Georgia,'Times New Roman',serif;font-size:17px;font-weight:700;color:#ffffff;">SiteMint <span style="color:#8fb6bf;">Digital</span></span>
</td></tr>
<tr><td style="height:26px;line-height:26px;font-size:0;">&nbsp;</td></tr>
${rows}
<tr><td style="height:10px;line-height:10px;font-size:0;">&nbsp;</td></tr>
<tr><td style="background:#f7fbfb;border-top:1px solid ${RULE};padding:16px 32px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};">
  SiteMint Digital Solutions &middot; <a href="mailto:info.sitemint@gmail.com" style="color:${ACCENT};">info.sitemint@gmail.com</a> &middot; 949-880-6515<br/>
  Don't want these? <a href="mailto:info.sitemint@gmail.com?subject=Unsubscribe" style="color:${ACCENT};">Reply with "unsubscribe"</a> and we will take you off the list.
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  return { subject: subjectResult.text, html, fallbacks };
}

/** A plain-text shadow of the same copy, so the message is not HTML-only. */
function renderText(campaign: { blocks: CrmEmailBlock[] }, values: MergeValues | null): string {
  const lines: string[] = [];
  for (const b of campaign.blocks ?? []) {
    const raw = b.text ?? "";
    const text = values ? applyMerge(raw, values).text : raw;
    if (b.type === "heading" || b.type === "text") { if (text.trim()) lines.push(text.trim()); }
    else if (b.type === "button") { const u = safeUrl(b.url); if (text.trim()) lines.push(`${text.trim()}${u ? `: ${u}` : ""}`); }
    else if (b.type === "divider") lines.push("---");
  }
  lines.push("", "SiteMint Digital Solutions · info.sitemint@gmail.com · 949-880-6515");
  lines.push('Don\'t want these? Reply with "unsubscribe" and we will take you off the list.');
  return lines.join("\n\n");
}

// ── Blocks in, blocks out ───────────────────────────────────────────────────

function parseBlocks(raw: unknown): CrmEmailBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 120).map((r, i) => {
    const b = (r ?? {}) as Record<string, unknown>;
    const type = (CRM_EMAIL_BLOCK_TYPES as readonly string[]).includes(String(b["type"]))
      ? (b["type"] as CrmEmailBlock["type"]) : "text";
    const align = ["left", "center", "right"].includes(String(b["align"]))
      ? (b["align"] as CrmEmailBlock["align"]) : "left";
    return {
      id: typeof b["id"] === "string" && b["id"] ? b["id"] : `b${i}-${Date.now()}`,
      type,
      text: typeof b["text"] === "string" ? b["text"] : null,
      level: Number(b["level"]) === 2 ? 2 : 1,
      align,
      url: typeof b["url"] === "string" ? b["url"] : null,
      alt: typeof b["alt"] === "string" ? b["alt"] : null,
      size: Number.isFinite(Number(b["size"])) ? Number(b["size"]) : null,
    };
  });
}

// ── Exclusions ──────────────────────────────────────────────────────────────

export interface ExclusionVerdict {
  reason: "suppressed" | "unsubscribed" | "campaign_excluded" | "no_address" | null;
  detail: string | null;
}

/**
 * The exclusion order, and why it is this order.
 *
 * Explicit campaign exclusion is checked FIRST so that a person's deliberate
 * "not them, not this time" is what gets reported, rather than being masked by
 * a suppression that also happens to apply. Everything after it is a fact about
 * the address rather than a judgement about the send.
 */
function verdictFor(
  lead: CrmLead,
  excludedLeadIds: Set<number>,
  excludedDetail: Map<number, string | null>,
  suppressions: Map<string, { reason: string; detail: string | null }>,
): ExclusionVerdict {
  if (excludedLeadIds.has(lead.id)) {
    return {
      reason: "campaign_excluded",
      detail: excludedDetail.get(lead.id) ?? "Excluded from this campaign by a member of staff.",
    };
  }
  const address = normalizeEmail(lead.email);
  if (!looksLikeAddress(address)) {
    return {
      reason: "no_address",
      detail: address === null
        ? "This contact has no email address."
        : `"${address}" is not a usable email address.`,
    };
  }
  const hit = suppressions.get(address);
  if (hit) {
    if (hit.reason === "unsubscribe") {
      return { reason: "unsubscribed", detail: hit.detail ?? "This person asked to stop receiving marketing email." };
    }
    return {
      reason: "suppressed",
      detail: hit.detail ?? (hit.reason === "complaint"
        ? "This address reported a previous message as spam. Mailing it again risks the whole domain's deliverability."
        : "This address hard-bounced, so mail to it will not arrive."),
    };
  }
  return { reason: null, detail: null };
}

/** Live suppression list, keyed by address. Released rows are not suppressions. */
async function liveSuppressions(): Promise<Map<string, { reason: string; detail: string | null }>> {
  const rows = await db.select().from(crmEmailSuppressions).where(isNull(crmEmailSuppressions.releasedAt));
  return new Map(rows.map((r) => [r.address, { reason: r.reason, detail: r.detail }]));
}

// ── Preflight ───────────────────────────────────────────────────────────────

const EXCLUSION_LABELS: Record<string, string> = {
  suppressed: "Suppressed — the address bounced permanently or reported us as spam",
  unsubscribed: "Unsubscribed — this person asked to stop",
  campaign_excluded: "Excluded from this campaign by a member of staff",
  no_address: "No usable email address on the contact record",
  missing_merge_field: "A merge field this copy needs has no value and no fallback",
};

interface PreflightResult {
  campaignId: number;
  status: string;
  audienceSize: number;
  sendable: number;
  excluded: number;
  excludedByReason: { reason: string; label: string; count: number; contacts: { id: number; name: string; email: string | null; detail: string | null }[] }[];
  fallbackWarnings: { field: string; count: number; share: number }[];
  blockers: string[];
  canSend: boolean;
  delivery: { configured: boolean; note: string };
}

async function preflight(campaign: CrmMarketingCampaign): Promise<PreflightResult> {
  const blockers: string[] = [];

  if (!campaign.subject.trim()) blockers.push("The campaign has no subject line.");
  if (!Array.isArray(campaign.blocks) || campaign.blocks.length === 0) blockers.push("The email has no content blocks.");
  if (!campaign.segmentId) blockers.push("No audience is chosen. Pick a segment before sending.");
  if (campaign.aiContentState === "draft") {
    blockers.push("This campaign contains AI-drafted copy that nobody has approved. Read it and approve it, or replace it, before sending.");
  }
  for (const p of mergeTokenProblems(campaign)) blockers.push(`${p.token} — ${p.problem}`);

  let leads: CrmLead[] = [];
  let segmentMissing = false;
  if (campaign.segmentId) {
    const [segment] = await db.select().from(crmMarketingSegments)
      .where(eq(crmMarketingSegments.id, campaign.segmentId)).limit(1);
    if (!segment) { segmentMissing = true; blockers.push("The segment this campaign points at no longer exists."); }
    // Resolved HERE, at preflight time, from the same function the send uses.
    else leads = await resolveSegment(segment.definition);
  }

  const [exclusionRows, suppressions] = await Promise.all([
    db.select().from(crmMarketingExclusions).where(eq(crmMarketingExclusions.campaignId, campaign.id)),
    liveSuppressions(),
  ]);
  const excludedIds = new Set(exclusionRows.map((r) => r.leadId));
  const excludedDetail = new Map(exclusionRows.map((r) => [r.leadId, r.reason]));

  const buckets = new Map<string, { id: number; name: string; email: string | null; detail: string | null }[]>();
  const fallbackCounts = new Map<string, number>();
  let sendable = 0;

  for (const lead of leads) {
    const verdict = verdictFor(lead, excludedIds, excludedDetail, suppressions);
    if (verdict.reason) {
      const list = buckets.get(verdict.reason) ?? [];
      list.push({ id: lead.id, name: lead.name, email: lead.email, detail: verdict.detail });
      buckets.set(verdict.reason, list);
      continue;
    }
    sendable += 1;
    const rendered = renderEmail(campaign, mergeValuesFor(lead));
    for (const f of rendered.fallbacks) fallbackCounts.set(f, (fallbackCounts.get(f) ?? 0) + 1);
  }

  const excludedByReason = [...buckets.entries()].map(([reason, contacts]) => ({
    reason,
    label: EXCLUSION_LABELS[reason] ?? reason,
    count: contacts.length,
    contacts,
  })).sort((a, b) => b.count - a.count);

  const excluded = excludedByReason.reduce((s, b) => s + b.count, 0);

  const fallbackWarnings = [...fallbackCounts.entries()].map(([field, count]) => ({
    field, count, share: sendable > 0 ? Math.round((count / sendable) * 100) : 0,
  })).sort((a, b) => b.count - a.count);

  if (!segmentMissing && campaign.segmentId && sendable === 0) {
    blockers.push(
      leads.length === 0
        ? "The segment matches nobody right now, so there is nobody to send to."
        : `Every one of the ${leads.length} contacts in this segment is excluded, so there is nobody left to send to.`,
    );
  }

  const blocked = staffMailBlockedReason();

  return {
    campaignId: campaign.id,
    status: campaign.status,
    audienceSize: leads.length,
    sendable,
    excluded,
    excludedByReason,
    fallbackWarnings,
    blockers,
    canSend: blockers.length === 0,
    delivery: {
      configured: blocked === null,
      note: blocked ?? "Mail is configured and a send will reach real mailboxes.",
    },
  };
}

// ── The send ────────────────────────────────────────────────────────────────

const DEFAULT_BATCH = 50;
const MAX_BATCH = 200;

function refuseTransition(from: CrmMarketingCampaignStatus, to: CrmMarketingCampaignStatus): string | null {
  const allowed = CRM_MARKETING_CAMPAIGN_TRANSITIONS[from] ?? [];
  if (allowed.includes(to)) return null;
  if (from === "cancelled") return "This campaign was cancelled. Cancelling is not an undo and a cancelled campaign cannot be restarted — copy it into a new one.";
  if (from === "sent") return "This campaign has finished sending. It cannot be restarted, because that would mail everybody a second time.";
  return `A campaign that is "${from}" cannot become "${to}".`;
}

/**
 * Writes one ledger row per contact in the segment, resolved NOW.
 *
 * This is the moment the audience stops being a definition and becomes a list,
 * and it happens when the send STARTS — not when the segment was saved and not
 * when the campaign was created. Idempotent: a second call adds nobody, because
 * a resumed send must continue the list it started, not re-open it.
 */
async function materialiseAudience(campaign: CrmMarketingCampaign): Promise<{ resolved: number; excluded: number }> {
  if (!campaign.segmentId) return { resolved: 0, excluded: 0 };
  const [segment] = await db.select().from(crmMarketingSegments)
    .where(eq(crmMarketingSegments.id, campaign.segmentId)).limit(1);
  if (!segment) return { resolved: 0, excluded: 0 };

  // A test send left rows behind; they are not part of the real audience.
  await db.delete(crmMarketingRecipients).where(and(
    eq(crmMarketingRecipients.campaignId, campaign.id),
    eq(crmMarketingRecipients.status, "test"),
  ));

  const leads = await resolveSegment(segment.definition);
  if (leads.length === 0) return { resolved: 0, excluded: 0 };

  const [exclusionRows, suppressions] = await Promise.all([
    db.select().from(crmMarketingExclusions).where(eq(crmMarketingExclusions.campaignId, campaign.id)),
    liveSuppressions(),
  ]);
  const excludedIds = new Set(exclusionRows.map((r) => r.leadId));
  const excludedDetail = new Map(exclusionRows.map((r) => [r.leadId, r.reason]));

  let excluded = 0;
  const values = leads.map((lead) => {
    const verdict = verdictFor(lead, excludedIds, excludedDetail, suppressions);
    if (verdict.reason) excluded += 1;
    return {
      campaignId: campaign.id,
      leadId: lead.id,
      address: normalizeEmail(lead.email),
      status: verdict.reason ? ("excluded" as const) : ("pending" as const),
      exclusionReason: verdict.reason,
      exclusionDetail: verdict.detail,
    };
  });

  for (let i = 0; i < values.length; i += 500) {
    await db.insert(crmMarketingRecipients).values(values.slice(i, i + 500)).onConflictDoNothing();
  }
  return { resolved: leads.length, excluded };
}

interface SendProgress {
  attempted: number;
  sent: number;
  failed: number;
  remaining: number;
  stoppedBecause: string | null;
}

/**
 * Processes up to `batchSize` pending recipients.
 *
 * The campaign's status is re-read before EVERY recipient, not once per batch.
 * That is what makes Pause mean "stop now" rather than "stop when this batch of
 * fifty finishes" — the difference between the two is fifty emails that
 * somebody deliberately tried to stop.
 */
async function sendBatch(campaignId: number, batchSize: number): Promise<SendProgress> {
  let attempted = 0, sent = 0, failed = 0;
  let stoppedBecause: string | null = null;

  const pending = await db.select({ recipient: crmMarketingRecipients, lead: crmLeads })
    .from(crmMarketingRecipients)
    .innerJoin(crmLeads, eq(crmMarketingRecipients.leadId, crmLeads.id))
    .where(and(eq(crmMarketingRecipients.campaignId, campaignId), eq(crmMarketingRecipients.status, "pending")))
    .orderBy(asc(crmMarketingRecipients.id))
    .limit(batchSize);

  for (const row of pending) {
    const [live] = await db.select().from(crmMarketingCampaigns)
      .where(eq(crmMarketingCampaigns.id, campaignId)).limit(1);
    if (!live || live.status !== "sending") {
      stoppedBecause = live
        ? `The campaign moved to "${live.status}" part-way through, so the remaining contacts were not attempted.`
        : "The campaign no longer exists.";
      break;
    }

    const values = mergeValuesFor(row.lead);
    const rendered = renderEmail(live, values);
    const text = renderText(live, values);
    const address = row.recipient.address ?? normalizeEmail(row.lead.email);

    attempted += 1;
    const outcome = await trySendStaffMail({
      to: address ?? "",
      subject: rendered.subject,
      text,
      html: rendered.html,
      // Stable per campaign+contact, so a retried batch cannot mail the same
      // person twice inside Resend's 24-hour idempotency window.
      idempotencyKey: `crm-marketing-${campaignId}-${row.recipient.leadId}`,
    });

    if (outcome.sent) {
      sent += 1;
      await db.update(crmMarketingRecipients).set({
        status: "sent", sentAt: new Date(), providerMessageId: outcome.providerId,
        renderedSubject: rendered.subject, renderedHtml: rendered.html,
        fallbacksUsed: rendered.fallbacks, lastError: null,
      }).where(eq(crmMarketingRecipients.id, row.recipient.id));
    } else {
      failed += 1;
      await db.update(crmMarketingRecipients).set({
        status: "failed", lastError: `${outcome.failure}: ${outcome.reason}`.slice(0, 500),
        renderedSubject: rendered.subject, renderedHtml: rendered.html,
        fallbacksUsed: rendered.fallbacks,
      }).where(eq(crmMarketingRecipients.id, row.recipient.id));
    }
  }

  const [{ remaining }] = await db.select({ remaining: sql<number>`count(*)::int` })
    .from(crmMarketingRecipients)
    .where(and(eq(crmMarketingRecipients.campaignId, campaignId), eq(crmMarketingRecipients.status, "pending")));

  return { attempted, sent, failed, remaining: Number(remaining ?? 0), stoppedBecause };
}

// ── Segments ────────────────────────────────────────────────────────────────

router.get("/crm/marketing/segments", requireCrmAuth("campaigns.read"), async (_req: Request, res: Response) => {
  const rows = await db.select().from(crmMarketingSegments)
    .where(isNull(crmMarketingSegments.archivedAt))
    .orderBy(desc(crmMarketingSegments.updatedAt));

  // Counted live, one query each. A stored count would be a number that was
  // true once, and the whole point of a segment is that it is not.
  const withCounts = await Promise.all(rows.map(async (s) => {
    const [row] = await db.select({ n: sql<number>`count(*)::int` })
      .from(crmLeads).where(segmentWhere(s.definition));
    return { ...s, memberCount: Number(row?.n ?? 0) };
  }));

  res.json({
    segments: withCounts,
    fields: CRM_SEGMENT_FIELDS,
    fieldOperators: CRM_SEGMENT_FIELD_OPERATORS,
    // The real vocabularies, served rather than duplicated in the browser, so
    // the builder's dropdowns cannot drift away from what the records hold.
    fieldValues: {
      status: CRM_STATUSES,
      source: CRM_SOURCES,
      priority: CRM_PRIORITIES,
      service_interest: PROJECT_TYPES,
    },
    note: "Member counts are computed now, from the segment's conditions. Nothing stores a member list.",
  });
});

/** Evaluates an unsaved definition — the live count and preview in the builder. */
router.post("/crm/marketing/segments/preview", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  const parsed = validateSegmentDefinition((req.body as { definition?: unknown })?.definition ?? req.body);
  if ("problems" in parsed) { res.status(400).json({ error: "That audience definition cannot be used.", problems: parsed.problems }); return; }

  const leads = await resolveSegment(parsed.definition);
  res.json({
    count: leads.length,
    sample: leads.slice(0, 25).map((l) => ({
      id: l.id, name: l.name, email: l.email, company: l.company,
      status: l.status, source: l.source, tags: l.tags,
    })),
    sampleSize: Math.min(leads.length, 25),
    note: "Counted against contacts as they are right now. The same query runs again when a campaign using this segment starts sending.",
  });
});

router.post("/crm/marketing/segments", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = trimmed(body["name"]);
  if (!name) { res.status(400).json({ error: "Give the audience a name." }); return; }

  const parsed = validateSegmentDefinition(body["definition"]);
  if ("problems" in parsed) { res.status(400).json({ error: "That audience definition cannot be used.", problems: parsed.problems }); return; }

  const me = actor(req);
  try {
    const [row] = await db.insert(crmMarketingSegments).values({
      name, description: trimmed(body["description"]),
      definition: parsed.definition,
      createdByStaffId: me.id, createdByLabel: me.label,
    }).returning();
    await auditAction(req, "marketing.segment_created", `segment:${row.id}`);
    res.status(201).json({ segment: row });
  } catch (err) {
    if (isUniqueViolation(err, "uq_crm_marketing_segments_name")) {
      res.status(409).json({ error: `An audience called "${name}" already exists.` });
      return;
    }
    throw err;
  }
});

router.patch("/crm/marketing/segments/:id", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid audience." }); return; }
  const body = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body["name"] !== undefined) {
    const name = trimmed(body["name"]);
    if (!name) { res.status(400).json({ error: "Give the audience a name." }); return; }
    patch["name"] = name;
  }
  if (body["description"] !== undefined) patch["description"] = trimmed(body["description"]);
  if (body["definition"] !== undefined) {
    const parsed = validateSegmentDefinition(body["definition"]);
    if ("problems" in parsed) { res.status(400).json({ error: "That audience definition cannot be used.", problems: parsed.problems }); return; }
    patch["definition"] = parsed.definition;
  }

  const [row] = await db.update(crmMarketingSegments).set(patch)
    .where(eq(crmMarketingSegments.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await auditAction(req, "marketing.segment_updated", `segment:${id}`);
  res.json({ segment: row });
});

router.delete("/crm/marketing/segments/:id", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid audience." }); return; }
  const [row] = await db.update(crmMarketingSegments)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(crmMarketingSegments.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await auditAction(req, "marketing.segment_archived", `segment:${id}`);
  res.json({
    segment: row,
    note: "Archived rather than deleted, because campaigns that already used it still name it.",
  });
});

// ── Designs (saved templates) ───────────────────────────────────────────────

router.get("/crm/marketing/designs", requireCrmAuth("campaigns.read"), async (_req: Request, res: Response) => {
  const designs = await db.select().from(crmMarketingDesigns)
    .where(isNull(crmMarketingDesigns.archivedAt))
    .orderBy(desc(crmMarketingDesigns.updatedAt));
  res.json({ designs, blockTypes: CRM_EMAIL_BLOCK_TYPES, mergeFields: CRM_MERGE_FIELDS });
});

router.post("/crm/marketing/designs", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = trimmed(body["name"]);
  if (!name) { res.status(400).json({ error: "Give the template a name." }); return; }
  const me = actor(req);
  try {
    const [row] = await db.insert(crmMarketingDesigns).values({
      name, description: trimmed(body["description"]),
      subject: trimmed(body["subject"]), preheader: trimmed(body["preheader"]),
      blocks: parseBlocks(body["blocks"]),
      createdByStaffId: me.id, createdByLabel: me.label,
    }).returning();
    await auditAction(req, "marketing.design_created", `design:${row.id}`);
    res.status(201).json({ design: row });
  } catch (err) {
    if (isUniqueViolation(err, "uq_crm_marketing_designs_name")) {
      res.status(409).json({ error: `A template called "${name}" already exists.` });
      return;
    }
    throw err;
  }
});

router.patch("/crm/marketing/designs/:id", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid template." }); return; }
  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body["name"] !== undefined) {
    const name = trimmed(body["name"]);
    if (!name) { res.status(400).json({ error: "Give the template a name." }); return; }
    patch["name"] = name;
  }
  if (body["description"] !== undefined) patch["description"] = trimmed(body["description"]);
  if (body["subject"] !== undefined) patch["subject"] = trimmed(body["subject"]);
  if (body["preheader"] !== undefined) patch["preheader"] = trimmed(body["preheader"]);
  // The blocks are preserved as structure, so reopening a template gives back
  // an editable document rather than a rendered page.
  if (body["blocks"] !== undefined) patch["blocks"] = parseBlocks(body["blocks"]);

  const [row] = await db.update(crmMarketingDesigns).set(patch)
    .where(eq(crmMarketingDesigns.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await auditAction(req, "marketing.design_updated", `design:${id}`);
  res.json({ design: row });
});

router.delete("/crm/marketing/designs/:id", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid template." }); return; }
  const [row] = await db.update(crmMarketingDesigns)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(crmMarketingDesigns.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Not found." }); return; }
  await auditAction(req, "marketing.design_archived", `design:${id}`);
  res.json({ design: row });
});

// ── Campaigns ───────────────────────────────────────────────────────────────

router.get("/crm/marketing/campaigns", requireCrmAuth("campaigns.read"), async (_req: Request, res: Response) => {
  const campaigns = await db.select().from(crmMarketingCampaigns)
    .orderBy(desc(crmMarketingCampaigns.updatedAt));

  const counts = await db.select({
    campaignId: crmMarketingRecipients.campaignId,
    status: crmMarketingRecipients.status,
    n: sql<number>`count(*)::int`,
  }).from(crmMarketingRecipients)
    .groupBy(crmMarketingRecipients.campaignId, crmMarketingRecipients.status);

  const byCampaign = new Map<number, Record<string, number>>();
  for (const c of counts) {
    const bucket = byCampaign.get(c.campaignId) ?? {};
    bucket[c.status] = Number(c.n);
    byCampaign.set(c.campaignId, bucket);
  }

  res.json({
    campaigns: campaigns.map((c) => ({ ...c, counts: byCampaign.get(c.id) ?? {} })),
    statuses: Object.keys(CRM_MARKETING_CAMPAIGN_TRANSITIONS),
  });
});

router.post("/crm/marketing/campaigns", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const name = trimmed(body["name"]);
  if (!name) { res.status(400).json({ error: "Give the campaign a name." }); return; }
  const me = actor(req);

  const [row] = await db.insert(crmMarketingCampaigns).values({
    name,
    subject: trimmed(body["subject"]) ?? "",
    preheader: trimmed(body["preheader"]),
    blocks: parseBlocks(body["blocks"]),
    segmentId: num(body["segmentId"]) ?? null,
    designId: num(body["designId"]) ?? null,
    createdByStaffId: me.id, createdByLabel: me.label,
  }).returning();

  await auditAction(req, "marketing.campaign_created", `campaign:${row.id}`);
  res.status(201).json({ campaign: row });
});

router.get("/crm/marketing/campaigns/:id", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  const exclusions = await db.select({
    leadId: crmMarketingExclusions.leadId,
    reason: crmMarketingExclusions.reason,
    excludedByLabel: crmMarketingExclusions.excludedByLabel,
    name: crmLeads.name, email: crmLeads.email,
  }).from(crmMarketingExclusions)
    .innerJoin(crmLeads, eq(crmMarketingExclusions.leadId, crmLeads.id))
    .where(eq(crmMarketingExclusions.campaignId, id));

  res.json({ campaign, exclusions, mergeFields: CRM_MERGE_FIELDS });
});

router.patch("/crm/marketing/campaigns/:id", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  if (campaign.status === "sending" || campaign.status === "sent" || campaign.status === "cancelled") {
    res.status(409).json({
      error: `This campaign is "${campaign.status}". Its content cannot be edited, because part of the audience may already have the old version in their inbox and changing it here would make the record disagree with what was actually sent.`,
    });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body["name"] !== undefined) {
    const name = trimmed(body["name"]);
    if (!name) { res.status(400).json({ error: "Give the campaign a name." }); return; }
    patch["name"] = name;
  }
  if (body["subject"] !== undefined) patch["subject"] = trimmed(body["subject"]) ?? "";
  if (body["preheader"] !== undefined) patch["preheader"] = trimmed(body["preheader"]);
  if (body["segmentId"] !== undefined) patch["segmentId"] = num(body["segmentId"]) ?? null;
  if (body["designId"] !== undefined) patch["designId"] = num(body["designId"]) ?? null;

  // Editing AI-written copy by hand does not make it approved — but it does not
  // stay "AI-drafted" either once a person has rewritten it. Only the explicit
  // approve route clears the gate; a content edit leaves the gate where it is,
  // so nobody can launder an unapproved draft through a one-character change.
  if (body["blocks"] !== undefined) patch["blocks"] = parseBlocks(body["blocks"]);

  const [row] = await db.update(crmMarketingCampaigns).set(patch)
    .where(eq(crmMarketingCampaigns.id, id)).returning();
  await auditAction(req, "marketing.campaign_updated", `campaign:${id}`);
  res.json({ campaign: row });
});

// ── Per-campaign exclusions ─────────────────────────────────────────────────

router.post("/crm/marketing/campaigns/:id/exclusions", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  const leadId = num((req.body as { leadId?: unknown })?.leadId);
  if (!id || !leadId) { res.status(400).json({ error: "Name the campaign and the contact." }); return; }

  const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  if (!lead) { res.status(404).json({ error: "No such contact." }); return; }

  const me = actor(req);
  const [row] = await db.insert(crmMarketingExclusions).values({
    campaignId: id, leadId,
    reason: trimmed((req.body as { reason?: unknown })?.reason),
    excludedByStaffId: me.id, excludedByLabel: me.label,
  }).onConflictDoNothing().returning();

  await auditAction(req, "marketing.recipient_excluded", `campaign:${id} lead:${leadId}`);
  res.status(row ? 201 : 200).json({
    exclusion: row ?? null,
    note: row ? null : "That contact was already excluded from this campaign.",
  });
});

router.delete("/crm/marketing/campaigns/:id/exclusions/:leadId", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  const leadId = num(req.params["leadId"]);
  if (!id || !leadId) { res.status(400).json({ error: "Name the campaign and the contact." }); return; }
  await db.delete(crmMarketingExclusions).where(and(
    eq(crmMarketingExclusions.campaignId, id),
    eq(crmMarketingExclusions.leadId, leadId),
  ));
  await auditAction(req, "marketing.recipient_exclusion_removed", `campaign:${id} lead:${leadId}`);
  res.json({ ok: true });
});

// ── Preflight and preview ───────────────────────────────────────────────────

router.get("/crm/marketing/campaigns/:id/preflight", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }
  res.json(await preflight(campaign));
});

/**
 * Renders the campaign exactly as one real contact would receive it.
 *
 * Their actual merge values, and an explicit list of the fields that fell back
 * for them — so "this looks fine" is a judgement about a real email rather than
 * about a template full of tokens.
 */
router.get("/crm/marketing/campaigns/:id/preview", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  const leadId = num(req.query["leadId"]);
  let lead: CrmLead | null = null;
  if (leadId) {
    const [found] = await db.select().from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
    if (!found) { res.status(404).json({ error: "No such contact." }); return; }
    lead = found;
  }

  const values = lead ? mergeValuesFor(lead) : null;
  const rendered = renderEmail(campaign, values);
  res.json({
    subject: rendered.subject,
    html: rendered.html,
    text: renderText(campaign, values),
    as: lead ? { id: lead.id, name: lead.name, email: lead.email, company: lead.company } : null,
    mergeValues: values,
    fallbacksUsed: rendered.fallbacks,
    tokenProblems: mergeTokenProblems(campaign),
    note: lead
      ? "Rendered with this contact's real values by the same function the send uses."
      : "No contact chosen, so merge tokens are shown as written. Pick a contact to see a real email.",
  });
});

// ── Test send ───────────────────────────────────────────────────────────────

/**
 * Sends a copy to a member of staff, and to nobody else.
 *
 * The recipient must match an ACTIVE `crm_staff` row. A free-text "to" would
 * make this the easiest possible way to mail a customer an unfinished draft, so
 * the address is checked against the staff table rather than against a pattern
 * or a domain — a domain check passes for anybody who signs up with a company
 * address.
 */
router.post("/crm/marketing/campaigns/:id/test-send", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  const body = req.body as Record<string, unknown>;
  const to = normalizeEmail(trimmed(body["to"]));
  if (!to) { res.status(400).json({ error: "Say which staff address to send the test to." }); return; }

  const [staff] = await db.select({ id: crmStaff.id, email: crmStaff.email, status: crmStaff.status })
    .from(crmStaff).where(eq(sql`lower(${crmStaff.email})`, to)).limit(1);
  if (!staff || staff.status !== "active") {
    res.status(400).json({
      error: `A test send may only go to an active staff account. "${to}" is not one, and a test must never reach a customer.`,
    });
    return;
  }

  const tokenProblems = mergeTokenProblems(campaign);
  if (tokenProblems.length > 0) {
    res.status(409).json({ error: "Fix the merge tokens before testing — the test would show the same blanks the real send would.", tokenProblems });
    return;
  }

  const asLeadId = num(body["asLeadId"]);
  let lead: CrmLead | null = null;
  if (asLeadId) {
    const [found] = await db.select().from(crmLeads).where(eq(crmLeads.id, asLeadId)).limit(1);
    if (!found) { res.status(404).json({ error: "No such contact to render as." }); return; }
    lead = found;
  }

  const values = lead ? mergeValuesFor(lead) : null;
  const rendered = renderEmail(campaign, values, { testBanner: true });
  const outcome = await trySendStaffMail({
    to: staff.email,
    subject: `[TEST] ${rendered.subject}`,
    text: `*** TEST SEND — no customer received this. ***\n\n${renderText(campaign, values)}`,
    html: rendered.html,
  });

  // Recorded against the contact it was rendered as, marked `test`, so it is
  // visible without ever counting as a delivery. Materialising the real
  // audience deletes these rows first.
  if (lead) {
    await db.insert(crmMarketingRecipients).values({
      campaignId: id, leadId: lead.id, address: staff.email, status: "test",
      renderedSubject: `[TEST] ${rendered.subject}`, renderedHtml: rendered.html,
      fallbacksUsed: rendered.fallbacks,
      lastError: outcome.sent ? null : `${outcome.failure}: ${outcome.reason}`.slice(0, 500),
      sentAt: outcome.sent ? new Date() : null,
    }).onConflictDoNothing();
  }

  await auditAction(req, "marketing.test_send", `campaign:${id} staff:${staff.id}`);
  res.json({
    sent: outcome.sent,
    to: staff.email,
    reason: outcome.sent ? null : outcome.reason,
    renderedAs: lead ? { id: lead.id, name: lead.name } : null,
    fallbacksUsed: rendered.fallbacks,
    note: "A test send goes to a staff address only and is never counted as a delivery.",
  });
});

// ── Scheduling, sending, pausing, cancelling ────────────────────────────────

router.post("/crm/marketing/campaigns/:id/schedule", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  const raw = (req.body as { scheduledAt?: unknown })?.scheduledAt;
  const when = raw === null ? null : new Date(String(raw));
  if (when !== null && Number.isNaN(when.getTime())) { res.status(400).json({ error: "That is not a time." }); return; }

  if (when === null) {
    const refusal = refuseTransition(campaign.status as CrmMarketingCampaignStatus, "draft");
    if (refusal) { res.status(409).json({ error: refusal }); return; }
    const [row] = await db.update(crmMarketingCampaigns)
      .set({ status: "draft", scheduledAt: null, updatedAt: new Date() })
      .where(eq(crmMarketingCampaigns.id, id)).returning();
    await auditAction(req, "marketing.campaign_unscheduled", `campaign:${id}`);
    res.json({ campaign: row, note: "Back to draft. Nothing was sent." });
    return;
  }

  const refusal = refuseTransition(campaign.status as CrmMarketingCampaignStatus, "scheduled");
  if (refusal) { res.status(409).json({ error: refusal }); return; }

  const check = await preflight(campaign);
  if (!check.canSend) {
    res.status(409).json({ error: "This campaign is not ready to go out.", blockers: check.blockers });
    return;
  }

  const [row] = await db.update(crmMarketingCampaigns)
    .set({ status: "scheduled", scheduledAt: when, updatedAt: new Date() })
    .where(eq(crmMarketingCampaigns.id, id)).returning();
  await auditAction(req, "marketing.campaign_scheduled", `campaign:${id}`);
  res.json({
    campaign: row,
    preflight: check,
    autoStarts: false,
    note:
      "Scheduled. Two things to know. The audience is NOT fixed now — it is resolved again when the send "
      + "actually starts, so anybody who unsubscribes or stops matching between now and then is excluded "
      + "automatically. And nothing starts this send on its own: there is no background worker for marketing "
      + "broadcasts yet, so at the scheduled time somebody has to open the campaign and press Send. The time "
      + "is a reminder and a record of intent, not an alarm clock.",
  });
});

/**
 * Starts, or continues, a send.
 *
 * Deliberately batched and re-entrant. The first call resolves the audience and
 * writes the ledger; every call processes up to `batchSize` pending recipients
 * and reports how many remain, so a long send can be driven forward — and, more
 * importantly, stopped — without a background worker that nobody can see.
 */
router.post("/crm/marketing/campaigns/:id/send", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  const batchSize = Math.min(Math.max(num((req.body as { batchSize?: unknown })?.batchSize) ?? DEFAULT_BATCH, 1), MAX_BATCH);
  const status = campaign.status as CrmMarketingCampaignStatus;

  if (status === "paused") {
    res.status(409).json({ error: "This campaign is paused. Resume it deliberately rather than sending into it." });
    return;
  }
  if (status !== "sending") {
    const refusal = refuseTransition(status, "sending");
    if (refusal) { res.status(409).json({ error: refusal }); return; }

    const check = await preflight(campaign);
    if (!check.canSend) {
      res.status(409).json({ error: "This campaign is not ready to go out. Nothing was sent.", blockers: check.blockers });
      return;
    }

    // Claim it. Conditioned on the status we read, so two people pressing Send
    // at the same moment cannot both resolve the audience.
    const claimed = await db.update(crmMarketingCampaigns)
      .set({ status: "sending", startedAt: campaign.startedAt ?? new Date(), pausedAt: null, updatedAt: new Date() })
      .where(and(eq(crmMarketingCampaigns.id, id), eq(crmMarketingCampaigns.status, campaign.status)))
      .returning();
    if (claimed.length === 0) {
      res.status(409).json({ error: "Somebody else started this campaign a moment ago. Nothing was sent twice." });
      return;
    }

    const [fresh] = claimed;
    await materialiseAudience(fresh);
    await auditAction(req, "marketing.campaign_send_started", `campaign:${id}`);
  }

  const progress = await sendBatch(id, batchSize);

  // Only finish a campaign that is still sending. A pause or cancel that landed
  // mid-batch must not be overwritten by "sent".
  if (progress.remaining === 0) {
    await db.update(crmMarketingCampaigns)
      .set({ status: "sent", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(crmMarketingCampaigns.id, id), eq(crmMarketingCampaigns.status, "sending")));
  }

  const [after] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);

  res.json({
    campaign: after,
    ...progress,
    finished: progress.remaining === 0,
    note: progress.remaining > 0
      ? `${progress.remaining} contacts have not been attempted yet. Call this again to continue, or pause to stop.`
      : "Every resolved recipient has reached a final state.",
  });
});

router.post("/crm/marketing/campaigns/:id/pause", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }

  // Conditioned on `sending`, so a pause cannot resurrect a finished or
  // cancelled campaign into a pausable one.
  const paused = await db.update(crmMarketingCampaigns)
    .set({ status: "paused", pausedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(crmMarketingCampaigns.id, id), eq(crmMarketingCampaigns.status, "sending")))
    .returning();

  if (paused.length === 0) {
    const [current] = await db.select().from(crmMarketingCampaigns).where(eq(crmMarketingCampaigns.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Not found." }); return; }
    res.status(409).json({ error: `Only a campaign that is sending can be paused. This one is "${current.status}".` });
    return;
  }

  const [counts] = await db.select({
    sent: sql<number>`count(*) filter (where ${crmMarketingRecipients.status} = 'sent')::int`,
    pending: sql<number>`count(*) filter (where ${crmMarketingRecipients.status} = 'pending')::int`,
  }).from(crmMarketingRecipients).where(eq(crmMarketingRecipients.campaignId, id));

  await auditAction(req, "marketing.campaign_paused", `campaign:${id}`);
  res.json({
    campaign: paused[0],
    alreadyDelivered: Number(counts?.sent ?? 0),
    notYetAttempted: Number(counts?.pending ?? 0),
    note: `Sending has stopped. ${Number(counts?.sent ?? 0)} messages were already handed to the mail provider and cannot be recalled; ${Number(counts?.pending ?? 0)} contacts have not been attempted.`,
  });
});

router.post("/crm/marketing/campaigns/:id/resume", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const resumed = await db.update(crmMarketingCampaigns)
    .set({ status: "sending", pausedAt: null, updatedAt: new Date() })
    .where(and(eq(crmMarketingCampaigns.id, id), eq(crmMarketingCampaigns.status, "paused")))
    .returning();

  if (resumed.length === 0) {
    const [current] = await db.select().from(crmMarketingCampaigns).where(eq(crmMarketingCampaigns.id, id)).limit(1);
    if (!current) { res.status(404).json({ error: "Not found." }); return; }
    res.status(409).json({ error: `Only a paused campaign can be resumed. This one is "${current.status}".` });
    return;
  }

  await auditAction(req, "marketing.campaign_resumed", `campaign:${id}`);
  res.json({
    campaign: resumed[0],
    note: "Resumed against the audience that was resolved when the send first started. Nobody who was already sent to will be sent to again.",
  });
});

/**
 * Stops a campaign for good.
 *
 * Cancelling is not an undo, and the response says so with a number rather than
 * a reassurance. Rows that were already `sent` are untouched; the ones that were
 * never attempted stay `pending`, which is the honest record — they were not
 * excluded for a reason about them, the send simply ended.
 */
router.post("/crm/marketing/campaigns/:id/cancel", requireCrmAuth("campaigns.send"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  const refusal = refuseTransition(campaign.status as CrmMarketingCampaignStatus, "cancelled");
  if (refusal) { res.status(409).json({ error: refusal }); return; }

  await db.update(crmMarketingCampaigns)
    .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(crmMarketingCampaigns.id, id));

  const [counts] = await db.select({
    sent: sql<number>`count(*) filter (where ${crmMarketingRecipients.status} = 'sent')::int`,
    pending: sql<number>`count(*) filter (where ${crmMarketingRecipients.status} = 'pending')::int`,
    failed: sql<number>`count(*) filter (where ${crmMarketingRecipients.status} = 'failed')::int`,
  }).from(crmMarketingRecipients).where(eq(crmMarketingRecipients.campaignId, id));

  const delivered = Number(counts?.sent ?? 0);
  const [after] = await db.select().from(crmMarketingCampaigns).where(eq(crmMarketingCampaigns.id, id)).limit(1);

  await auditAction(req, "marketing.campaign_cancelled", `campaign:${id}`);
  res.json({
    campaign: after,
    alreadyDelivered: delivered,
    neverAttempted: Number(counts?.pending ?? 0),
    failed: Number(counts?.failed ?? 0),
    unsent: false,
    note: delivered > 0
      ? `Cancelled. ${delivered} messages were already handed to the mail provider and are in people's inboxes — cancelling does not and cannot recall them. ${Number(counts?.pending ?? 0)} contacts were never attempted.`
      : "Cancelled before anything was handed to the mail provider, so nobody received this campaign.",
  });
});

// ── Results ─────────────────────────────────────────────────────────────────

/**
 * What actually happened, with every figure derived from the rows beneath it.
 *
 * `counts` is computed from the same `recipients` array that is returned, so a
 * badge and its list cannot disagree. Engagement is reported as untracked
 * rather than as zero: nothing in this module writes an open or a click, there
 * is no tracking pixel and no link rewriting, so "0% opened" would be a
 * statement about our customers that we have no evidence for.
 */
router.get("/crm/marketing/campaigns/:id/results", requireCrmAuth("campaigns.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }

  const rows = await db.select({
    id: crmMarketingRecipients.id,
    leadId: crmMarketingRecipients.leadId,
    address: crmMarketingRecipients.address,
    status: crmMarketingRecipients.status,
    exclusionReason: crmMarketingRecipients.exclusionReason,
    exclusionDetail: crmMarketingRecipients.exclusionDetail,
    fallbacksUsed: crmMarketingRecipients.fallbacksUsed,
    providerMessageId: crmMarketingRecipients.providerMessageId,
    lastError: crmMarketingRecipients.lastError,
    sentAt: crmMarketingRecipients.sentAt,
    name: crmLeads.name,
  }).from(crmMarketingRecipients)
    .innerJoin(crmLeads, eq(crmMarketingRecipients.leadId, crmLeads.id))
    .where(eq(crmMarketingRecipients.campaignId, id))
    .orderBy(asc(crmMarketingRecipients.id));

  const of = (status: string) => rows.filter((r) => r.status === status);
  const excludedRows = of("excluded");

  const byReason = [...new Set(excludedRows.map((r) => r.exclusionReason ?? "unknown"))].map((reason) => {
    const contacts = excludedRows.filter((r) => (r.exclusionReason ?? "unknown") === reason);
    return { reason, label: EXCLUSION_LABELS[reason] ?? reason, count: contacts.length, contacts };
  }).sort((a, b) => b.count - a.count);

  res.json({
    campaign,
    counts: {
      audience: rows.filter((r) => r.status !== "test").length,
      sent: of("sent").length,
      failed: of("failed").length,
      excluded: excludedRows.length,
      neverAttempted: of("pending").length,
      testSends: of("test").length,
    },
    excludedByReason: byReason,
    recipients: rows,
    engagement: {
      tracked: false,
      opens: null,
      clicks: null,
      openRate: null,
      clickRate: null,
      why: "Opens and clicks are not tracked for these campaigns. There is no tracking pixel and no link rewriting, and nothing writes an open or a click event. A 0% here would be a claim about your customers that we have no evidence for, so the figures are absent instead.",
    },
    deliverySignal: {
      meaning: "\"Sent\" means the mail provider accepted the message and returned an id. It is not a delivery confirmation and not a read receipt.",
      providerIdsRecorded: rows.filter((r) => r.providerMessageId).length,
    },
    definitions: {
      audience: "Everybody the segment matched when this send started, including the ones that were excluded.",
      excluded: "Matched the segment but was never mailed. Every one has a reason and appears in the list above.",
      neverAttempted: "Resolved into the audience but the send was paused or cancelled before reaching them. They were not excluded — nothing was decided about them.",
      testSends: "Copies sent to a staff address. Never counted as a delivery, never sent to a customer.",
    },
  });
});

// ── Unsubscribe ─────────────────────────────────────────────────────────────

/**
 * Records that somebody asked to stop.
 *
 * Written into `crm_email_suppressions` — the list `lib/inboundEmail.ts`
 * already owns — with `reason = 'unsubscribe'`, rather than into a second table
 * of our own. Two suppression lists is one list that can be wrong, and the one
 * that gets forgotten is always the one checked at send time.
 *
 * This is the STAFF-side action, taken when a reply says "take me off this".
 * There is no public one-click unsubscribe endpoint yet; the footer asks people
 * to reply, and those replies land in the CRM inbox. That is a real limitation
 * and is stated in the builder rather than implied away.
 */
router.post("/crm/marketing/unsubscribe", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const address = normalizeEmail(trimmed(body["address"]));
  if (!looksLikeAddress(address)) { res.status(400).json({ error: "Give the address to unsubscribe." }); return; }

  const me = actor(req);
  await db.insert(crmEmailSuppressions).values({
    address: address as string,
    reason: "unsubscribe",
    detail: trimmed(body["detail"]) ?? `Recorded by ${me.label} from a reply or a direct request.`,
    source: "staff",
  }).onConflictDoUpdate({
    target: crmEmailSuppressions.address,
    set: {
      reason: "unsubscribe",
      detail: trimmed(body["detail"]) ?? `Recorded by ${me.label}.`,
      releasedAt: null,
      updatedAt: new Date(),
    },
  });

  const [lead] = await db.select({ id: crmLeads.id }).from(crmLeads)
    .where(eq(sql`lower(${crmLeads.email})`, address as string)).limit(1);
  if (lead) {
    await db.insert(crmActivities).values({
      leadId: lead.id, type: "unsubscribed",
      title: "Unsubscribed from marketing email",
      description: `Recorded by ${me.label}. They will be excluded from every future campaign.`,
      createdBy: me.label,
    });
  }

  await auditAction(req, "marketing.unsubscribed", `address:${address}`);
  res.json({
    address,
    note: "Added to the shared suppression list. Every campaign checks that list at send time, so this applies to campaigns that are already scheduled.",
  });
});

// ── AI drafting ─────────────────────────────────────────────────────────────

router.get("/crm/marketing/ai/availability", requireCrmAuth("campaigns.read"), (_req: Request, res: Response) => {
  res.json(draftingAvailability());
});

/**
 * Asks for a draft, and stores it as a draft.
 *
 * The grounding set is built from verified facts plus a DESCRIPTION of the
 * audience — counts and distinct classification values, never a list of people
 * and never a customer's record. What was sent is kept on the campaign row, so
 * a sentence in a sent email can be traced back to the fact it stood on.
 */
router.post("/crm/marketing/campaigns/:id/ai-draft", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }
  if (campaign.status !== "draft" && campaign.status !== "scheduled") {
    res.status(409).json({ error: `A campaign that is "${campaign.status}" cannot have its copy rewritten.` });
    return;
  }

  const goal = trimmed((req.body as { goal?: unknown })?.goal);
  if (!goal) { res.status(400).json({ error: "Say what this campaign is for." }); return; }

  let segmentName: string | null = null;
  let segmentDescription: string | null = null;
  let audienceShape: { size: number; statuses: string[]; sources: string[]; services: string[] } | null = null;

  if (campaign.segmentId) {
    const [segment] = await db.select().from(crmMarketingSegments)
      .where(eq(crmMarketingSegments.id, campaign.segmentId)).limit(1);
    if (segment) {
      segmentName = segment.name;
      segmentDescription = segment.description;
      const leads = await resolveSegment(segment.definition);
      audienceShape = {
        size: leads.length,
        statuses: [...new Set(leads.map((l) => l.status).filter(Boolean))].slice(0, 12),
        sources: [...new Set(leads.map((l) => l.source).filter(Boolean))].slice(0, 12),
        services: [...new Set(leads.map((l) => l.serviceInterest).filter((v): v is string => !!v))].slice(0, 12),
      };
    }
  }

  const result = await draftCampaign({
    goal,
    tone: trimmed((req.body as { tone?: unknown })?.tone),
    segmentName, segmentDescription, audienceShape,
    mergeFields: ["first_name", "company"] as CrmMergeField[],
  });

  if (!result.ok) {
    const status = result.refusal === "unavailable" ? 503 : 422;
    res.status(status).json({
      error: result.reason,
      refusal: result.refusal,
      claims: "claims" in result ? result.claims : undefined,
      badTokens: "badTokens" in result ? result.badTokens : undefined,
      note: "Nothing was written to the campaign.",
    });
    return;
  }

  // Replaces the campaign's copy and drops the approval gate back into place.
  // A draft that arrived a second time is not approved because the first one
  // was.
  const blocks: CrmEmailBlock[] = [
    { id: "ai-heading", type: "heading", text: result.draft.subject, level: 1, align: "left", url: null, alt: null, size: null },
    { id: "ai-body", type: "text", text: result.draft.body, level: 1, align: "left", url: null, alt: null, size: null },
    { id: "ai-cta", type: "button", text: result.draft.ctaLabel, level: 1, align: "left", url: null, alt: null, size: null },
  ];

  const [row] = await db.update(crmMarketingCampaigns).set({
    subject: result.draft.subject,
    preheader: result.draft.preheader,
    blocks,
    aiContentState: "draft",
    aiDraftedAt: new Date(),
    aiGrounding: result.grounding as unknown as Record<string, unknown>,
    aiApprovedByStaffId: null, aiApprovedByLabel: null, aiApprovedAt: null,
    updatedAt: new Date(),
  }).where(eq(crmMarketingCampaigns.id, id)).returning();

  await auditAction(req, "marketing.ai_drafted", `campaign:${id}`);
  res.json({
    campaign: row,
    draft: result.draft,
    grounding: result.grounding,
    note: "This is a draft. The campaign cannot be sent until somebody reads it and approves it. The button has no link yet — you choose where it points.",
  });
});

router.post("/crm/marketing/campaigns/:id/ai-draft/approve", requireCrmAuth("campaigns.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid campaign." }); return; }
  const [campaign] = await db.select().from(crmMarketingCampaigns)
    .where(eq(crmMarketingCampaigns.id, id)).limit(1);
  if (!campaign) { res.status(404).json({ error: "Not found." }); return; }
  if (campaign.aiContentState !== "draft") {
    res.status(409).json({ error: `There is no AI draft awaiting approval on this campaign (it is "${campaign.aiContentState}").` });
    return;
  }

  const me = actor(req);
  const [row] = await db.update(crmMarketingCampaigns).set({
    aiContentState: "approved",
    aiApprovedByStaffId: me.id, aiApprovedByLabel: me.label, aiApprovedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(crmMarketingCampaigns.id, id)).returning();

  await auditAction(req, "marketing.ai_approved", `campaign:${id}`);
  res.json({ campaign: row, approvedBy: me.label, note: "Recorded against your name. The campaign can now be sent." });
});

export default router;
