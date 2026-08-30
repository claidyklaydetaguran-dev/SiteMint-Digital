/**
 * Frontend V2 Phase 10 — `/contacts/:id`.
 *
 * The route stays registered exactly where it was in the `Switch`, so its
 * ordering and the navigation contract are unchanged. What it renders is now
 * true: this product has no contact records, so no `:id` can resolve to one.
 *
 * This replaces the literal developer string "Contact Detail stub", which was
 * reachable by any authenticated operator who typed or followed the URL.
 *
 * It issues no request — there is no endpoint to call — and it never echoes the
 * `:id` back into the page: that value is unvalidated URL input, it carries no
 * meaning here, and printing it would imply a lookup took place.
 */

import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { detailCopy } from "@/pages/contacts/contactsContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-contacts.css";

export default function ContactDetail() {
  const copy = detailCopy();

  return (
    <div className="sk-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">Operate</span>
          <h1 className="sd-page__title">Contact</h1>
        </div>
      </div>

      <div className="sd-empty">
        <h2 className="sd-empty__title">{copy.title}</h2>
        <p className="sd-empty__detail">{copy.detail}</p>
      </div>

      <p>
        <Link href="/contacts" className="sd-link sk-link">
          <ArrowLeft className="sk-link__icon" aria-hidden="true" />
          Back to contacts
        </Link>
      </p>
    </div>
  );
}
