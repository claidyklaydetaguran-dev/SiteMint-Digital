# Production Contacts / text schema repair

## Confirmed failure

On 2026-09-27 the published receptionist Contacts endpoint returned 500.
The production Replit log reports `relation "voice_sms_inbound" does not exist`
from `contactsQuery.ts`. Replit's Production Database inventory independently
shows no such table. The current Contacts list depends on it even for an empty
list; global search therefore reports incomplete results.

The inventory reports zero voice contacts, call links, call reviews, SMS
consents and SMS outbox records. No customer records were created or removed
for this inspection. An empty production dataset does not prove the schema works.

## Reviewed existing migration

`lib/db/drizzle/voice/0015_sms_replies_appointment_updates.sql` already exists
in the released source. It is not a new schema design. Its complete scope is:

- Create `voice_sms_inbound`, with its firm foreign key, validation constraints,
  provider-message uniqueness and query indexes.
- Replace the voice contact origin check to also accept `text`.
- Replace the SMS outbox kind check to also accept `appointment_update`.
- Record the migration through the existing guarded voice journal mechanism.

It does not delete records, alter customer/account columns, copy the development
database, activate SMS, change number webhooks, or enable billing. It briefly
requires schema locks. Leave additive schema in place if application rollback
is needed; the committed destructive rollback SQL is NOT part of this plan.

## Execution gate

`CLAUDE.md` and `lib/db/MIGRATIONS.md` prohibit production migrations without
explicit environment-specific owner authorization. Publication permission was
used for the application release; this production schema exception has NOT
been inferred from it.

Read-only `pnpm --filter @workspace/db run preflight --target prod` was attempted
in Web Asset Builder. It refused because `PROD_DATABASE_URL` is not configured.
No fallback to the development `DATABASE_URL` was used. No production migration
has run. The actual production migration journal is therefore still unverified.

## Concrete repair sequence, after authorization

1. Owner privately configures the Web Asset Builder production connection as
   `PROD_DATABASE_URL`; never paste it into chat or print it. Keep it server-only.
2. Run the read-only identity and preflight tools for `--target prod`. Match the
   actual deployment database. Confirm journal hashes and that **only 0015** is
   pending. If journals disagree, or more migrations are pending, stop and
   report the actual scope rather than running a broad migration.
3. Take a protected production backup/snapshot and record table counts/schema.
   Confirm its recovery path. Do not copy the database into staging or Git.
4. Use the guarded `migrate:voice` runner with the verified database name,
   fingerprint, `--target prod --confirm prod`. No `push`, no `migrate:fresh`,
   no unjournalled hand-written SQL, no disabled guards.
5. Verify journal hash, new table/index/constraints, and unchanged existing row
   counts. Verify authenticated Contacts returns normally, global search no
   longer has a contact-fetch error, and text-thread reads work for an authorized
   existing contact when available. Do not invent production contacts or send
   SMS to populate an otherwise empty screen.

## Separate application fix

The audit also reproduced incorrectly correlated contact summary subqueries on
an isolated database: a firm's summary could inherit another firm's unread
count/STOP status. Explicit SQL qualification fixes the counts/consent/review/
appointment correlations. The new two-firm regression failed before the fix and
passes afterward. This code repair does not create the missing production table.

## Acceptance boundary

Until step 5 passes, Contacts and text storage are launch blockers. The UI release,
health endpoint and passing tests on a fresh local database do not override this
production evidence. Paid activation and real-provider tests remain separate.
