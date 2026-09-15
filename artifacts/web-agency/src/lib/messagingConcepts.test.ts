/**
 * An operator can tell a campaign from a sequence from the sequence queue by
 * reading the screen.
 *
 * Two of the three were once both called "campaign", each with its own "New
 * campaign" button, so the first decision anybody faced was between two words
 * that were the same word. The definitions live in one module; these checks pin
 * what each says and that the screens naming them actually use it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESSAGING_CONCEPTS } from "./messagingConcepts";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (rel: string) => readFileSync(path.join(srcDir, rel), "utf8");

describe("the three things that send messages", () => {
  it("are each defined by what an operator can see: how many messages, and when", () => {
    const { campaign, sequence, queue } = MESSAGING_CONCEPTS;
    expect(campaign.summary).toMatch(/one email/i);
    expect(campaign.summary).toMatch(/\bonce\b/i);
    expect(campaign.summary).not.toMatch(/several|days/i);

    expect(sequence.summary).toMatch(/several messages/i);
    expect(sequence.summary).toMatch(/over days/i);

    expect(queue.summary).toMatch(/one row per message/i);
    expect(queue.summary).toMatch(/Marketing campaigns never appear/i);

    const names = Object.values(MESSAGING_CONCEPTS).map((c) => c.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    const places = Object.values(MESSAGING_CONCEPTS).map((c) => c.lives);
    expect(new Set(places).size).toBe(places.length);
  });

  it("are named in the navigation by the labels the definitions point to", () => {
    const layout = source("pages/crm/CrmLayout.tsx");
    for (const concept of Object.values(MESSAGING_CONCEPTS)) {
      expect(layout, concept.lives).toMatch(new RegExp(`label:\\s*"${concept.lives}"`));
    }
  });

  it("are introduced on their own screens in those words", () => {
    const marketing = source("pages/crm/CrmCampaignBuilderPage.tsx");
    expect(marketing).toContain("MESSAGING_CONCEPTS.campaign.summary");
    expect(marketing).toContain("MESSAGING_CONCEPTS.sequence.summary");

    const sequences = source("pages/crm/CrmCampaigns.tsx");
    expect(sequences).toContain("MESSAGING_CONCEPTS.sequence.summary");
    // The sequence engine is not called "Campaigns" on its own front page.
    expect(sequences).not.toMatch(/>\s*Campaigns\s*<\/h1>/);
    expect(sequences).not.toMatch(/New Campaign\s*</);

    const queue = source("pages/crm/CrmCampaignQueue.tsx");
    expect(queue).toContain("MESSAGING_CONCEPTS.queue.name");
    expect(queue).toContain("MESSAGING_CONCEPTS.queue.summary");
  });
});
