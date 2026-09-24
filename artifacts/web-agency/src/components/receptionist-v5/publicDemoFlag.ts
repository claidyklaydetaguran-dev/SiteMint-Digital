/**
 * AI Receptionist V5 — the public live-demo build flag.
 *
 * `VITE_PUBLIC_DEMO_ENABLED` gates ONLY whether the live-demo button renders
 * (V5-BLUEPRINT §10, mode 2). It is a boolean capability switch, never a
 * secret, and it is never `"true"` in a committed build: the live path stays
 * behind end-to-end certification of the browser call and the measured cost
 * model. The server keeps its own independent kill switch
 * (`PUBLIC_DEMO_ENABLED`) and answers 503 regardless of this flag.
 *
 * Exact-string comparison, same shape as `lib/platformPreviewFlag.ts` — an
 * unset, blank, or any other value means false (fail-closed). This lives in
 * its own module (rather than in `platformPreviewFlag.ts`) because the
 * receptionist-v5 tree is the only file set this page may edit; the website
 * owner may fold it into the shared flag module later.
 */
export const publicDemoEnabled: boolean =
  import.meta.env.VITE_PUBLIC_DEMO_ENABLED === "true";
