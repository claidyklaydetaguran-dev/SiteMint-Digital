import { pgTable, serial, timestamp, text } from "drizzle-orm/pg-core";

export const landingPageViews = pgTable("landing_page_views", {
  id:          serial("id").primaryKey(),
  createdAt:   timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  page:        text("page").notNull(),
  utmSource:   text("utm_source"),
  utmMedium:   text("utm_medium"),
  utmCampaign: text("utm_campaign"),
});

export type LandingPageView = typeof landingPageViews.$inferSelect;
