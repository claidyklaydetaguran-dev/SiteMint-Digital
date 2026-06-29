# SiteMint Digital CRM — Development Rules

> Read this file before every development session.
> These rules exist to prevent scope creep, spaghetti code, and accidental breakage of locked modules.
> Last updated: 2026-06-27

---

## 1. Read Before You Build

Before writing any code, read:
1. `ARCHITECTURE.md` — module statuses, route map, table map, locked files
2. The specific page/route file(s) relevant to the task — no more

Do NOT read the entire repo. Do NOT load files unrelated to the task.

---

## 2. Change Budget (Default Per Session)

Every session starts with this budget. If a task will exceed it, **stop and report to the user before continuing.**

| Resource | Limit |
|---|---|
| Files changed | 5 |
| Lines changed | 300 |
| DB migrations | 1 (`pnpm --filter @workspace/db run push`) |
| New utility files | 1 |
| New React components | 2 |

Budget exceptions must be explicitly approved by the user in the prompt (e.g. "this is a large refactor, touch as many files as needed").

---

## 3. Surgical Edits Only

- Prefer targeted `edit` (find-and-replace block) over full file rewrites.
- Full rewrites require explicit user approval ("rewrite this file").
- Do not clean up, reformat, or refactor code outside the task scope.
- Do not rename files or move imports unless the task requires it.
- Do not add comments or documentation to working code unless asked.

---

## 4. Database Rules

- **Drizzle `push` only.** Run `pnpm --filter @workspace/db run push` after schema changes.
- **No migration files.** Do not use `drizzle-kit generate` or `drizzle-kit migrate`.
- **No auto schema sync.** Never call `db.sync()` or equivalent.
- After changing any `lib/db` schema file, run `pnpm run typecheck:libs` to rebuild declarations before checking leaf artifacts.
- One schema change = one `push` = one migration slot in the change budget.
- Do not alter existing column types or drop columns without explicit user approval.

---

## 5. Locked Modules — Absolute Rules

These files must never be modified unless the user's prompt explicitly names them and requests a change.

| File | Rule |
|---|---|
| `artifacts/api-server/src/routes/phone.ts` | Never touch — Twilio webhooks; external URLs are registered with Twilio |
| `artifacts/web-agency/src/lib/discEngine.ts` | Never touch — DISC behavioral engine |
| `artifacts/web-agency/src/lib/leadScore.ts` | Never touch — lead health scoring engine |
| `artifacts/web-agency/src/lib/communicationIntelligence.ts` | Never touch — CI engine |
| `artifacts/web-agency/src/lib/workflowEngine.ts` | Never touch — workflow trigger engine |


If a task would require touching a locked module, **stop and tell the user** before proceeding.

---

## 6. Stable Modules — Touch Only What the Task Requires

Stable modules work correctly. Do not refactor, reorganize, or "improve" them while working on an adjacent feature.

If a stable module needs a change to support a new feature, make only the minimum addition (e.g. a new route appended to `crm.ts`, not a reorganization of the file).

---

## 7. Testing Rules

Test only:
1. The page(s) or API route(s) changed in this session
2. TypeScript compilation: `pnpm --filter @workspace/<artifact> run typecheck`

Do NOT run the full test suite for unrelated modules.
Do NOT write new tests for stable or locked modules.

**Required checks before marking any task done:**
- `npx tsc --noEmit` exits 0 in `api-server` (only pre-existing errors are allowed)
- `npx tsc --noEmit` exits 0 in `web-agency` (TypeScript baseline is now fully clean)
- At least one `curl` or Playwright test for every new API route
- Both workflows (api-server, web-agency) running without errors in logs

---

## 8. Route Ordering in `crm.ts`

Express matches routes top-to-bottom. Static routes must come BEFORE parameterized routes:

```
// CORRECT
router.post("/crm/campaigns/test-send", ...)    // static — line ~556
router.get("/crm/campaigns/:id", ...)           // parameterized — line ~422

// WRONG — :id would swallow "test-send"
router.get("/crm/campaigns/:id", ...)
router.post("/crm/campaigns/test-send", ...)
```

When adding new campaign (or any) sub-routes, append static paths above the `/:id` group.

---

## 9. Auth Pattern

All CRM API routes must use the `requireAdmin` middleware:

```ts
router.get("/crm/my-new-route", requireAdmin, async (req, res) => { ... });
```

The frontend sends `Authorization: Bearer <token>` on every request. The token is stored in `localStorage` as `adminToken`. It resets on every API server restart.

---

## 10. Email Safety Guard

`CRM_EMAIL_TEST_MODE` must be explicitly set to `"false"` in the environment to enable real sends via Resend. When it is unset or any other value, all email routes simulate the send and return `{ testMode: true }`. Do not remove this guard.

---

## 11. No Scope Creep

If you notice something unrelated that "could be improved" while working on a task:
- Do NOT fix it.
- Do NOT mention it unless it is a blocking bug.
- Log it mentally and let the user decide if it becomes a future task.

---

## 12. Product QA Cycle (Mandatory After Each Product Milestone)

After completing a full product milestone (Communications Center, Sales OS, Marketing Hub, etc.), **do not immediately move to the next product**. Follow this cycle:

1. **Build** — complete the product milestone
2. **QA Pass** — audit the product for regressions, UX inconsistencies, broken routes, type errors, missing data, and console warnings
3. **Fix** — address all findings from the QA pass (bugs only, not scope additions)
4. **Freeze** — mark the product as STABLE in ARCHITECTURE.md, then move to the next product

A QA pass covers:
- All routes in the product load without errors
- All CRUD operations work end-to-end (create, read, update, delete)
- TypeScript compiles clean (`tsc --noEmit`)
- No React console warnings in the browser (key warnings, hook violations, etc.)
- Nav links are correct and active states match
- Any generated documents (proposals, SOWs) render correctly in the preview iframe

---

## 13. Reporting (End of Every Session)

Return a structured report with:
1. Files changed (path + one-line description of change)
2. API endpoints added or modified
3. DB schema changes + migration run (yes/no)
4. TypeScript status (clean / known errors only)
5. Tests performed (curl commands or Playwright)
6. Any budget overruns (explain why)
7. Known limitations or deferred work
8. Recommended next prompt (Phase N+1)

---

## Future Prompt Template

Copy and adapt this template when starting a new development session:

```
Read ARCHITECTURE.md and DEVELOPMENT_RULES.md first.

Work only inside [MODULE NAME — e.g. Campaigns].

Do not touch locked modules (discEngine, leadScore, communicationIntelligence,
workflowEngine, phone.ts).

Stay within the default change budget (5 files, 300 lines, 1 migration, 1 utility, 2 components).

Make surgical edits only.

Task:
[Describe the feature or fix in plain terms]

Return:
- Files changed
- API endpoints added/modified
- DB migration run (yes/no)
- TypeScript status
- Tests performed
- Known limitations
```

---

## Appendix: Quick Reference

### Run commands
```bash
# Type-check backend
cd artifacts/api-server && npx tsc --noEmit

# Type-check frontend
cd artifacts/web-agency && npx tsc --noEmit

# Type-check shared libs (run after schema changes)
pnpm run typecheck:libs

# Push DB schema
pnpm --filter @workspace/db run push

# Restart workflows (via Replit UI or restart_workflow tool)
# artifacts/api-server: API Server
# artifacts/web-agency: web
```

### Auth flow (for curl tests)
```bash
TOKEN=$(curl -s -X POST "http://localhost:80/api/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"sitemint2024"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -s "http://localhost:80/api/crm/leads" \
  -H "Authorization: Bearer $TOKEN"
```

### Active development area
Module: **Campaigns — automation extensions** — see SiteMint Campaign Automation Roadmap (Phases 26A–26I) in ARCHITECTURE.md
Campaigns is STABLE and feature-rich: broadcast + multi-step nurture/drip sequences, enrollment, auto-send scheduler, message queue, stop-on-reply, and funnel analytics are all built. **Do NOT rebuild Campaigns, the CRM, the schema, or Twilio.**
Known PARTIAL gaps (safe to close next): send-time-window enforcement in the scheduler (26F), call-prompt/task steps creating real CRM tasks, bulk reschedule of enrolled contacts (26H).
Not-yet-built (larger, additive): SiteMint persona + topic taxonomy (26B), switch/routing logic (26E), AI campaign generator (26G).
