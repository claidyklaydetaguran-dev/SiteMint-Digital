-- ───────────────────────────────────────────────────────────────────────────
-- SiteMint CRM — who a contact belongs to: crm_leads.assigned_to_staff_id
--
-- Reviewed schema change for the integration owner. ADDITIVE ONLY:
--
--   * one NEW column on crm_leads, assigned_to_staff_id — NULLABLE, a foreign
--     key to crm_staff(id), with its own index;
--   * one NEW table, crm_lead_owner_mappings — the record of every decision
--     that pointed contacts carrying a free-text owner name at a member of
--     staff: which rule or which person decided, when, and how many contacts
--     it moved;
--   * a BACKFILL that resolves the existing free-text names onto staff rows and
--     records each of those decisions — the only statements in this file that
--     change data, and the only ones worth arguing about.
--
-- `crm_leads.assigned_to` is NOT dropped, renamed, narrowed or altered, and no
-- other column or table is touched. (The review panel later appends to
-- crm_staff.legacy_names — an existing M1 column this file does not change.)
--
-- ORDER: apply this file BEFORE starting the application version that ships
-- it. That version selects assigned_to_staff_id on every contact query and
-- fails without the column. The previous version keeps working after this file
-- is applied: the column is nullable and the table is new.
--
-- The shape is defined in lib/db/src/schema/crmLeads.ts and this file is the
-- same thing said in SQL, with drizzle's own constraint names, so a later
-- `drizzle-kit push` finds nothing to rename. CRM tables are otherwise
-- maintained with push — this file exists because push has no opinion about
-- the rows already in the table, and those rows are the hard part. A FIRST
-- INSTALLATION (M4-crm-first-install.sql) does not carry this column or table,
-- so a virgin install must still run this file.
--
-- ── What was wrong ─────────────────────────────────────────────────────────
--
-- `assigned_to` is free text. Three consequences, all of them live:
--
--   1. Nothing connected a contact's owner to the person who signs in. Every
--      picker offered three names typed into the source in an earlier
--      milestone; renaming somebody in People changed nothing, and a fourth
--      member of staff could not be given a contact without a code change.
--   2. Two spellings of one person are two owners. "Saisa Lorraigne",
--      "saisa lorraigne" and "Saisa" are three different values to every
--      GROUP BY in the product.
--   3. A name lookup done at READ time is a guess repeated on every query. It
--      changes answer silently when somebody is renamed, and it has no way to
--      say "this could be either of two people".
--
-- So the decision is made once — by the rules below, or by a person — and
-- recorded. Nothing in the application derives the id from the name at read
-- time.
--
-- ── The comparison key ─────────────────────────────────────────────────────
--
--   key(v) = translate(btrim(v, ' ' || chr(9) || chr(10) || chr(13)),
--                      'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz')
--
-- Edge spaces, tabs, CRs and LFs are removed and ASCII letters are folded to
-- lower case. Nothing else: inner spacing, punctuation, accents and the case of
-- non-ASCII letters are compared exactly. lower() is deliberately NOT used — it
-- follows the database's locale (under the C locale it leaves "É" alone) while
-- the application's JavaScript follows Unicode, so a lower()-based key would
-- let this file and the application decide differently about the same name on
-- some installs. The application states the identical key in
-- artifacts/api-server/src/lib/leadOwnerRules.ts, and
-- crmLeadAssignment.test.ts runs this file and that code over the same fixtures
-- and fails if they disagree about a single contact.
--
-- ── The matching rules, in order ───────────────────────────────────────────
--
-- Every distinct unresolved value of `assigned_to` is offered to three rules.
-- The FIRST rule that matches anybody decides; later rules are not consulted.
--
--   Rule 1 — display name.  key(assigned_to) = key(crm_staff.display_name).
--
--   Rule 2 — legacy names.  key(assigned_to) equals the key of an entry in
--            crm_staff.legacy_names. That array was added in M1 for exactly
--            this purpose, so this file uses it rather than inventing a
--            parallel one — and the review panel WRITES to it, so a name a
--            person decides once resolves by itself from then on.
--
--   Rule 3 — email address. key(assigned_to) = key(crm_staff.email). Some
--            rows carry an address rather than a name.
--
-- Nothing else is attempted. There is no first-name match, no initials, no
-- substring, no edit distance, no "closest one wins". Every one of those
-- invents an answer that looks like a discovery.
--
-- ── What is left NULL, and why that is the point ───────────────────────────
--
-- A value is mapped ONLY when the deciding rule names exactly ONE staff row.
-- Otherwise the column stays NULL and the value is REPORTED:
--
--   * No rule matched.  Nobody in crm_staff is called that.
--   * The deciding rule matched TWO OR MORE people — two staff rows sharing a
--     display name, or a legacy name recorded on two accounts. The database
--     cannot know which, and neither can this file. A name that is one
--     person's display name and another person's legacy name is NOT
--     ambiguous: rule 1 decides and rule 2 is never consulted.
--
-- An unresolved value is not a failure of the backfill; it is the backfill
-- declining to make somebody else's decision. The owner resolves each one in
-- the CRM at /admin/crm/admin → "Unmapped lead owners", which points those
-- contacts at the person chosen and writes a crm_lead_owner_mappings row naming
-- who decided and when.
--
-- Two deliberate choices inside the rules:
--
--   * DISABLED and INVITED staff are matchable. A contact legitimately belongs
--     to somebody who has since left; staff rows are retained rather than
--     deleted for exactly that reason. The PICKER, by contrast, offers only
--     active staff — new work may not be handed to a disabled account.
--
--   * `updated_at` is NOT bumped. This repairs a reference; it is not an edit
--     to the contact, and bumping it would make every contact in the book look
--     as though somebody worked it on the morning this file was applied — on
--     the one screen ("Last Communication" / "Updated") whose whole job is to
--     say when somebody last did.
--
-- ── Apply with ─────────────────────────────────────────────────────────────
--   psql -v ON_ERROR_STOP=1 "$CRM_TEST_DATABASE_URL"    -f docs/crm-ops/schema/M6-lead-assignee.sql
--   psql -v ON_ERROR_STOP=1 "$CRM_PREVIEW_DATABASE_URL" -f docs/crm-ops/schema/M6-lead-assignee.sql
--
-- Take the backup and the restore drill first (RELEASE-PACKAGE.md §4).
--
-- IDEMPOTENT, and safe to re-run: every DDL statement is guarded, and the
-- backfill only ever touches rows whose assigned_to_staff_id IS NULL, so a
-- second run changes nothing it already decided and — critically — cannot undo
-- a mapping a person has since made by hand. Re-running it after somebody has
-- recorded a legacy name resolves exactly the rows that name now covers, and
-- records that too.
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- Roll the APPLICATION back first (see ORDER above). Dropping the column loses
-- every resolved owner; `assigned_to` still holds the names, so the work is
-- repeatable, not recoverable.
--
--   BEGIN;
--   -- Optional, and only BEFORE the table is dropped: take back the legacy
--   -- names the review panel recorded, so staff rows are exactly as they were.
--   UPDATE crm_staff s
--      SET legacy_names = ARRAY(
--            SELECT u.name FROM unnest(s.legacy_names) WITH ORDINALITY AS u(name, i)
--             WHERE u.name NOT IN (SELECT m.value_label FROM crm_lead_owner_mappings m
--                                   WHERE m.staff_id = s.id AND m.legacy_name_added)
--             ORDER BY u.i)
--    WHERE EXISTS (SELECT 1 FROM crm_lead_owner_mappings m
--                   WHERE m.staff_id = s.id AND m.legacy_name_added);
--   DROP TABLE IF EXISTS crm_lead_owner_mappings;
--   ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_assigned_to_staff_id_crm_staff_id_fk;
--   DROP INDEX IF EXISTS ix_crm_leads_assigned_to_staff_id;
--   ALTER TABLE crm_leads DROP COLUMN IF EXISTS assigned_to_staff_id;
--   COMMIT;
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- The application's mapping action takes the same lock, so a person deciding a
-- name in the review panel can never interleave with this backfill.
SELECT pg_advisory_xact_lock(hashtext('crm_lead_owner_mappings'));

-- ── The column ─────────────────────────────────────────────────────────────
--
-- Nullable, and stays nullable. NULL is a real state with a real meaning —
-- "no person has been resolved for this contact" — and it is the state the
-- review panel exists to show. A NOT NULL column would need a sentinel staff
-- row meaning "nobody", and every query would have to remember to exclude it.

ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS assigned_to_staff_id integer;

-- ON DELETE SET NULL: staff rows are disabled rather than deleted so that
-- attribution survives, but if one ever IS deleted, a contact must not become
-- undeletable and must not point at a person who is gone. The name in
-- `assigned_to` is untouched, so the value reappears in the unresolved list.
DO $$
BEGIN
  -- An earlier draft of this file named the constraint differently. Carry it
  -- over to drizzle's name rather than leaving two definitions to argue.
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'fk_crm_leads_assigned_to_staff'
                AND conrelid = 'public.crm_leads'::regclass)
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conname = 'crm_leads_assigned_to_staff_id_crm_staff_id_fk'
                        AND conrelid = 'public.crm_leads'::regclass) THEN
    ALTER TABLE crm_leads RENAME CONSTRAINT fk_crm_leads_assigned_to_staff
      TO crm_leads_assigned_to_staff_id_crm_staff_id_fk;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_leads_assigned_to_staff_id_crm_staff_id_fk'
                    AND conrelid = 'public.crm_leads'::regclass) THEN
    ALTER TABLE crm_leads
      ADD CONSTRAINT crm_leads_assigned_to_staff_id_crm_staff_id_fk
      FOREIGN KEY (assigned_to_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_crm_leads_assigned_to_staff_id
  ON crm_leads (assigned_to_staff_id);

COMMENT ON COLUMN crm_leads.assigned_to_staff_id IS
  'The staff member this contact belongs to. NULL = not resolved to a person (unassigned, or assigned_to holds a name that did not match exactly one staff row). Never derived from assigned_to at read time.';
COMMENT ON COLUMN crm_leads.assigned_to IS
  'The owner name as it was recorded. RETAINED as the audit trail of what was recorded; assigned_to_staff_id is the reference. Every assignment writes both.';

-- ── The record of mapping decisions ────────────────────────────────────────
--
-- One row per decision. `rule` is display_name / legacy_name / email when that
-- rule decided, or manual when a person did. `decided_by_staff_id` is the
-- person (NULL for this backfill); `decided_by_label` says who or what decided
-- as text, so the answer survives that staff row. Nothing reads this table to
-- decide an owner — it exists so the mapping is visible and attributable.
--
-- staff_id is ON DELETE CASCADE: a deleted staff row's contacts lose their id
-- (SET NULL above) and return to the unresolved list, where a record pointing
-- at nobody would only mislead.

CREATE TABLE IF NOT EXISTS crm_lead_owner_mappings (
  id                  serial PRIMARY KEY,
  value_key           text NOT NULL,
  value_label         text NOT NULL,
  staff_id            integer NOT NULL,
  rule                text NOT NULL,
  leads_updated       integer NOT NULL DEFAULT 0,
  legacy_name_added   boolean NOT NULL DEFAULT false,
  decided_by_staff_id integer,
  decided_by_label    text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_lead_owner_mappings_staff_id_crm_staff_id_fk'
                    AND conrelid = 'public.crm_lead_owner_mappings'::regclass) THEN
    ALTER TABLE crm_lead_owner_mappings
      ADD CONSTRAINT crm_lead_owner_mappings_staff_id_crm_staff_id_fk
      FOREIGN KEY (staff_id) REFERENCES crm_staff(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'crm_lead_owner_mappings_decided_by_staff_id_crm_staff_id_fk'
                    AND conrelid = 'public.crm_lead_owner_mappings'::regclass) THEN
    ALTER TABLE crm_lead_owner_mappings
      ADD CONSTRAINT crm_lead_owner_mappings_decided_by_staff_id_crm_staff_id_fk
      FOREIGN KEY (decided_by_staff_id) REFERENCES crm_staff(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'ck_crm_lead_owner_mappings_rule'
                    AND conrelid = 'public.crm_lead_owner_mappings'::regclass) THEN
    ALTER TABLE crm_lead_owner_mappings
      ADD CONSTRAINT ck_crm_lead_owner_mappings_rule
      CHECK (rule IN ('display_name', 'legacy_name', 'email', 'manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ix_crm_lead_owner_mappings_value_key
  ON crm_lead_owner_mappings (value_key);
CREATE INDEX IF NOT EXISTS ix_crm_lead_owner_mappings_created_at
  ON crm_lead_owner_mappings (created_at);

COMMENT ON TABLE crm_lead_owner_mappings IS
  'One row per decision that pointed contacts carrying a free-text owner name at a staff member: rule (display_name/legacy_name/email) or manual, who decided, when, and how many contacts moved. A record for people to read; nothing decides from it.';

-- ── The backfill ───────────────────────────────────────────────────────────
--
-- The three rules above, run once, in SQL, with every decision recorded.
--
--   targets    every distinct unresolved value, as its key.
--   candidates every (value, staff, rule) match. UNION — not UNION ALL — so
--              one staff row matching the same value twice at the same rank
--              counts once and does not fake an ambiguity.
--   best       the winning rank per value: the FIRST rule that matched. This
--              is what makes the rules ordered rather than pooled.
--   resolved   values whose winning rank names exactly ONE person. Everything
--              else is deliberately absent, and therefore left NULL.
--   updated    the contacts pointed at that person — only rows still NULL.
--   INSERT     one crm_lead_owner_mappings row per decision, naming the rule.

WITH targets AS (
  SELECT DISTINCT
         translate(btrim(assigned_to, ' ' || chr(9) || chr(10) || chr(13)),
                   'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') AS key
    FROM crm_leads
   WHERE assigned_to_staff_id IS NULL
     AND btrim(assigned_to, ' ' || chr(9) || chr(10) || chr(13)) <> ''
),
candidates AS (
  SELECT t.key, s.id AS staff_id, 1 AS rule_rank
    FROM targets t
    JOIN crm_staff s
      ON translate(btrim(s.display_name, ' ' || chr(9) || chr(10) || chr(13)),
                   'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = t.key
  UNION
  SELECT t.key, s.id, 2
    FROM targets t
    JOIN crm_staff s
      ON EXISTS (
           SELECT 1
             FROM unnest(s.legacy_names) AS ln(name)
            WHERE translate(btrim(ln.name, ' ' || chr(9) || chr(10) || chr(13)),
                            'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = t.key)
  UNION
  SELECT t.key, s.id, 3
    FROM targets t
    JOIN crm_staff s
      ON translate(btrim(s.email, ' ' || chr(9) || chr(10) || chr(13)),
                   'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = t.key
),
best AS (
  SELECT key, min(rule_rank) AS rule_rank
    FROM candidates
   GROUP BY key
),
resolved AS (
  SELECT c.key, b.rule_rank, min(c.staff_id) AS staff_id
    FROM candidates c
    JOIN best b ON b.key = c.key AND b.rule_rank = c.rule_rank
   GROUP BY c.key, b.rule_rank
  HAVING count(DISTINCT c.staff_id) = 1
),
updated AS (
  UPDATE crm_leads l
     SET assigned_to_staff_id = r.staff_id
    FROM resolved r
   WHERE translate(btrim(l.assigned_to, ' ' || chr(9) || chr(10) || chr(13)),
                   'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = r.key
     AND l.assigned_to_staff_id IS NULL
  RETURNING r.key, r.rule_rank, r.staff_id,
            btrim(l.assigned_to, ' ' || chr(9) || chr(10) || chr(13)) AS label
)
INSERT INTO crm_lead_owner_mappings
       (value_key, value_label, staff_id, rule, leads_updated,
        legacy_name_added, decided_by_staff_id, decided_by_label)
SELECT key,
       min(label),
       staff_id,
       CASE rule_rank WHEN 1 THEN 'display_name' WHEN 2 THEN 'legacy_name' ELSE 'email' END,
       count(*)::int,
       false,
       NULL,
       'Automatic backfill (the M6 matching rules)'
  FROM updated
 GROUP BY key, rule_rank, staff_id;

COMMIT;

-- ── After applying ─────────────────────────────────────────────────────────
--
-- 1. The split, so the numbers are recorded rather than assumed:
--
--    SELECT count(*) FILTER (WHERE assigned_to_staff_id IS NOT NULL) AS resolved,
--           count(*) FILTER (WHERE assigned_to_staff_id IS NULL
--                              AND coalesce(btrim(assigned_to, ' ' || chr(9) || chr(10) || chr(13)), '') <> '') AS unresolved,
--           count(*) FILTER (WHERE assigned_to_staff_id IS NULL
--                              AND coalesce(btrim(assigned_to, ' ' || chr(9) || chr(10) || chr(13)), '') = '') AS never_assigned
--      FROM crm_leads;
--
-- 2. What the backfill decided, rule by rule — the same list the review panel
--    shows under "Decisions so far":
--
--    SELECT m.value_label, s.display_name, s.status, m.rule, m.leads_updated, m.created_at
--      FROM crm_lead_owner_mappings m JOIN crm_staff s ON s.id = m.staff_id
--     ORDER BY m.created_at DESC, m.id DESC;
--
-- 3. EVERY value still unresolved, with how many contacts carry it and why. This
--    is the list the owner works through at /admin/crm/admin → "Unmapped lead
--    owners", which states the same reasons in words:
--
--    WITH k AS (
--      SELECT l.*, translate(btrim(assigned_to, ' ' || chr(9) || chr(10) || chr(13)),
--                            'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') AS key
--        FROM crm_leads l
--    ),
--    targets AS (
--      SELECT key, min(btrim(assigned_to, ' ' || chr(9) || chr(10) || chr(13))) AS label, count(*) AS leads
--        FROM k WHERE assigned_to_staff_id IS NULL AND key <> ''
--       GROUP BY key
--    ),
--    candidates AS (
--      SELECT t.key, s.display_name, 1 AS rule_rank FROM targets t JOIN crm_staff s
--        ON translate(btrim(s.display_name, ' ' || chr(9) || chr(10) || chr(13)),
--                     'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = t.key
--      UNION
--      SELECT t.key, s.display_name, 2 FROM targets t JOIN crm_staff s
--        ON EXISTS (SELECT 1 FROM unnest(s.legacy_names) ln(name)
--                    WHERE translate(btrim(ln.name, ' ' || chr(9) || chr(10) || chr(13)),
--                                    'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = t.key)
--      UNION
--      SELECT t.key, s.display_name, 3 FROM targets t JOIN crm_staff s
--        ON translate(btrim(s.email, ' ' || chr(9) || chr(10) || chr(13)),
--                     'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = t.key
--    ),
--    best AS (SELECT key, min(rule_rank) AS rule_rank FROM candidates GROUP BY key)
--    SELECT t.label, t.leads,
--           CASE WHEN b.rule_rank IS NULL THEN 'no staff member matches this name'
--                ELSE 'ambiguous: ' || string_agg(DISTINCT c.display_name, ', ') END AS why
--      FROM targets t
--      LEFT JOIN best b ON b.key = t.key
--      LEFT JOIN candidates c ON c.key = t.key AND c.rule_rank = b.rule_rank
--     GROUP BY t.label, t.leads, b.rule_rank
--     ORDER BY t.leads DESC, t.label;
--
--    Immediately after this file, an "ambiguous" row naming ONE person cannot
--    occur — that value would have been mapped. Later it can (a rename, or a
--    legacy name recorded since); the panel shows it as "not applied yet".
--
-- 4. Every id this backfill set has its decision recorded. Expected: no rows.
--
--    SELECT l.id, l.assigned_to
--      FROM crm_leads l
--     WHERE l.assigned_to_staff_id IS NOT NULL
--       AND NOT EXISTS (
--             SELECT 1 FROM crm_lead_owner_mappings m
--              WHERE m.staff_id = l.assigned_to_staff_id
--                AND m.value_key = translate(btrim(l.assigned_to, ' ' || chr(9) || chr(10) || chr(13)),
--                                            'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'));
--
--    (Once the application is running, contacts assigned through the picker
--    appear here too — that is an assignment, not a mapping of an old name.)
