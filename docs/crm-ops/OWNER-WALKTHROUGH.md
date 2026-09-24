# SiteMint CRM — Owner Walkthrough (plain language)

> How to run one piece of client work through the CRM, end to end.
> Written 2026-09-11 against branch `claude/sitemint-crm-operations-124038`.

## Where to sign in

- **Live (production):** https://sitemintdigital.com/admin — enter the admin password.
  Production runs whatever the last deployment shipped; the improvements on this
  branch reach it only after the integration owner merges and redeploys.
- Your session is a browser token today; if the server restarts you'll be asked
  to sign in again. There is no "forgot password" — the password is the
  `ADMIN_PASSWORD` secret in the server environment.

## The daily loop (5 questions the Command Center answers)

Open **Home → Command Center** (`/admin/crm/dashboard`). Top to bottom:

1. **What needs attention today?** — "Today's Tasks" (overdue tasks first, in red).
2. **Which inquiries need a response?** — "Inquiries Needing a Response" lists every
   Discovery submission nobody has reviewed yet.
3. **What is overdue?** — "Leads Needing Follow-Up" (red = overdue, yellow = due today).
4. **Who owns the next action?** — each task/lead card names its owner ("Assigned").
   Honest caveat: owners are typed names, not accounts — the system can't yet stop
   two people from both assuming the other has it.
5. **Which projects are approaching a deadline?** — "Approaching Deadlines" shows
   every project whose target launch date is missed or within 14 days.

## Running a sample project end to end

1. **Inquiry arrives.** A Discovery form submission appears in
   **Operations → Discovery CRM** with status **New** (and on the Command Center).
   A follow-up task due tomorrow is created automatically, and a CRM lead is
   created or matched by email.
2. **Review and assign.** Open the lead (Sales → Contacts → click the name).
   Set **Assigned**, **Priority**, and a **Next follow-up** date. Change status to
   **Qualified** when it's real. In Discovery CRM, set the submission to **Reviewed**.
3. **Send scope.** In Discovery CRM, open the submission → **Generate Proposal**.
   The proposal and SOW are saved on the record and printable. (Email sending is in
   test mode unless the server's `CRM_EMAIL_TEST_MODE` is set to `false` — the
   Settings page now shows which mode you're in.)
4. **Win it → project.** In the submission drawer, **Convert to Project**. A project
   is created with a task checklist for that service type. Converting twice is
   blocked, so a double-click can't duplicate a project.
5. **Deliver.** **Operations → Projects**: drag the project across stages
   (Strategy → Design → Development → … → Launched), tick tasks in the drawer as
   the work completes, keep the target launch date honest — it drives the
   deadline panel on the Command Center.
6. **Close and follow up.** On the lead, add a post-launch follow-up task (e.g.
   +7 days). When it comes due it appears in My Day / Tasks. Mark the lead
   **Won → Client** and the project **Completed**.

Everything above persists in PostgreSQL and was proven by an automated
end-to-end test that runs the exact journey through the real server
(`artifacts/api-server/src/routes/crmOperationsJourney.test.ts`, 17 checks).

## What to trust and what not to (today)

- **Trust:** leads, tasks, projects, deals, campaigns, discovery records — all real
  and persisted. The dashboard numbers come from the database.
- **Don't rely on yet:** reminder notifications (dates exist, nothing pings you);
  per-person logins (one shared password, "assigned" is text); email deliverability
  reporting outside Campaigns; file attachments (none).
- **Fixed this pass:** dead buttons that did nothing (leads bulk strip, settings
  "Save", admin-hub tiles), a search box that ignored typing, the discovery screen
  bypassing sign-in handling, the unreachable CSV export, pages that hung on a
  spinner when a request failed, and phone-layout breakage on the contacts list.
