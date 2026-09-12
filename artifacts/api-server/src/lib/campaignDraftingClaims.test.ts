/**
 * The claim guard has to hold two opposite lines at once.
 *
 * A marketing email that cannot mention a price is useless for the thing
 * marketing exists to do — so an owner who supplies a price must be able to
 * send it. But a model that invents a price is the reason the guard exists at
 * all. The rule is therefore not "no numbers"; it is "no claim the owner did
 * not approve".
 *
 * These tests pin both sides, because a guard that only ever refuses is as
 * wrong as one that never does — it just fails in a direction nobody files a
 * bug about.
 *
 * Pure: no model, no network, no database.
 */
import { describe, it, expect } from "vitest";

// The guard itself touches nothing, but its module imports the db barrel, which
// demands a DATABASE_URL at import time. A URL that cannot connect satisfies
// that without giving the test anything to accidentally talk to — if any of
// this ever grew a query, it would fail loudly rather than quietly reading a
// real database.
process.env.DATABASE_URL ??= "postgresql://127.0.0.1:1/never_connected";

const { findUngroundedClaims } = await import("./campaignDrafting.js");
type ApprovedFact = import("./campaignDrafting.js").ApprovedFact;

const owner: ApprovedFact[] = [
  { text: "£1,200 setup, then £95 a month", approvedBy: "Shasta Greene" },
  { text: "30-day money-back if the site is not live on time", approvedBy: "Claidy Taguran" },
];

describe("ungrounded claim guard", () => {
  it("refuses a price nobody approved", () => {
    const found = findUngroundedClaims("We can audit your site for $499.", owner);
    expect(found.map((f) => f.rule)).toContain("price");
  });

  it("allows a price the owner actually approved", () => {
    // The whole point of the correction: legitimate approved content must not
    // be refused merely for containing a figure.
    const found = findUngroundedClaims(
      "Setup is £1,200, then £95 a month. Shall we book a call?",
      owner,
    );
    expect(found).toEqual([]);
  });

  it("still refuses an unapproved price sitting beside an approved one", () => {
    // The case a first-match guard would wave through: one licensed figure
    // early in the sentence, one invented figure after it.
    const found = findUngroundedClaims(
      "Setup is £1,200, and this week only we will do it for £499.",
      owner,
    );
    expect(found.map((f) => f.rule)).toContain("price");
    expect(found.find((f) => f.rule === "price")?.matched).toMatch(/499/);
  });

  it("allows an approved refund term but not an invented guarantee", () => {
    expect(
      findUngroundedClaims("30-day money-back if the site is not live on time.", owner),
    ).toEqual([]);

    const invented = findUngroundedClaims("We guarantee first place on Google.", owner);
    expect(invented.map((f) => f.rule)).toContain("guarantee");
  });

  it("refuses everything unapproved when no owner facts are supplied at all", () => {
    // The default must stay closed: an empty approval list licenses nothing.
    const found = findUngroundedClaims("Just $99 a month, 40% faster, award-winning team.");
    const rules = found.map((f) => f.rule);
    expect(rules).toContain("price");
    expect(rules).toContain("percentage");
    expect(rules).toContain("award");
  });

  it("is insensitive to case and thousands separators, so a real fact is not refused on formatting", () => {
    const found = findUngroundedClaims("setup is £1200, then £95 a month", owner);
    expect(found).toEqual([]);
  });

  it("does not license an invented price that merely shares a prefix with an approved one", () => {
    // The hole this guards: while the price pattern captured only the currency
    // symbol and one digit, "£1,999" reported as "£1" — which is a substring of
    // the approved "£1,200" and would have been waved through. The match has to
    // be the whole amount for substring licensing to mean anything.
    const found = findUngroundedClaims("Launch offer: £1,999 all in.", owner);
    expect(found.map((f) => f.rule)).toContain("price");
    expect(found.find((f) => f.rule === "price")?.matched).toMatch(/1,?999/);
  });

  it("does not let an approved fact license an unrelated claim class", () => {
    // Approving a price must not quietly approve a testimonial.
    const found = findUngroundedClaims(
      "Setup is £1,200. Our clients say we are the best.",
      owner,
    );
    expect(found.map((f) => f.rule)).toContain("testimonial");
  });
});

describe("approved facts reach the guard through the grounding", () => {
  it("carries owner-approved facts into the stored grounding", async () => {
    const { buildGrounding } = await import("./campaignDrafting.js");
    const g = buildGrounding({
      goal: "announce the maintenance plan",
      approvedFacts: owner,
    });
    // The stored grounding is what makes a price in a sent email traceable to
    // the person who approved it. If it did not carry them, the claim would be
    // licensed by something no record could later point at.
    expect(g.approvedFacts).toHaveLength(2);
    expect(g.approvedFacts[0].approvedBy).toBe("Shasta Greene");
  });

  it("defaults to licensing nothing when no owner facts are supplied", async () => {
    const { buildGrounding } = await import("./campaignDrafting.js");
    expect(buildGrounding({ goal: "just say hello" }).approvedFacts).toEqual([]);
  });
});
