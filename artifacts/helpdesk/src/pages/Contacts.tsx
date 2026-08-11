/**
 * Frontend V2 Phase 10 — the Contacts workspace.
 *
 * Mounted at `ROUTES.contacts` (`/contacts`, base-relative) inside the Phase 7
 * `DashboardShell`. It inherits that shell's navigation rail, `<main>`
 * landmark, skip link, palette, focus ring and motion system, and adds no
 * second design system and no chrome of its own.
 *
 * ── Requests: none ────────────────────────────────────────────────────────
 * This page issues no request, because no endpoint exists for it to call. No
 * query, no query key, no cache entry, no retry, no refetch, no polling. The
 * reasoning — and the schema and router evidence behind it — is documented in
 * `contacts/contactsContract.ts`, which owns every claim and every string on
 * this route.
 *
 * Authentication, the loading gate and the redirect on an expired session are
 * the shell's, unchanged: `AppShell` runs `GET /api/receptionist/auth/me`,
 * renders its own boot state while that is in flight, and navigates to
 * `/login` on error. Nothing here duplicates or weakens that, and no
 * authenticated content renders before it resolves.
 *
 * ── What this replaces ────────────────────────────────────────────────────
 * An empty state advertising a directory with a call log, per-contact tiers and
 * scoring of people, none of which exist in this product. Nothing on this page
 * now describes a capability the repository cannot evidence, and nothing claims
 * completeness of the conversation set — see `contactsContract.ts`.
 */

import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import {
  availabilityCopy,
  conversationsDestination,
  recordedFields,
} from "@/pages/contacts/contactsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-contacts.css";

export default function Contacts() {
  const availability = availabilityCopy();
  const fields = recordedFields();
  const destination = conversationsDestination();

  return (
    <div className="sk-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">Operate</span>
          <h1 className="sd-page__title">Contacts</h1>
        </div>
      </div>

      {/* The one thing an operator needs in the first five seconds: why this
          screen has no directory on it. Neutral tone — nothing is broken and
          nothing is waiting on the operator, so this is not amber. */}
      <section className="sd-status sk-status" data-state="neutral" aria-labelledby="sk-status-title">
        <div className="sd-status__head">
          <span className="sd-status__dot" aria-hidden="true" />
          <div className="sd-status__body">
            <h2 className="sd-status__title" id="sk-status-title">
              {availability.title}
            </h2>
            <p className="sd-status__detail">{availability.detail}</p>
          </div>
        </div>
      </section>

      {/* The concrete answer to "so what is kept about these people?".
          A description list, not a table: four fields is not tabular data, and
          `dt`/`dd` carries the label-to-value relationship natively. */}
      <section className="sd-section" aria-labelledby="sk-fields-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sk-fields-title">
            What is stored with a conversation
          </h2>
        </div>
        <dl className="sk-fields">
          {fields.map((field) => (
            <div
              className="sk-fields__row"
              key={field.label}
              data-recorded={field.recorded ? "true" : "false"}
            >
              <dt className="sk-fields__label">
                {/* Carries the stored/not-stored distinction to assistive
                    technology and to anyone who cannot separate the two by
                    colour. Never colour alone. */}
                <span className="sk-fields__mark" aria-hidden="true" />
                {field.label}
                <span className="sd-sr">
                  {field.recorded ? " — stored" : " — not stored"}
                </span>
              </dt>
              <dd className="sk-fields__detail">{field.detail}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The only real action on the route. */}
      <section className="sd-section" aria-labelledby="sk-next-title">
        <div className="sd-section__head">
          <h2 className="sd-h2" id="sk-next-title">
            Where to find this information
          </h2>
        </div>
        <p className="sk-prose">{destination.detail}</p>
        <p>
          <Link href={destination.href} className="sd-link sk-link">
            {destination.label}
            <ArrowRight className="sk-link__icon" aria-hidden="true" />
          </Link>
        </p>
      </section>
    </div>
  );
}
