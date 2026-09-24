/**
 * M7 companies — the matching keys and the suggestion rules, without a database.
 *
 * These are the decisions that are cheap to get subtly wrong and expensive to
 * discover late: a domain key that treats "www.acme.com" and "acme.com" as two
 * companies, a free-mail provider grouped as though it were an employer, a
 * `companyId: "acme"` coerced into an unlink, or a `javascript:` website that
 * becomes a live link on the company record.
 */
import { describe, it, expect } from "vitest";
import {
  buildCompanySuggestions, emailDomain, escapeLike, isFreeMailDomain, isPlaceholderEmailDomain,
  normalizeCompanyName, normalizeDomain, parseApplyRequest, parseCompanyInput, readCompanyIdChange,
  type CompanyRef, type SuggestionContact,
} from "./companies.js";

describe("normalizeCompanyName", () => {
  it("trims, collapses internal whitespace and lower-cases — and nothing else", () => {
    expect(normalizeCompanyName("  Acme \t  Widgets\nLtd ")).toBe("acme widgets ltd");
    expect(normalizeCompanyName("ÉCOLE Supérieure")).toBe("école supérieure");
    // Punctuation and legal suffixes are compared as written: stripping them invents matches.
    expect(normalizeCompanyName("A.C.M.E.")).not.toBe(normalizeCompanyName("ACME"));
    expect(normalizeCompanyName("Acme Ltd")).not.toBe(normalizeCompanyName("Acme"));
  });

  it("returns an empty key for anything that is not text", () => {
    expect(normalizeCompanyName(null)).toBe("");
    expect(normalizeCompanyName(42)).toBe("");
    expect(normalizeCompanyName("   ")).toBe("");
  });
});

describe("normalizeDomain", () => {
  const ok = (v: unknown) => {
    const r = normalizeDomain(v);
    if (!r.ok) throw new Error(`expected ${String(v)} to normalise, got: ${r.error}`);
    return r.domain;
  };

  it("drops the scheme, a leading www., the port, the path, the query and the case", () => {
    expect(ok("https://www.Acme.com/about?x=1#top")).toBe("acme.com");
    expect(ok("http://acme.com:8443")).toBe("acme.com");
    expect(ok("WWW.ACME.CO.UK")).toBe("acme.co.uk");
    expect(ok("acme.com.")).toBe("acme.com");
    expect(ok("  shop.acme.com/path ")).toBe("shop.acme.com");
  });

  it("takes the domain of an email address pasted into the field", () => {
    expect(ok("sales@Acme.com")).toBe("acme.com");
    expect(ok("mailto:bob@acme.io")).toBe("acme.io");
  });

  it("returns ASCII for an international name, as an email address would carry it", () => {
    expect(ok("bücher.de")).toBe("xn--bcher-kva.de");
  });

  it("treats blank and missing as no domain", () => {
    expect(ok("")).toBeNull();
    expect(ok("   ")).toBeNull();
    expect(ok(null)).toBeNull();
    expect(ok(undefined)).toBeNull();
  });

  it("refuses what is not a company domain, with a sentence", () => {
    for (const bad of ["acme", "localhost", "http://", "10.0.0.1", "http://[::1]/", "acme..com", "-acme.com"]) {
      const r = normalizeDomain(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(10);
    }
    expect(normalizeDomain(123).ok).toBe(false);
  });
});

describe("email domains and free mail", () => {
  it("reads the domain of an address", () => {
    expect(emailDomain("Ada@Analytical-Engines.co.uk")).toBe("analytical-engines.co.uk");
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(emailDomain("x@nodot")).toBeNull();
    expect(emailDomain(null)).toBeNull();
  });

  it("excludes every listed consumer provider, including each family's country domains", () => {
    for (const d of [
      "gmail.com", "googlemail.com", "outlook.com", "live.com", "icloud.com", "me.com", "aol.com",
      "proton.me", "protonmail.com", "zoho.com", "mail.com",
      "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.fr", "gmx.de", "gmx.net", "yandex.ru", "yandex.com",
      "GMAIL.COM",
    ]) {
      expect(isFreeMailDomain(d), d).toBe(true);
    }
  });

  it("does not exclude a business that merely resembles a provider", () => {
    for (const d of ["gmx-solutions.com", "acme.com", "mail.acme.com", "yahooligans-fan-club.org", "livestock.com", "me.acme.com"]) {
      expect(isFreeMailDomain(d), d).toBe(false);
    }
  });

  it("recognises the placeholder addresses an import mints", () => {
    expect(isPlaceholderEmailDomain("import.invalid")).toBe(true);
    expect(isPlaceholderEmailDomain("imported.local")).toBe(true);
    expect(isPlaceholderEmailDomain("acme.com")).toBe(false);
  });
});

describe("escapeLike", () => {
  it("escapes the LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("readCompanyIdChange", () => {
  it("distinguishes absent, unlink and link", () => {
    expect(readCompanyIdChange({ name: "x" })).toEqual({ kind: "absent" });
    expect(readCompanyIdChange({ companyId: undefined })).toEqual({ kind: "absent" });
    expect(readCompanyIdChange({ companyId: null })).toEqual({ kind: "set", companyId: null });
    expect(readCompanyIdChange({ companyId: "" })).toEqual({ kind: "set", companyId: null });
    expect(readCompanyIdChange({ companyId: 7 })).toEqual({ kind: "set", companyId: 7 });
    expect(readCompanyIdChange({ companyId: "12" })).toEqual({ kind: "set", companyId: 12 });
  });

  it("refuses a value that is not an id instead of coercing it into an unlink", () => {
    for (const bad of ["acme", 0, -3, 1.5, true, {}, []]) {
      expect(readCompanyIdChange({ companyId: bad }).kind, JSON.stringify(bad)).toBe("invalid");
    }
  });
});

describe("parseCompanyInput", () => {
  it("requires a name on create and computes the comparison key from it", () => {
    expect(parseCompanyInput({}, "create")).toMatchObject({ ok: false, field: "name" });
    expect(parseCompanyInput({ name: "   " }, "create")).toMatchObject({ ok: false, field: "name" });
    const r = parseCompanyInput({ name: "  Acme   Widgets " }, "create");
    expect(r).toMatchObject({ ok: true, values: { name: "Acme Widgets", normalizedName: "acme widgets" } });
  });

  it("normalises the domain, and on create takes it from the website when none is given", () => {
    expect(parseCompanyInput({ name: "A", domain: "https://www.acme.com/x" }, "create"))
      .toMatchObject({ ok: true, values: { domain: "acme.com" } });
    expect(parseCompanyInput({ name: "A", website: "https://www.acme.com/about" }, "create"))
      .toMatchObject({ ok: true, values: { website: "https://www.acme.com/about", domain: "acme.com" } });
    expect(parseCompanyInput({ name: "A", domain: "", website: "acme.com" }, "create"))
      .toMatchObject({ ok: true, values: { domain: "acme.com" } });
    expect(parseCompanyInput({ name: "A", domain: "nope" }, "create")).toMatchObject({ ok: false, field: "domain" });
  });

  it("on update, never lets a website edit overwrite a domain somebody recorded", () => {
    const kept = parseCompanyInput({ website: "https://other.example.org" }, "update", { domain: "acme.com" });
    expect(kept.ok && "domain" in kept.values).toBe(false);
    const filled = parseCompanyInput({ website: "https://acme.com" }, "update", { domain: null });
    expect(filled).toMatchObject({ ok: true, values: { domain: "acme.com" } });
    const cleared = parseCompanyInput({ domain: "" }, "update", { domain: "acme.com" });
    expect(cleared).toMatchObject({ ok: true, values: { domain: null } });
  });

  it("refuses a website that would become a script link", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "vbscript:x"]) {
      expect(parseCompanyInput({ name: "A", website: bad }, "create"), bad).toMatchObject({ ok: false, field: "website" });
    }
    expect(parseCompanyInput({ name: "A", website: "acme.com:8080/x" }, "create").ok).toBe(true);
  });

  it("clears optional text with null or blank, and refuses non-text and over-long values", () => {
    expect(parseCompanyInput({ city: "  ", notes: null }, "update", { domain: null }))
      .toMatchObject({ ok: true, values: { city: null, notes: null } });
    expect(parseCompanyInput({ city: 5 }, "update", { domain: null })).toMatchObject({ ok: false, field: "city" });
    expect(parseCompanyInput({ name: "x".repeat(201) }, "create")).toMatchObject({ ok: false, field: "name" });
  });

  it("checks the owner id's shape and lists what changed", () => {
    expect(parseCompanyInput({ ownerStaffId: "abc" }, "update", { domain: null })).toMatchObject({ ok: false, field: "ownerStaffId" });
    const r = parseCompanyInput({ ownerStaffId: null, industry: "Retail" }, "update", { domain: null });
    expect(r).toMatchObject({ ok: true, values: { ownerStaffId: null, industry: "Retail" } });
    expect(r.ok && r.changed.sort()).toEqual(["industry", "ownerStaffId"]);
  });
});

describe("buildCompanySuggestions", () => {
  const c = (id: number, name: string, email: string, company: string | null): SuggestionContact =>
    ({ id, name, email, company, phone: null, status: "New Inquiry" });

  const contacts = [
    c(1, "Ada", "ada@acme.com", "Acme Ltd"),
    c(2, "Bert", "bert@acme.com", "  ACME   ltd "),
    c(3, "Cleo", "cleo@gmail.com", "acme ltd"),
    c(4, "Dan", "dan@gmail.com", null),
    c(5, "Eve", "phone-5550000000@import.invalid", ""),
    c(6, "Finn", "finn@yahoo.co.uk", "Solo Trader"),
    c(7, "Gus", "gus@globex.io", null),
  ];
  const companies: CompanyRef[] = [
    { id: 50, name: "Acme Ltd", normalizedName: "acme ltd", domain: null, archivedAt: null },
    { id: 51, name: "Globex (old)", normalizedName: "globex (old)", domain: "globex.io", archivedAt: new Date() },
  ];
  const s = buildCompanySuggestions(contacts, companies);

  it("groups by normalised company text, labelled with the most common spelling", () => {
    const acme = s.byCompanyName.find((g) => g.key === "company_name:acme ltd");
    expect(acme?.contacts.map((x) => x.id).sort()).toEqual([1, 2, 3]);
    expect(acme?.label).toBe("Acme Ltd");
    expect(acme?.companyExists).toBe(true);
    expect(acme?.matches.map((m) => m.id)).toEqual([50]);
    // The group's shared work domain is proposed alongside the name.
    expect(acme?.proposedDomain).toBe("acme.com");
    // Blank company text is not a group.
    expect(s.byCompanyName.some((g) => g.contacts.some((x) => x.id === 4 || x.id === 5))).toBe(false);
    // The largest group comes first.
    expect(s.byCompanyName[0].key).toBe("company_name:acme ltd");
  });

  it("groups by work email domain, excluding free mail and placeholder addresses", () => {
    const keys = s.byEmailDomain.map((g) => g.key);
    expect(keys).toContain("email_domain:acme.com");
    expect(keys).toContain("email_domain:globex.io");
    expect(keys.some((k) => /gmail|yahoo|invalid/.test(k))).toBe(false);
    expect(s.counts.freeMailExcluded).toBe(3);
    expect(s.counts.placeholderExcluded).toBe(1);
  });

  it("reports an archived match without claiming a linkable company exists", () => {
    const globex = s.byEmailDomain.find((g) => g.key === "email_domain:globex.io");
    expect(globex?.matches).toEqual([{ id: 51, name: "Globex (old)", domain: "globex.io", archived: true }]);
    expect(globex?.companyExists).toBe(false);
    expect(globex?.proposedName).toBe("Globex");
  });

  it("caps the number of groups and says so", () => {
    const many = Array.from({ length: 5 }, (_, i) => c(100 + i, `P${i}`, `p${i}@firm${i}.com`, `Firm ${i}`));
    const capped = buildCompanySuggestions(many, [], 3);
    expect(capped.byCompanyName).toHaveLength(3);
    expect(capped.truncated.byCompanyName).toBe(true);
  });
});

describe("parseApplyRequest", () => {
  it("validates every group before anything is written", () => {
    expect(parseApplyRequest({ groups: [] })).toMatchObject({ ok: false });
    expect(parseApplyRequest({ groups: [{ action: "link", contactIds: [1], companyId: "x" }] }))
      .toMatchObject({ ok: false, groupIndex: 0, field: "companyId" });
    expect(parseApplyRequest({ groups: [{ action: "create", contactIds: [1], company: {} }] }))
      .toMatchObject({ ok: false, groupIndex: 0, field: "name" });
    expect(parseApplyRequest({ groups: [{ action: "merge", contactIds: [1] }] }))
      .toMatchObject({ ok: false, groupIndex: 0, field: "action" });
    expect(parseApplyRequest({ groups: [{ action: "link", contactIds: ["one"], companyId: 1 }] }))
      .toMatchObject({ ok: false, groupIndex: 0, field: "contactIds" });
  });

  it("keeps exactly the contacts the caller listed, once each", () => {
    const r = parseApplyRequest({
      groups: [
        { action: "create", contactIds: [3, "4", 3], company: { name: "Acme", website: "https://acme.com" }, confirmDuplicate: true },
        { action: "link", contactIds: [9], companyId: 12 },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.groups[0]).toMatchObject({ action: "create", contactIds: [3, 4], confirmDuplicate: true, company: { name: "Acme", domain: "acme.com" } });
    expect(r.groups[1]).toEqual({ action: "link", contactIds: [9], companyId: 12 });
  });
});
