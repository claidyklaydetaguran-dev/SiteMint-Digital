-- Push packet 0003: 21 plain btree indexes on hot filter columns of the
-- push-managed crm_* tables, as reviewed additive SQL.
--
-- Source: the 2026-09-24 performance audit, which found these columns filtered
-- or sorted on by the CRM's list, timeline, queue and lookup queries with no
-- index behind them. Each index below mirrors an `index("...")` declaration
-- added to the matching schema file under lib/db/src/schema (crmActivities,
-- crmLeads, crmTasks, crmDeals, crmProjects, crmMessages, crmCampaigns,
-- crmBehavioralEvents) — same name, same table, same column — so a later
-- `drizzle-kit push` sees no difference.
--
-- Audited columns that were NOT indexed because the table does not have them:
--   crm_campaign_recipients.scheduled_at      (no such column)
--   crm_campaign_events.{campaign_id,lead_id,status,scheduled_at}
--                                              (it carries campaign_recipient_id,
--                                               event_type, occurred_at instead)
--   crm_campaign_steps.{lead_id,status,scheduled_at}   (no such columns)
--
-- Contents (21 statements, all re-runnable): 21 CREATE INDEX IF NOT EXISTS.
-- Additive only: this packet creates no table, adds no column, adds no
-- constraint, and alters or drops nothing. Plain (non-unique) btree indexes
-- cannot fail on existing data, so it is safe on populated tables. Applied in
-- one transaction by lib/db/src/apply-push-packet.mjs, which verifies the
-- target's identity first; each CREATE INDEX takes a SHARE lock on its table
-- for the duration of the build (writes wait, reads continue).
--
-- Rollback (each is independent; dropping an index loses nothing but speed):
--   DROP INDEX IF EXISTS "ix_crm_activities_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_activities_created_at";
--   DROP INDEX IF EXISTS "ix_crm_leads_email";
--   DROP INDEX IF EXISTS "ix_crm_leads_status";
--   DROP INDEX IF EXISTS "ix_crm_leads_created_at";
--   DROP INDEX IF EXISTS "ix_crm_leads_updated_at";
--   DROP INDEX IF EXISTS "ix_crm_tasks_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_tasks_project_id";
--   DROP INDEX IF EXISTS "ix_crm_deals_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_projects_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_messages_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_campaign_recipients_campaign_id";
--   DROP INDEX IF EXISTS "ix_crm_campaign_recipients_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_campaign_recipients_status";
--   DROP INDEX IF EXISTS "ix_crm_campaign_scheduled_messages_campaign_id";
--   DROP INDEX IF EXISTS "ix_crm_campaign_scheduled_messages_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_campaign_scheduled_messages_status";
--   DROP INDEX IF EXISTS "ix_crm_campaign_scheduled_messages_scheduled_at";
--   DROP INDEX IF EXISTS "ix_crm_campaign_steps_campaign_id";
--   DROP INDEX IF EXISTS "ix_crm_behavioral_events_lead_id";
--   DROP INDEX IF EXISTS "ix_crm_behavioral_events_occurred_at";
-- The schema declarations must be removed in the same change, or the next push
-- re-creates them.

CREATE INDEX IF NOT EXISTS "ix_crm_activities_lead_id" ON "crm_activities" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_activities_created_at" ON "crm_activities" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "ix_crm_leads_email" ON "crm_leads" USING btree ("email");

CREATE INDEX IF NOT EXISTS "ix_crm_leads_status" ON "crm_leads" USING btree ("status");

CREATE INDEX IF NOT EXISTS "ix_crm_leads_created_at" ON "crm_leads" USING btree ("created_at");

CREATE INDEX IF NOT EXISTS "ix_crm_leads_updated_at" ON "crm_leads" USING btree ("updated_at");

CREATE INDEX IF NOT EXISTS "ix_crm_tasks_lead_id" ON "crm_tasks" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_tasks_project_id" ON "crm_tasks" USING btree ("project_id");

CREATE INDEX IF NOT EXISTS "ix_crm_deals_lead_id" ON "crm_deals" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_projects_lead_id" ON "crm_projects" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_messages_lead_id" ON "crm_messages" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_recipients_campaign_id" ON "crm_campaign_recipients" USING btree ("campaign_id");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_recipients_lead_id" ON "crm_campaign_recipients" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_recipients_status" ON "crm_campaign_recipients" USING btree ("status");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_scheduled_messages_campaign_id" ON "crm_campaign_scheduled_messages" USING btree ("campaign_id");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_scheduled_messages_lead_id" ON "crm_campaign_scheduled_messages" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_scheduled_messages_status" ON "crm_campaign_scheduled_messages" USING btree ("status");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_scheduled_messages_scheduled_at" ON "crm_campaign_scheduled_messages" USING btree ("scheduled_at");

CREATE INDEX IF NOT EXISTS "ix_crm_campaign_steps_campaign_id" ON "crm_campaign_steps" USING btree ("campaign_id");

CREATE INDEX IF NOT EXISTS "ix_crm_behavioral_events_lead_id" ON "crm_behavioral_events" USING btree ("lead_id");

CREATE INDEX IF NOT EXISTS "ix_crm_behavioral_events_occurred_at" ON "crm_behavioral_events" USING btree ("occurred_at");
