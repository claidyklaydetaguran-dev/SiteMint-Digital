---
name: QA'ing branch/conditional UI fields
description: How to reliably verify sibling dropdowns/inputs that share option sets (e.g. true/false branch targets) actually persist independently
---

When a Playwright-based testing subagent reports that two sibling form controls (e.g. "then go to" / "else go to" step selects with identical option lists) ended up with the same selected value, don't assume it's an app bug from that single run alone.

**Why:** in one QA pass on `CrmCampaignSequence.tsx`'s branch-target selects, the agent reported both targets saved as the same step. A code review showed the two `<select>` elements had fully independent React state and `onChange` handlers — no shared variable. A narrow, isolated re-test (single interaction, explicit before/after value checks) succeeded and the DB showed the correct distinct values. The first run's failure was interaction flakiness (mis-click/mis-read), not a real defect.

**How to apply:** when a report like this comes in, (1) read the actual component code for the two controls to check they're wired independently, (2) query the database/API directly for the persisted values rather than trusting only the agent's page-snapshot description, and (3) if code looks correct, re-run a narrower, more explicit test plan before concluding there's a bug. Don't ship a "fix" for a race that only ever reproduced once when the code review shows no shared state.
