/**
 * The receptionist dashboard: summary cards that open their records, a
 * fourteen-day call trend, a merged activity feed, integration status and a
 * shortcut to the browser test.
 *
 * Every number comes from `GET /api/receptionist/dashboard`, which builds it
 * from the business's own records. A source the server couldn't read shows
 * "Not available" — never a zero.
 */

import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, Mail, Mic, Phone } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { relativeTime } from "@/lib/conversationUi";
import { InlineError } from "@/components/common/InlineError";
import type { Readiness } from "@/lib/readinessApi";

export interface DashboardSummary {
  generatedAt: string;
  timezone: string;
  cards: Array<{ key: string; label: string; value: number | null; detail: string; href: string }>;
  trend: Array<{ date: string; telephone: number; browser: number }> | null;
  activity: Array<{ kind: "call" | "message" | "booking" | "contact"; id: string; title: string; detail: string; at: string; href: string; urgent: boolean }>;
  unavailable: string[];
}

export const DASHBOARD_ENDPOINT = "/receptionist/dashboard";

export function useDashboardSummary() {
  const firmId = useAuthenticatedFirmId();
  return useQuery<DashboardSummary>({
    queryKey: firmId !== undefined ? ["dashboard", firmId] : ["dashboard", "unresolved"],
    queryFn: () => apiFetch<DashboardSummary>(DASHBOARD_ENDPOINT),
    enabled: firmId !== undefined,
    staleTime: 30_000,
  });
}

const ISO_IN_TEXT = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

/** The server sends instants; people read local dates. */
function readable(text: string, timezone: string): string {
  return text.replace(ISO_IN_TEXT, (iso) => {
    try {
      return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone });
    } catch {
      return iso;
    }
  });
}

function TrendChart({ trend }: { trend: NonNullable<DashboardSummary["trend"]> }) {
  const [focus, setFocus] = useState<number | null>(null);
  const max = Math.max(1, ...trend.map((d) => d.telephone + d.browser));
  const width = 280;
  const height = 88;
  const gap = 4;
  const barW = (width - gap * (trend.length - 1)) / trend.length;
  const total = trend.reduce((n, d) => n + d.telephone + d.browser, 0);
  const shown = focus === null ? null : trend[focus]!;
  const label = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <figure className="dash-trend">
      <figcaption className="dash-trend__caption">
        {shown
          ? `${label(shown.date)}: ${shown.telephone} phone, ${shown.browser} test`
          : `${total} call${total === 1 ? "" : "s"} in the last 14 days`}
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height + 16}`} className="dash-trend__svg" role="group" aria-label={`Calls per day for the last 14 days, ${total} in total. Focus a day to read it.`}>
        <line x1="0" x2={width} y1={height} y2={height} className="dash-trend__axis" />
        {trend.map((d, i) => {
          const x = i * (barW + gap);
          const phoneH = (d.telephone / max) * (height - 4);
          const testH = (d.browser / max) * (height - 4);
          return (
            <g
              key={d.date}
              tabIndex={0}
              onMouseEnter={() => setFocus(i)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus(null)}
              aria-label={`${label(d.date)}: ${d.telephone} phone calls, ${d.browser} test calls`}
            >
              <rect x={x} y={0} width={barW} height={height} className="dash-trend__hit" />
              <rect x={x} y={height - phoneH} width={barW} height={phoneH} rx="2" className="dash-trend__phone" />
              <rect x={x} y={height - phoneH - testH} width={barW} height={testH} rx="2" className="dash-trend__test" />
            </g>
          );
        })}
        <text x="0" y={height + 13} className="dash-trend__tick">{label(trend[0]!.date)}</text>
        <text x={width} y={height + 13} textAnchor="end" className="dash-trend__tick">Today</text>
      </svg>
      <div className="dash-trend__legend">
        <span><i className="dash-swatch dash-swatch--phone" aria-hidden="true" /> Phone calls</span>
        <span><i className="dash-swatch dash-swatch--test" aria-hidden="true" /> Browser tests</span>
      </div>
    </figure>
  );
}

const KIND_FILTERS = [
  { key: "all", label: "All" },
  { key: "call", label: "Calls" },
  { key: "message", label: "Messages" },
  { key: "booking", label: "Bookings" },
  { key: "contact", label: "Contacts" },
] as const;

function ActivityFeed({ summary }: { summary: DashboardSummary }) {
  const [filter, setFilter] = useState<(typeof KIND_FILTERS)[number]["key"]>("all");
  const items = summary.activity.filter((a) => filter === "all" || a.kind === filter);
  return (
    <section className="sd-section" aria-labelledby="dash-activity-title">
      <div className="sd-section__head">
        <h2 className="sd-h2" id="dash-activity-title">Recent activity</h2>
        <div className="dash-filters" role="group" aria-label="Show">
          {KIND_FILTERS.map((f) => (
            <button key={f.key} type="button" className="dash-filter" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <div className="sd-empty">
          <p className="sd-empty__title">Nothing here yet</p>
          <p className="sd-empty__detail">Calls, messages, bookings and new contacts from the last 30 days appear here.</p>
        </div>
      ) : (
        <ul className="sd-list">
          {items.map((a) => (
            <li className="sd-list__item" key={`${a.kind}-${a.id}`}>
              <Link href={a.href} className="sd-row">
                <span className="sd-row__who">
                  {a.title}
                  {a.urgent && <span className="sd-chip dash-urgent">Urgent</span>}
                </span>
                <span className="dash-row__detail">{readable(a.detail, summary.timezone)}</span>
                <span className="sd-row__when">{relativeTime(a.at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IntegrationStatus({ readiness }: { readiness: Readiness | undefined }) {
  const checks = readiness?.steps.flatMap((s) => s.checks) ?? [];
  const find = (key: string) => checks.find((c) => c.key === key);
  const rows = [
    { key: "phone", icon: Phone, label: "Phone number", check: find("phone") },
    { key: "booking", icon: CalendarDays, label: "Calendar and booking", check: find("booking") },
    { key: "email", icon: Mail, label: "Email summaries", check: find("email") },
    { key: "published", icon: Mic, label: "Voice receptionist", check: find("published") },
  ];
  return (
    <section className="sd-section" aria-labelledby="dash-integrations-title">
      <h2 className="sd-h2" id="dash-integrations-title">Connections</h2>
      <ul className="dash-integrations">
        {rows.map(({ key, icon: Icon, label, check }) => (
          <li key={key} className="dash-integration" data-state={check?.state ?? "not_checked"}>
            <Icon className="dash-integration__icon" aria-hidden="true" />
            <div>
              <span className="dash-integration__label">{label}</span>
              <span className="dash-integration__detail">{check ? check.detail : "Not available"}</span>
            </div>
            {check?.fixPath && check.state !== "done" && (
              <Link href={check.fixPath} className="sd-link">
                Open <span className="sd-sr">{label}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DashboardPanel({ readiness }: { readiness: Readiness | undefined }) {
  const summary = useDashboardSummary();

  if (summary.isLoading) {
    return <div className="sd-skel sd-skel--figures" aria-hidden="true" />;
  }
  if (summary.isError || !summary.data) {
    return (
      <InlineError
        title="Your activity couldn't be loaded"
        description="This doesn't mean nothing happened. SiteMint couldn't read your records just now. Nothing has been lost."
        onRetry={() => summary.refetch()}
      />
    );
  }
  const s = summary.data;
  const readyToTest = readiness?.steps.flatMap((x) => x.checks).find((c) => c.key === "browser_test");

  return (
    <>
      <section className="sd-section" aria-labelledby="dash-cards-title">
        <h2 className="sd-h2" id="dash-cards-title">At a glance</h2>
        {s.unavailable.length > 0 && (
          <p className="dash-note" role="status">
            Some figures are not available right now ({s.unavailable.join(", ")}). They are shown as “Not available”, not as zero.
          </p>
        )}
        <div className="dash-cards">
          {s.cards.map((c) => (
            <Link key={c.key} href={c.href} className="dash-card" data-empty={c.value === null ? "true" : "false"}>
              <span className="dash-card__value">{c.value === null ? "Not available" : c.value}</span>
              <span className="dash-card__label">{c.label}</span>
              <span className="dash-card__detail">{readable(c.detail, s.timezone)}</span>
              <ArrowRight className="dash-card__go" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <div className="dash-split">
        <section className="sd-section" aria-labelledby="dash-trend-title">
          <h2 className="sd-h2" id="dash-trend-title">Calls</h2>
          {s.trend ? <TrendChart trend={s.trend} /> : <p className="dash-note">Call history is not available right now.</p>}
          <div className="dash-test">
            <Mic className="dash-test__icon" aria-hidden="true" />
            <div>
              <span className="dash-test__title">Talk to your receptionist</span>
              <span className="dash-test__detail">
                {readyToTest?.state === "done" ? "Try it again after any change." : "Test it in your browser before callers reach it."}
              </span>
            </div>
            <Link href="/assistants" className="sd-link">
              Start a test <span className="sd-sr">call in the browser</span>
            </Link>
          </div>
        </section>
        <IntegrationStatus readiness={readiness} />
      </div>

      <ActivityFeed summary={s} />
    </>
  );
}
