/**
 * V5 PR-8 — kept only so the existing `/logs` registration in `routes.ts`
 * keeps rendering real content without a routing change. The implementation
 * moved to `pages/Calls.tsx` (renamed, with the new category chip added). No
 * behavioural difference for anyone still on `/logs` today.
 *
 * Report to the lead: register `calls: "/calls"` in `ROUTES`
 * (`lib/routes.ts`) pointing at `pages/Calls.tsx`, and either point `/logs`
 * at a redirect to `/calls` or retire this file once nothing links to
 * `/logs` anymore. This file cannot make that routing change itself —
 * `routes.ts` and `App.tsx` are outside this work package's scope.
 */

export { default } from "./Calls";
