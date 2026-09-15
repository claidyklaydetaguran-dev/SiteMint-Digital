/**
 * The one address a customer is told to write to for help.
 *
 * It used to be spelled two ways: Support said `info.sitemint@gmail.com` and
 * the Usage "paused" action said `support@sitemintdigital.com`. Nothing else
 * in the repository uses the second address — every other SiteMint surface
 * (the marketing footer, contact page, discovery form, outbound email
 * footers) uses the first — so a customer following the Usage link could have
 * written to an inbox nobody reads. Both screens now read this constant.
 *
 * No imports, matching every other contract module in this app, so it stays
 * portable into the plain `tsx` test runner.
 */

export const SUPPORT_EMAIL = "info.sitemint@gmail.com";

/** A `mailto:` link to the support address, with an optional subject line. */
export function supportMailto(subject?: string): string {
  const trimmed = subject?.trim() ?? "";
  return trimmed === "" ? `mailto:${SUPPORT_EMAIL}` : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(trimmed)}`;
}
