-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — M5 Marketing flow
--
-- Reviewed schema change for the integration owner. Six additive columns and
-- one CHECK on ONE existing table, `crm_marketing_campaigns`. No table is
-- created, no column is renamed, retyped, dropped or backfilled, and no other
-- table is touched. In particular the sequence engine's `crm_campaigns`,
-- `crm_campaign_steps`, `crm_campaign_scheduled_messages` and the shared
-- `crm_email_suppressions` are left exactly as they are.
--
-- Why these six columns exist, in the order they matter:
--
--   audience_mode / audience_definition / audience_lead_ids
--     Before this, a campaign could only point at a saved segment
--     (`segment_id`). So the first thing a person who wanted to mail eleven
--     named customers had to do was invent a reusable, uniquely-named audience
--     — a dead end that had nothing to do with the email they came to write.
--     `filter` holds the same condition shape a segment holds, on the campaign
--     itself, so it is still a DEFINITION and is still re-evaluated the moment
--     the send starts; `list` holds the ids somebody picked by hand, which is
--     the one audience that is deliberately frozen, because "these eleven
--     people" is exactly what was meant. `segment_id` keeps its meaning and
--     every existing row keeps working: the default is 'segment'.
--
--   scheduled_timezone
--     `scheduled_at` is an instant and is unambiguous on its own. This records
--     the zone the person was thinking in, so the screen can say "9:00 AM, Los
--     Angeles time" instead of silently showing two colleagues in two zones two
--     different hours for the same send.
--
--   updated_by_staff_id / updated_by_label
--     Two people editing one campaign is the normal case in a small office.
--     "Somebody else changed this" is not an actionable message; the
--     optimistic-concurrency refusal names this person instead.
--
-- Apply with:
--   psql "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M5-marketing-flow.sql
--   psql "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M5-marketing-flow.sql
--
-- Do NOT run `drizzle-kit push` for this: it needs a TTY and its tablesFilter
-- breaks introspection (see project notes on the push table boundary).
--
-- Re-runnable: every statement is IF NOT EXISTS or guarded, so applying it
-- twice changes nothing the second time.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── The audience, without a saved segment as a prerequisite ────────────────
--
-- NOT NULL with a default rather than a nullable column: an unset mode would
-- have to be interpreted somewhere, and "interpreted somewhere" is how one
-- caller decides a campaign has no audience while another decides it has
-- everybody. Every existing row becomes 'segment', which is what they are.

ALTER TABLE crm_marketing_campaigns
  ADD COLUMN IF NOT EXISTS audience_mode text NOT NULL DEFAULT 'segment';

-- The same `{match, conditions}` shape `crm_marketing_segments.definition`
-- holds. Validated by the API before it is stored, exactly as a segment's is.
ALTER TABLE crm_marketing_campaigns
  ADD COLUMN IF NOT EXISTS audience_definition jsonb;

-- A JSON array of `crm_leads.id`. No FK, consistent with `segment_id` and the
-- rest of crm_*; a contact deleted afterwards simply stops resolving, and the
-- recipient ledger already records who was actually mailed.
ALTER TABLE crm_marketing_campaigns
  ADD COLUMN IF NOT EXISTS audience_lead_ids jsonb;

-- A closed vocabulary, for the same reason the status column has one: a typo'd
-- mode must fail at write time rather than silently resolve to "nobody" — or,
-- far worse, be treated as "everybody" by whichever branch runs last.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_crm_marketing_campaigns_audience_mode'
      AND conrelid = 'crm_marketing_campaigns'::regclass
  ) THEN
    ALTER TABLE crm_marketing_campaigns
      ADD CONSTRAINT ck_crm_marketing_campaigns_audience_mode
      CHECK (audience_mode IN ('segment', 'filter', 'list'));
  END IF;
END $$;

-- ── The zone somebody scheduled in ─────────────────────────────────────────

ALTER TABLE crm_marketing_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_timezone text;

-- ── Who edited it last ─────────────────────────────────────────────────────

ALTER TABLE crm_marketing_campaigns
  ADD COLUMN IF NOT EXISTS updated_by_staff_id integer;

ALTER TABLE crm_marketing_campaigns
  ADD COLUMN IF NOT EXISTS updated_by_label text;

COMMIT;

-- ───────────────────────────────────────────────────────────────────────────
-- Rollback
--
-- Safe in the sense that it restores the previous structure exactly. It is NOT
-- free: any campaign whose audience was a campaign-local filter or a hand-picked
-- list loses that audience entirely, because there is nowhere else it was
-- written down. Those campaigns become audience-less drafts and preflight will
-- refuse to send them — which is the correct failure, but it is a failure, so
-- read the count below before running this.
--
--   SELECT audience_mode, count(*) FROM crm_marketing_campaigns GROUP BY 1;
--
-- BEGIN;
-- ALTER TABLE crm_marketing_campaigns DROP CONSTRAINT IF EXISTS ck_crm_marketing_campaigns_audience_mode;
-- ALTER TABLE crm_marketing_campaigns DROP COLUMN IF EXISTS audience_mode;
-- ALTER TABLE crm_marketing_campaigns DROP COLUMN IF EXISTS audience_definition;
-- ALTER TABLE crm_marketing_campaigns DROP COLUMN IF EXISTS audience_lead_ids;
-- ALTER TABLE crm_marketing_campaigns DROP COLUMN IF EXISTS scheduled_timezone;
-- ALTER TABLE crm_marketing_campaigns DROP COLUMN IF EXISTS updated_by_staff_id;
-- ALTER TABLE crm_marketing_campaigns DROP COLUMN IF EXISTS updated_by_label;
-- COMMIT;
-- ───────────────────────────────────────────────────────────────────────────
