---
paths:
  - "artifacts/helpdesk/**"
  - "artifacts/api-server/src/routes/receptionistVoiceAssistants.ts"
  - "artifacts/api-server/src/lib/voice/**"
  - "artifacts/api-server/src/lib/voiceAssistants/**"
  - "artifacts/api-server/src/lib/voicePublishing/**"
  - "lib/db/src/schema/voice/**"
  - "lib/db/src/schema/voiceAssistants.ts"
  - "lib/db/src/schema/voiceIssues.ts"
  - "lib/db/drizzle/voice/**"
---

# AI Receptionist operating boundary

- Read `CLAUDE.md`, `docs/roadmap/ACTIVE.md`, and the active PRD before editing.
- Work on one approved customer journey only. Do not create another phase.
- Do not modify the protected SMS, authentication, billing, CRM, or intake files listed in `CLAUDE.md`.
- Preserve firm scoping. The authenticated `firmId` comes only from the server session.
- Vapi private credentials stay server-side. Only the documented Vapi public browser key may enter the dashboard build.
- Never import the intake SMS number into Vapi or alter its Twilio webhook.
- Voice schema changes require reviewed, versioned, additive migrations and rollback SQL.
- Do not run a migration, merge, push, publish, deploy, or change production data without explicit owner approval.
- When the active PRD acceptance criteria and verification checks pass, stop. Put unrelated suggestions under `Future considerations`; do not implement them.
