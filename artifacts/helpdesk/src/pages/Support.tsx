/**
 * 2026-09 owner replan — the Support screen (D-2 Account → Support).
 *
 * Minimal by design: one way to reach SiteMint (email), what to expect, and a
 * link to the Issues page for anything SiteMint has already flagged. No
 * ticketing system, no form, no new backend surface — this is a contact card,
 * not a support desk.
 */

import { Link } from "wouter";
import { PageHeader } from "@/components/common/PageHeader";
import { ROUTES } from "@/lib/routes";
import "@/styles/v2-dashboard.css";

const SUPPORT_EMAIL = "info.sitemint@gmail.com";

export default function Support() {
  return (
    <div className="sd-page sd-enter">
      <PageHeader
        eyebrow="ACCOUNT"
        title="Support"
        description="Get help from SiteMint."
      />

      <div className="rounded-lg border border-card-border bg-card p-4">
        <h2 className="text-sm font-medium text-foreground">Contact SiteMint</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="sd-link">
            {SUPPORT_EMAIL}
          </a>{" "}
          and we'll get back to you.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Expect a response within one business day.
        </p>
        <p className="mt-4 text-sm">
          <Link href={ROUTES.issues} className="sd-link">
            Already flagged problems &rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
