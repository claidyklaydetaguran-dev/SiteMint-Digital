# AR-001 — AI Receptionist Browser Voice Launch Candidate

## Goal

Give SiteMint and its client a truthful, polished demonstration of a working AI voice assistant today without exposing production data, changing the intake SMS pipeline, or pretending later phone and booking capabilities are complete.

## User journey

1. A receptionist customer signs in.
2. The customer creates an assistant from a template.
3. The customer edits and saves the greeting, instructions, and voice preset.
4. The customer publishes the saved assistant to Vapi.
5. The dashboard shows the provider-connected status.
6. The customer starts and ends a real browser microphone call.
7. Failures display safe, actionable messages and do not trigger automatic duplicate publishing.

## In scope

- Existing receptionist cookie authentication
- Assistant list, create, edit, duplicate, guarded delete, save, and publish
- Server-owned runtime preset catalog
- Vapi server adapter and browser SDK adapter
- Browser microphone disclosure, lifecycle, and teardown
- Voice database migration for the existing Milestone 1 tables
- Environment documentation
- Automated unit tests for runtime-catalog and provider mapping boundaries
- Build, typecheck, staging UAT, release, and rollback evidence

## Out of scope

- Assigning or importing a phone number
- Inbound or outbound telephone calls
- Calendar availability, booking, rebooking, or cancellation
- Call transcript, recording, summary, analysis, or CRM ingestion
- Contacts implementation
- Voice usage enforcement or billing
- Production deployment before staging approval

## Acceptance criteria

1. The full workspace typecheck and production build pass.
2. Automated voice-boundary unit tests pass.
3. No protected SMS, receptionist auth, billing, intake, CRM, or phone file changes.
4. The voice migration is reviewed and applied only to the staging database.
5. Vapi private keys never appear in the browser bundle, logs, responses, or repository.
6. Assistant CRUD remains authenticated and firm-scoped.
7. Publish accepts no client-controlled provider, firm, attempt, status, or runtime fields.
8. One staging assistant publishes successfully and stores its provider assistant ID.
9. A browser call connects, uses the microphone only after consent, and ends cleanly.
10. The dashboard contains no internal checkpoint/phase placeholder language in the customer journey.
11. Turning off the voice build flags and backend publish flag disables the launch candidate without affecting SMS.

## Stop condition

When the criteria above pass, stop. Do not implement the out-of-scope roadmap items.
