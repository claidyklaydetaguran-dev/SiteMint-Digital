/**
 * Illustrative owner dashboard (owner final polish directive, 2026-09-06).
 *
 * Replaces the empty SVG placeholder in the "One place to see what the
 * receptionist is doing" section with a live, populated, clearly-labelled
 * demonstration of the customer-facing dashboard: KPI tiles, recent call
 * activity with outcome tags, upcoming appointments, a follow-up queue,
 * business-hours + knowledge status, and a small weekly activity chart,
 * with Today / 7 Days switching and All / Booked / Needs attention
 * filtering.
 *
 * EVERY value on this surface is synthetic (the same fictional "Bloom
 * Dental" business as the simulated call theater) and the surface is
 * labelled "Illustrative dashboard — example data". It is a controlled
 * public product demonstration — never a screenshot of the private
 * Operations CRM and never presented as live customer data.
 */

import { useState } from "react";

type Range = "today" | "week";
type Filter = "all" | "booked" | "attention";

const KPIS: Record<Range, Array<{ label: string; value: string; hint: string }>> = {
  today: [
    { label: "Calls today", value: "12", hint: "3 after hours" },
    { label: "Appointments booked", value: "5", hint: "2 new patients" },
    { label: "Needs attention", value: "2", hint: "follow-ups open" },
    { label: "After-hours answered", value: "3", hint: "0 missed" },
  ],
  week: [
    { label: "Calls · 7 days", value: "71", hint: "18 after hours" },
    { label: "Appointments booked", value: "32", hint: "11 new patients" },
    { label: "Needs attention", value: "6", hint: "2 resolved today" },
    { label: "After-hours answered", value: "18", hint: "1 missed" },
  ],
};

interface CallRow {
  time: string;
  caller: string;
  intent: string;
  tag: "booked" | "attention" | "answered" | "after-hours";
}

const CALLS: Record<Range, CallRow[]> = {
  today: [
    { time: "4:12 PM", caller: "(555) 019-2874", intent: "Cleaning — booked Tue 2:30 PM", tag: "booked" },
    { time: "2:47 PM", caller: "(555) 830-1146", intent: "Insurance question — team follow-up", tag: "attention" },
    { time: "1:05 PM", caller: "(555) 407-9921", intent: "Directions + parking info", tag: "answered" },
    { time: "11:38 AM", caller: "(555) 264-7710", intent: "Reschedule — moved to Thu 9:00 AM", tag: "booked" },
    { time: "8:56 AM", caller: "(555) 512-0083", intent: "Hours confirmation", tag: "answered" },
    { time: "6:21 AM", caller: "(555) 733-4407", intent: "Voicemail-free intake — details captured", tag: "after-hours" },
  ],
  week: [
    { time: "Mon", caller: "(555) 118-6620", intent: "Whitening consult — booked Fri 3:00 PM", tag: "booked" },
    { time: "Mon", caller: "(555) 902-3345", intent: "Billing question — team follow-up", tag: "attention" },
    { time: "Tue", caller: "(555) 445-8802", intent: "New patient — booked Wed 10:30 AM", tag: "booked" },
    { time: "Wed", caller: "(555) 671-2098", intent: "Hours + insurance list", tag: "answered" },
    { time: "Thu", caller: "(555) 284-5531", intent: "Cancellation — slot reopened", tag: "answered" },
    { time: "Sat", caller: "(555) 907-1184", intent: "Weekend inquiry — captured for Monday", tag: "after-hours" },
  ],
};

const TAG_LABEL: Record<CallRow["tag"], string> = {
  booked: "Booked",
  attention: "Needs attention",
  answered: "Answered",
  "after-hours": "After-hours",
};

const APPOINTMENTS = [
  { when: "Tue 2:30 PM", what: "Cleaning — new patient" },
  { when: "Wed 10:30 AM", what: "New-patient exam" },
  { when: "Thu 9:00 AM", what: "Cleaning — rescheduled" },
];

const FOLLOW_UPS = [
  { what: "Confirm insurance coverage with (555) 830-1146", due: "before Tue" },
  { what: "Send new-patient intake form", due: "today" },
];

/** Weekly activity, Mon–Sun — heights are illustrative only. */
const WEEK_BARS = [9, 12, 8, 14, 11, 10, 7];
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

export function DashboardPreview() {
  const [range, setRange] = useState<Range>("today");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = CALLS[range].filter((r) =>
    filter === "all" ? true : filter === "booked" ? r.tag === "booked" : r.tag === "attention",
  );
  const max = Math.max(...WEEK_BARS);

  return (
    <div className="smv5-dash" aria-label="Illustrative dashboard — example data">
      <header className="smv5-dash__bar">
        <div className="smv5-dash__biz">
          <span className="smv5-dash__dot" aria-hidden="true" />
          <b>Bloom Dental</b>
          <span className="smv5-dash__status">Receptionist on · within business hours</span>
        </div>
        <div className="smv5-dash__range" role="group" aria-label="Time range">
          <button
            type="button"
            aria-pressed={range === "today"}
            onClick={() => setRange("today")}
          >
            Today
          </button>
          <button
            type="button"
            aria-pressed={range === "week"}
            onClick={() => setRange("week")}
          >
            7 Days
          </button>
        </div>
      </header>

      <div className="smv5-dash__kpis">
        {KPIS[range].map((kpi) => (
          <div className="smv5-dash__kpi" key={kpi.label}>
            <span className="smv5-dash__kpi-value">{kpi.value}</span>
            <span className="smv5-dash__kpi-label">{kpi.label}</span>
            <span className="smv5-dash__kpi-hint">{kpi.hint}</span>
          </div>
        ))}
      </div>

      <div className="smv5-dash__grid">
        <section className="smv5-dash__panel smv5-dash__panel--activity" aria-label="Recent call activity">
          <div className="smv5-dash__panel-head">
            <h3>Recent call activity</h3>
            <div className="smv5-dash__filters" role="group" aria-label="Filter calls">
              {(
                [
                  ["all", "All"],
                  ["booked", "Booked"],
                  ["attention", "Needs attention"],
                ] as Array<[Filter, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ul className="smv5-dash__calls">
            {rows.map((row) => (
              <li key={row.time + row.caller}>
                <span className="smv5-dash__call-time">{row.time}</span>
                <span className="smv5-dash__call-body">
                  <b>{row.caller}</b>
                  <span>{row.intent}</span>
                </span>
                <span className="smv5-dash__tag" data-tag={row.tag}>
                  {TAG_LABEL[row.tag]}
                </span>
              </li>
            ))}
            {rows.length === 0 && (
              <li className="smv5-dash__empty">No calls match this filter.</li>
            )}
          </ul>
        </section>

        <div className="smv5-dash__side">
          <section className="smv5-dash__panel" aria-label="Weekly call activity chart">
            <div className="smv5-dash__panel-head">
              <h3>This week</h3>
            </div>
            <svg viewBox="0 0 154 58" className="smv5-dash__chart" aria-hidden="true">
              {WEEK_BARS.map((v, i) => {
                const h = Math.round((v / max) * 42);
                const active = range === "week" || i === 3;
                return (
                  <g key={i} transform={`translate(${i * 22 + 2}, 0)`}>
                    <rect
                      x="0"
                      y={46 - h}
                      width="14"
                      height={h}
                      rx="3"
                      fill={active ? "var(--smv5-mint-500)" : "var(--sm-mint-wash-deep, #DFF4EF)"}
                    />
                    <text x="7" y="56" textAnchor="middle" fontSize="7" fill="var(--smv5-slate-600)">
                      {DAY_LABELS[i]}
                    </text>
                  </g>
                );
              })}
            </svg>
          </section>

          <section className="smv5-dash__panel" aria-label="Upcoming appointments">
            <div className="smv5-dash__panel-head">
              <h3>Upcoming appointments</h3>
            </div>
            <ul className="smv5-dash__mini">
              {APPOINTMENTS.map((a) => (
                <li key={a.when}>
                  <b>{a.when}</b>
                  <span>{a.what}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="smv5-dash__panel" aria-label="Follow-up queue">
            <div className="smv5-dash__panel-head">
              <h3>Follow-up queue</h3>
            </div>
            <ul className="smv5-dash__mini">
              {FOLLOW_UPS.map((f) => (
                <li key={f.what}>
                  <b>{f.due}</b>
                  <span>{f.what}</span>
                </li>
              ))}
            </ul>
          </section>

          <p className="smv5-dash__knowledge">
            Business profile complete · 14 booking rules active · calendar connected
          </p>
        </div>
      </div>

      <p className="smv5-dash__label">Illustrative dashboard — example data</p>
    </div>
  );
}

export default DashboardPreview;
