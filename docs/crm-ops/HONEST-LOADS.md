# Honest loads — a failed request is never "no data"

**Branch:** `crm/honest-loads` (from `release/sitemint-production-2026-09-16`)
**Date:** 2026-09-16

The owner's standing rule: **a failed request must never be displayed as
"no data" or as a zero.**

## Scope of this document

The *before* column comes from two source surveys of the committed baseline
(`f32d3a7`) plus four surfaces measured in a real browser, with the API stubbed
to answer every `/api/crm/*` except `/api/crm/staff/me` with a 500 (so the
session stayed valid and only each page's own data failed), and two measured
again under a 403.

The *after* column describes **this branch's own tree** and nothing else. It is
verified by the root typecheck, the committed contract suites and the new
regression guard — not by a browser, except where a row says otherwise.

## What the defect looked like

```ts
try { const r = await adminFetch(...); if (r.ok) setItems(d.items) }
catch { setError("Couldn't load") }
```

The list is left **empty** on failure. Every count derived from it renders `0`,
and the empty state says "No X yet". The page then states, as fact, something
nobody checked.

The cure already existed and was used by exactly two files. `src/lib/adminLoad.ts`
gives `Load<T>` — `loading` | `ready` | `error` with an `httpStatus` and a
written `reason` — so there is no empty array to count. This branch adds
`src/components/crm/LoadState.tsx` (`LoadFailure`, `PageLoadFailures`, `Figure`,
`countOf`, `failedParts`) to render it, and converts the CRM to both.

## Headline numbers

| | Count |
|---|---|
| Files scanned that fetch for display | 61 |
| **Dishonest** — rendered a zero or a "none" for failed data | **15** |
| **Partial** — stated the failure, but some figure still read 0 | **14** |
| **Total needing repair** | **29** |
| Already honest at baseline (left alone) | 26 |
| No display fetch (N/A) | 6 |
| Repaired on this branch | 29 of 29, plus the sign-in probe |

One of those 29 — `CrmSupport.tsx` — was **not** found by either survey. Both
judged it honest, and its ticket queue is. The regression guard found it: a
swallowed knowledge-base load meant the screen said "No articles yet" about a
list nobody had managed to read. That is the guard earning its place on the
first day it ran.

## The four measured in a browser

| Page | Measured before | After |
|---|---|---|
| `/admin/crm/deals` | "0 deals · $0 total value", every stage "0 / No deals", **and no failure message at all** | No board at all; stated failure + Try again; header reads "— deals · — total value" |
| `/admin/crm/leads` | "All People — 0 people" over an empty table while the database held **15 contacts** | Count is an em dash; stated failure distinct from "No leads found"; smart-list badges hidden when unknown |
| `/admin/crm/projects` | "0 projects across 14 stages" beside its failure text | "— projects across 14 stages"; board withheld; failure names each failed part |
| `/admin/crm/documents` | "WAITING ON CLIENTS 0 / PAST DUE 0" under the server's own error sentence, under **both** 500 and 403 | Tiles are em dashes; per-panel stated failures; share links no longer render "no links" for a refused read |

Under a 403, `/admin/crm/settings` rendered **"CRM System Health 0% CRITICAL"** —
a verdict computed entirely from refused reads, with one check ("Base URL")
scoring *Healthy* because an absent answer is falsy. There is now no score, no
bar and no severity word unless the checks actually ran.

## Per-file record

Verdicts are against the baseline. "Own state" means the file was already honest
by its own local error state and was left alone.

### Dishonest → repaired

| File | Surface | Before (on failure) | After |
|---|---|---|---|
| `CrmDeals.tsx` | Deals kanban | "0 deals · $0 total value"; every stage "0 / No deals"; no message | Stated failure + Try again; no board; all figures em dashes |
| `CrmLayout.tsx` | CRM chrome, **every screen** | "All caught up! No overdue tasks or pending follow-ups." — and the requests were never even sent, because it returned early without a legacy bearer token a staff session never has | Names which of contacts/tasks failed; all-clear requires both to have arrived; badge is a dash |
| `CrmWorkspaceLanding.tsx` | CRM front door | No failure path at all; "No contacts yet.", zero hot leads, zero overdue | Stated failure + Try again; panels withheld, not zeroed |
| `CrmCampaigns.tsx` | Sequences + Email Activity | `.catch(() => {})` swallowed everything: "Sequences (0)", "No sequences yet", and an invitation to create the first one | "Sequences (—)"; stated failure + Try again; no invitation to create a "first" over sequences that may exist |
| `CrmCommunications.tsx` | Email Activity; Templates | "0 email(s) / No email activity found."; "0 template(s) / No templates yet." plus a **Seed Default Templates** button that could double-seed | Stated failures; counts em dashes; seed action gated on a successful read |
| `CrmDiscovery.tsx` | Discovery list | "0 submission(s)" over "No discovery submissions found.", silently | Stated failure; count withheld |
| `CrmLeadDetail.tsx` | Contact record; Call Summary | A failed contact read **silently redirected to the contacts list**; call tiles 0/0/0/0 over "No calls yet" | A 404 says the contact no longer exists and *offers* the list as a choice; other failures keep their own wording and a Try again |
| `CrmEmailTemplates.tsx` | Templates | "0 templates / No email templates yet" + seed button; a 401 span the spinner for ever | Stated failure; count withheld; spinner always clears |
| `CrmCampaignSequence.tsx` | Sequence builder | No `r.ok` check, so a JSON error body rendered "Sequence Steps (0)", "Enrolled (0)", "No steps yet" | Stated failure; the AI copilot is withheld rather than planning over a sequence it cannot see |
| `SalesWorkspace.tsx` | Communications tab | Fed `[]` into `computeCommunicationStats`, manufacturing a **computed engagement score**, "0%" response rate, "0 reply · 0 sent" | Stated failure; no score computed from an absence |
| `CampaignWorkspace.tsx` | Campaign workspace, **before a send** | Audience and preflight both collapsed to null → "No audience yet" and silently vanished preflight checks | "Not chosen" distinguished from "could not read"; an unread preflight is never shown as passed |
| `CrmMyAccount.tsx` | Signed-in devices (**security**) | "No other devices." for a failed read; any non-2xx misdiagnosed as "you are signed in with the legacy shared admin password"; no retry | Stated failure saying it does *not* mean no device is signed in; legacy-admin wording only for 401/403; a failed revoke no longer looks like success |
| `CrmProjects.tsx` | Projects pipeline | "0 projects across 14 stages" | Em dash; board withheld |
| `CrmDocuments.tsx` | Documents | "WAITING ON CLIENTS 0 / PAST DUE 0" | Em dashes; per-panel failures |
| `CrmSettings.tsx` | CRM System Health | "0% CRITICAL" from refused reads; "Base URL: Healthy" from `undefined` | No score, bar or verdict unless the checks ran; each check names why it could not run |

### Partial → repaired

| File | Surface | Before (beside its own error text) | After |
|---|---|---|---|
| `CrmLeads.tsx` | Contacts | "— 0 people"; smart-list badges at 0 | Em dash; badges hidden when unknown |
| `CrmBillingPanel.tsx` | Quotes & invoices | "$0.00" outstanding, "0" awaiting answer | Em dashes |
| `CrmTransactions.tsx` | Transactions | "No transactions found" + "No transactions" footer | Withheld behind the stated failure |
| `CrmOperations.tsx` | Delivery, Automation queues | "0 open · showing 0" | Counts withheld; Board/List left alone (already honest) |
| `CrmCampaignQueue.tsx` | Sequence queue | Six tiles at 0; "0 messages total" | Em dashes |
| `CrmCalendar.tsx` | Calendar | "Nothing scheduled on this day." — read as a free day | Stated failure, distinct from an empty day |
| `CrmBehavioralIntelligence.tsx` | Three panels | Counts 0; "No leads with rising intent right now." | Em dashes; empty state withheld |
| `CrmImport.tsx` | CSV preview | 0/0/0/0 and "Nothing in this file would change anything" | Withheld — it would talk somebody out of an import never checked |
| `CrmExecutiveDashboard.tsx` | Recent activity panel only | Badge 0 + "Nothing has been logged…" | Em dash; rest of the page was already the reference implementation |
| `CrmLeadDna.tsx` | Lead DNA | "0 events", "last signal never", stage badge from nothing | Withheld; main failure gained a retry |
| `CrmCompanyDetail.tsx` | Link-contact search | "No contact matches that." for a failed search | Stated failure |
| `ConversationInbox.tsx` | Inbox | "0 shown" above "No conversations in this view." | Em dash |
| `StepAudience.tsx` | Step 1 chosen contacts | Chips silently emptied, contradicting the audience size below | Stated failure |
| `CrmSupport.tsx` | Knowledge base; ticket "answer article" linker | `loadArticles()` swallowed at boot, so both said "No articles yet" — one of them inviting you to write an answer that may already exist | Stated failure + Try again on the KB tab; the ticket linker says an article may well exist. Queue untouched (already honest) |

### Outside the CRM trees

| File | Before | After |
|---|---|---|
| `AdminLogin.tsx` / `staffSignIn.ts` | `staffAccountCount()` returned `number \| null` and null — "could not say" — was read as **"accounts exist"**, so a fresh production deployment showed the sign-in form and the first-run setup screen never appeared | Three answers: 0 → setup, N → sign in, failure → neither form, with the reason and a Try again |
| `AdminDashboard.tsx`, `AdminSubmissionDetail.tsx` | Already the reference implementations | Unchanged; confirmed honest (per-part failures, `Figure`, 401/403/404/unreachable worded separately) |

### Left alone deliberately

26 files were already honest at the baseline and were **not** converted, to
avoid churn on correct code: `CrmTasks`, `CrmPipeline`, `CrmMyDay`,
`CrmReporting`, `CrmAutomationQueue`, `CrmIntakeCases`,
`CrmReceptionistAccounts`, `CrmStaffAdmin`, `CrmAdminSettings`, `CrmCompanies`,
`CrmCampaignBuilderPage`, `CrmDuplicates`, `SegmentBuilder`,
`UnmappedOwnersPanel`, `CustomerTimeline`, `CustomerPortalPanel`,
`CampaignResults`, `CompanySuggestionsDialog`, `LinkCompanyDialog`, and the
seven customer-portal pages, which carry the portal's own equally honest
`PortalLoadState` / `PortalErrorState` contract.

They are recorded in `OWN_HONEST_STATE_ALLOWLIST` in the regression guard, each
with the reason it is honest. That list is designed to shrink: an entry fails
the moment its file adopts the shared loader.

## The regression guard

`artifacts/web-agency/src/lib/honestLoads.test.ts` (vitest). It scans
`pages/crm/**`, `pages/portal/**` and `components/crm/**` and asserts:

1. every **rendering** file that reads the API carries a three-state loader —
   `@/lib/adminLoad` or the portal's `PortalLoadState` — or sits on one of two
   commented allowlists (`NO_LIST_ALLOWLIST` for files with no list at all,
   `OWN_HONEST_STATE_ALLOWLIST` for the already-honest ones);
2. no file swallows a failure with `.catch(() => {})` — the idiom behind the two
   worst cases above. Comments are stripped before scanning, so a note
   explaining a swallow a file used to have is not mistaken for the swallow
   itself; clipboard writes and `video.play()` are exempt; and a third list,
   `SWALLOW_ALLOWLIST`, carries the one call that is genuinely not a load (an
   autosaved draft, which claims nothing either way);
3. both allowlists stay honest: an entry must name a real rendering file that
   still reads the API, must carry a reason, and becomes a **failure** once its
   file adopts the shared loader.

Failure messages name the file and say what to do.

## Judgement calls worth review

- **`CrmCampaigns.tsx`** keeps `campaigns` as a plain array and tracks the load
  separately, rather than threading `Load<T>` through a 3,200-line file. The
  rule is satisfied — no count or empty state renders for a failed read — with
  far less risk than a full rewrite.
- **`CrmOperations.tsx`** was touched only on its two dishonest queues; its
  Board and List were already correct and were left exactly as they were.
- Native `confirm()` dialogs were left alone throughout — pre-existing, and
  owned by a different workstream.
