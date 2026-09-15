# Customer portal, mobile, offline and push — status record

Last updated: 2026-09-12. Branch `claude/sitemint-crm-operations-124038`.

This file records three things: what the customer portal actually does, what
the mobile audit found (including what could not be fixed from here), and the
honest state of offline support and push notifications.

---

## 1. The customer portal

A signed-in customer sees **their own records and nothing else**. Everything
below is secondary to that.

### Status

| Capability | State |
|---|---|
| Portal session (third auth system) | Implemented, tested locally |
| Per-contact record isolation at the data layer | Implemented, tested locally, mutation-verified |
| Invitation: single-use, expiring, hashed, revocable | Implemented, tested locally |
| Projects, documents, proposals, payments, support | Implemented, tested locally |
| Customer document upload against a request | Implemented, tested locally |
| Proposal acceptance (never labelled a signature) | Implemented, tested locally |
| Internal support notes unreachable from the portal | Implemented, tested locally, mutation-verified |
| Portal UI pages | Implemented, typechecked — **not** rendered in a browser (routing lives in a file this work does not own) |
| Offline support | **Not built.** See §4 |
| Push notifications | **Not built.** See §4 |

### Why a third authentication system

There were two: CRM staff (`crm_staff_session`, permissions, MFA, CSRF) and the
receptionist product (`receptionist_session`, scoped to an `intake_firms` row).
Neither can carry a customer.

- A staff session resolves to a `crm_staff` row and, through
  `effectivePermissions`, to grants over **every** contact. There is no
  per-contact narrowing anywhere in that model. A customer holding one would be
  a staff member with an odd role, one forgotten permission away from reading
  another client's file.
- A receptionist session resolves to a firm in a different product with a
  different customer universe. A CRM contact is not an `intake_firms` row.

So the portal has its own cookie (`crm_portal_session`), its own CSRF header
(`x-portal-csrf`), its own TTL (14 days absolute / 72 hours idle) and its own
tables. The consequence that matters: a portal session is not merely
*unauthorised* at a staff route, it is **invisible** to one —
`resolveStaffSession` reads `crm_staff_session` and finds nothing, so every
`/api/crm/*` route answers 401 before any handler runs. The reverse holds too.
Neither statement depends on a check somebody remembered to write.

### How isolation is enforced

Not by a filter in each route. Every portal read goes through a `scoped*`
helper in `artifacts/api-server/src/lib/portalAuth.ts`, and each of those takes
the tenant key as its first argument and builds `lead_id = <contact>` into the
`WHERE` clause itself. There is no unscoped variant of any of them, and no
route in `crmPortal.ts` queries those tables directly. A route cannot forget the
filter because a route never writes the filter.

The tenant key comes off the **session row** — never a path parameter, a body
field, or anything else a caller can influence.

Every refusal is **404**, from one shared `refuse()` helper. A 403 on somebody
else's invoice confirms the invoice exists and that the number was worth
guessing.

### What a customer can see, and what decides it

- **Projects** — stage, type, dates. Deliberately *not* `nextAction`,
  `blockedReason` or `notes`; those are staff writing to staff and the server
  does not send them.
- **Documents** — default-deny. A file appears only when a row in
  `crm_portal_document_grants` says so. The obvious alternative ("every
  attachment on this contact, their deals and their projects") is wrong in a
  way that shows up exactly once: staff attach internal things to records all
  the time — a subcontractor's scope, a screenshot of a complaint, a margin
  sheet — and the day somebody does, the customer can read it and nobody finds
  out. A file the customer uploads themselves gets a grant written at upload
  time, so the grant table stays the single source of truth.
- **Document requests** — only those raised against `entity_type = 'lead'` for
  this contact. A request hung off a project or deal is staff chasing something
  internally.
- **Proposals** — deals at stage `Proposal` or `Won`.
- **Payments** — money received. There is no "balance owed", because the CRM
  records payments and does not hold an accounts-receivable ledger; a total
  labelled "outstanding" would be a number nobody computed.
- **Support** — their own tickets, with **only** `visibility = 'customer'`
  messages. Internal notes are never fetched, so they cannot leak through a
  body, a count, a preview or an error message. The ticket projection also drops
  `lastStaffMessageAt` (an internal note moves it, which would leak that
  internal activity happened and when) and `resolutionNote` (free text staff
  wrote to staff). `lastUpdateAt` is recomputed from things the customer can
  actually see.

### Accepting a proposal is not signing one

A customer accepting a proposal has clicked a button while holding a session. An
uploaded PDF is bytes somebody sent us. Neither is a signature: there is no
signer identity verified by anyone but us, no tamper-evident document version,
no certificate, no third-party audit trail.

So `crm_portal_proposal_acceptances` has no `signed_at`, no `signature`, no
`signer_verified`. It has `typed_name` — named "typed" so no later reader
mistakes it for an identity check. Every payload touching an acceptance or a
document carries `signatureStatus: "not_a_signature"` from one shared helper
(`portalSignatureDisclosure()`), and the UI states it next to the button rather
than in small print. The test suite fails if the word "signed" appears anywhere
in a proposal payload.

Accepting does **not** move the deal to Won. Closing a deal is a staff act with
its own route, permission and audit entry.

### Login throttling — a defect found and fixed during this work

The portal borrows the staff attempt ledger (`crm_staff_login_attempts`), one
table with namespaced subjects, but **not** the staff limits.

`deriveClientIp` defaults to the socket address (`TRUSTED_PROXY_HOPS = 0`),
which behind a proxy is the same address for every visitor. The staff limit of
20 failures per 15 minutes is fine for three people who know their own
passwords. Applied to customers it is a self-inflicted outage: twenty fumbled
logins anywhere in the customer base — or by one attacker — would lock out every
client at once, and the lockout would look exactly like the site being broken.

The portal therefore uses `account: 8 / 15 min` (tight, because guessing one
password is what it defends against) and `ip: 60 / 15 min` (bounds spraying
without turning a shared NAT into a shared outage). A test asserts both halves:
guessing one account throttles, and a different customer from the same address
still gets in.

---

## 2. Wiring the lead must add

Three files are owned elsewhere. Nothing in the portal is reachable until these
lines exist.

**`lib/db/src/schema/index.ts`** — one line, anywhere in the list:

```ts
export * from "./crmPortal";
```

**`artifacts/api-server/src/routes/index.ts`** — two lines. The registration
must come **before** `crmRouter`, so `/crm/portal/*` matches its own handlers
rather than falling into a legacy parameterised `/crm/:something` route:

```ts
import crmPortalRouter from "./crmPortal";      // beside the other route imports
```
```ts
router.use(crmPortalRouter);                    // immediately after router.use(crmSupportRouter);
```

**`artifacts/web-agency/src/App.tsx`** — the portal is a public-site subtree,
not an `/admin` one, so it belongs in `Router()` and **outside** `AdminRoutes`
and `DashboardShell`. `/portal/sign-in` and `/portal/accept` must be reachable
without a session:

```ts
const PortalSignIn   = lazyRoute(() => import("@/pages/portal/PortalSignIn"));
const PortalAccept   = lazyRoute(() => import("@/pages/portal/PortalAccept"));
const PortalHome     = lazyRoute(() => import("@/pages/portal/PortalHome"));
const PortalProjects = lazyRoute(() => import("@/pages/portal/PortalProjects"));
const PortalDocuments= lazyRoute(() => import("@/pages/portal/PortalDocuments"));
const PortalProposals= lazyRoute(() => import("@/pages/portal/PortalProposals"));
const PortalInvoices = lazyRoute(() => import("@/pages/portal/PortalInvoices"));
const PortalSupport  = lazyRoute(() => import("@/pages/portal/PortalSupport"));
```
```tsx
<Route path="/portal/sign-in"  component={PortalSignIn} />
<Route path="/portal/accept"   component={PortalAccept} />
<Route path="/portal/projects" component={PortalProjects} />
<Route path="/portal/documents" component={PortalDocuments} />
<Route path="/portal/proposals" component={PortalProposals} />
<Route path="/portal/invoices" component={PortalInvoices} />
<Route path="/portal/support"  component={PortalSupport} />
<Route path="/portal"          component={PortalHome} />
```

Order matters: `/portal` last, since wouter matches in order.

### Schema

`docs/crm-ops/schema/M4-portal.sql` — five new tables, additive only, nothing
existing altered. Applied to `crm_test` and `crm_preview` (exit 0 on both).
Rollback SQL and its consequences are in the file. Do **not** run
`drizzle-kit push` for these.

### Permissions

The staff-side routes borrow existing permissions:

| Route | Permission |
|---|---|
| `POST/GET /crm/portal/invitations`, `.../revoke`, `.../accounts/:leadId/revoke` | `leads.write` / `leads.read` |
| `POST/DELETE/GET /crm/portal/document-grants` | `documents.write` / `documents.read` |

**Request for `staffPermissions.ts` (owned elsewhere):** a dedicated
`portal.invite` would be a better fit than borrowing `leads.write`. Granting a
customer a login that reaches their documents, payments and support history is
not the same act as editing a lead record, and it should be grantable
separately. Not added here; `leads.write` is a defensible stand-in because both
are held by owner and operations_manager.

---

## 3. Mobile

### What was checked

All 43 pages under `artifacts/web-agency/src/pages/crm/**` and
`artifacts/web-agency/src/pages/ops/**`, plus the 8 new portal pages, against
four rules: horizontal overflow (a fixed or min width over 360px with no
scrolling ancestor), tables with no scrolling ancestor and no mobile
alternative, interactive controls under ~40px, and multi-column grids with no
responsive escape.

This was a **source audit**, not a rendered one. Several of these pages are
being edited concurrently by other agents, so a screenshot pass would be
auditing a moving target; the findings below are cited to file and line so they
can be re-checked.

### Already fine — no change needed

- **Horizontal overflow: zero findings.** No fixed width over 360px sits outside
  a scroll container anywhere in the CRM, and no inline `minWidth` over 360px
  exists at all.
- `CrmLeads`, `CrmOpsFirms`, `CrmOpsIssues` already ship `hidden md:table` /
  `hidden md:block` desktop tables with a mobile card list beside them. This is
  the right pattern and the rest should follow it.
- Sixteen pages already wrap wide content in `overflow-x-auto`, including
  Calendar, Documents, Projects, Transactions, Operations and Reporting.
- Two-column grids (`grid-cols-2`, 59 occurrences) are **not** reported as
  defects: at 375px that is two ~170px columns, which is fine for label/value
  pairs and stat tiles, and blanket-reporting them would bury the real findings.

### Needs a fix — reported, not changed (these are other agents' files)

| Severity | File | Line | What |
|---|---|---|---|
| **High** | `artifacts/web-agency/src/pages/crm/CrmDeals.tsx` | 80, 83 | The edit and delete buttons on a deal card are `w-6 h-6` (24×24px) **inside `opacity-0 group-hover:opacity-100`**. A touch device has no hover, so these controls are not merely small — they are **unreachable on a phone**. Fix: make them visible unconditionally below `md`, and at least 40px. |
| **High** | `artifacts/web-agency/src/pages/crm/CrmDiscovery.tsx` | 508 | A 10-column `<table className="w-full">` with no `overflow-x-auto` ancestor and no mobile card alternative anywhere in the file. Unreadable at 375px. Fix: the `hidden md:table` + card-list pattern already used in `CrmLeads`. |
| Medium | `artifacts/web-agency/src/pages/crm/CrmReceptionistAccounts.tsx` | 255 | Table inside `overflow: hidden` with `whiteSpace: nowrap` headers — columns are **clipped**, not scrollable. Fix: `overflow-x: auto` on the wrapper. |
| Medium | `artifacts/web-agency/src/pages/crm/CrmSettings.tsx` | 751 | Table inside `overflow-hidden`, same clipping. Fix: same. |
| Medium | `artifacts/web-agency/src/pages/crm/CrmLeads.tsx` | 376, 380, 413 | Toolbar buttons at `h-8` (32px). |
| Medium | `artifacts/web-agency/src/pages/crm/CrmImport.tsx` | 357 | Remove-file button at `w-7 h-7` (28px). |
| Low | `artifacts/web-agency/src/pages/crm/CrmStaffAdmin.tsx` | 159 | Refresh button at `h-9` (36px). |
| Low | `artifacts/web-agency/src/pages/crm/CrmImport.tsx` | 237 | `grid-cols-3` of stat cards carrying `text-3xl` figures — three ~105px columns at 375px. Tight rather than broken. |

Nothing above was edited: every one of these files is owned by another agent.

### The portal's own pages

Built 375px-first: one column throughout, a horizontally scrolling tab strip
rather than a menu that has to be opened, every control `min-h-11` (44px), and
`break-words` / `break-all` on anything user-supplied. The one wide element —
the payments table — scrolls inside its own `overflow-x-auto` container, so the
page body never scrolls sideways. The file input is hidden behind a full-width
44px button, because a bare `<input type="file">` is unusable with a thumb.

Typechecked clean. **Not rendered in a browser**: the portal routes live in
`App.tsx`, which this work does not own, so there is no URL to load until §2 is
applied. That verification is outstanding.

---

## 4. Offline support and push notifications — NOT BUILT

Neither exists. This is a tracked gap, not a partial implementation, and no stub
was added: a service worker that caches nothing, or a "notifications" toggle
that subscribes to nothing, would read as built and would be worse than the
absence.

### What was actually checked

Across `artifacts/*/src` and `lib/*/src`, there are **zero** occurrences of:
`navigator.serviceWorker`, `workbox`, `vite-plugin-pwa`/`VitePWA`, `web-push`,
`PushManager`/`pushManager`, `showNotification`, `Notification.requestPermission`,
`applicationServerKey`, `VAPID`, `indexedDB`, `caches.open`/`CacheStorage`, or
even `navigator.onLine`. There is no `manifest.webmanifest` and no `<link
rel="manifest">` in either app's `index.html`. `artifacts/web-agency/public/`
contains images, fonts, `robots.txt` and `sitemap.xml` — no service worker.

### What does exist, so the gap is not overstated

- **In-app notifications**: `crm_notifications` (`lib/db/src/schema/crmOperations.ts`)
  with `GET /api/crm/notifications` and `POST /api/crm/notifications/read`.
  These are read when a page polls; nothing is delivered to a closed tab.
- **Email delivery**: `staffMail.ts`, the reminder engine, and
  `voiceAlerts/alertTransport.ts` + `dailyDigest.ts`. Real, but email.

So the honest statement is: **the CRM notifies people by email and in-app badge.
It cannot reach a device that does not have the page open, and it does not work
without a network.**

### Offline — what it would take

| Requirement | Status |
|---|---|
| Service worker registered and a build step that generates it | Does not exist. `vite-plugin-pwa` or a hand-written worker — a **new dependency or a new build step**, which is outside the current change budget and needs owner approval. |
| A cache strategy per route | Not designed. Deciding what a stale CRM page may show is a product decision, not a technical one: a stale pipeline figure or a stale "money received" number is worse than an error. |
| A write queue for mutations made offline | Not designed, and the hard part. Every CRM mutation is permission-checked, CSRF-protected and audited server-side; a queued write replayed later has a stale CSRF token, possibly a revoked session, and no way to resolve a conflict. |
| Conflict resolution | Not designed. |

**External action required:** an owner decision on whether the CRM is meant to
work offline at all. For a three-person agency team on modern phones, "shows a
clear error and retries" — which the portal already does — may be the correct
answer, and building an offline write queue would add a whole class of
correctness problems for a case that may not occur.

### Push — what it would take

| Requirement | Status |
|---|---|
| A platform decision: Web Push vs. native app vs. staying with email | **Not made.** Everything else waits on this. |
| VAPID key pair, stored as deployment secrets | Not generated. New environment variables, not in `.env.example`. |
| A service worker (push messages are delivered to one) | Does not exist — same prerequisite as offline. |
| A subscription table + endpoints | Not built. |
| A sender, and a rule for what is worth interrupting somebody for | Not built, not decided. |
| iOS Safari: Web Push only works from a home-screen-installed PWA | Constrains the answer; probably the deciding factor. |

**External action required:** the platform decision, then VAPID key generation
and secret provisioning. Until the decision is made, nothing here should be
started.

---

## 5. Outstanding items

1. **Wiring (§2)** — three files owned elsewhere. Nothing works until then.
2. **Browser verification of the portal pages at 375px** — blocked on item 1.
3. **`artifacts/api-server/src/lib/routeSecurity.ts`** — this work added a third
   protection class, `"portal"`, plus one `CHAIN_SIGNALS` and one `BODY_SIGNALS`
   entry matching `requirePortalAuth(`. Without it, twelve mutating portal
   routes classify as unprotected and `routeSecurity.test.ts` fails its
   "every mutating route is protected" assertion. The edit is additive and
   changes no existing route's classification (verified: only another agent's
   `crm/automation/*` routes were reported unclassified). **This file was not in
   the assigned ownership list — please review the change.**
4. **Upload size cap.** Portal uploads are capped at 64 KiB, and that is a
   constraint rather than a policy: `app.ts` installs a global `express.json()`
   with the default 100 KB limit before the router is mounted, so a larger
   base64 body is rejected by the parser with a 413 that never reaches the
   route. Raising it means registering `express.json({ limit })` for
   `/api/portal/documents` ahead of the global parser, exactly as
   `DISCOVERY_V1_PATH` already does. `app.ts` is not owned here. Note the staff
   document route (`crmDocuments.ts`) claims a 25 MB limit and has the **same**
   latent problem for the same reason.
5. **`portal.invite` permission** (§2).
6. **`CRM_PUBLIC_BASE_URL`** must be set wherever invitations are sent from, or
   no link can be built. The route reports this honestly rather than emailing a
   broken link; the raw token is still returned once so a staff member can pass
   it on by hand.
