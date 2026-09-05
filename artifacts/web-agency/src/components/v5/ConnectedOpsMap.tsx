/**
 * V5 — the Connected Operations Map (CRM & Internal Systems containers,
 * owner directive 2026-09-06).
 *
 * The real Operations CRM is never shown publicly — this is a synthetic,
 * fully interactive workflow map that demonstrates the same capabilities the
 * live system has (records, tasks, stages, notes, automation, webhooks,
 * permissions, reporting, audit history) without a single real screenshot.
 * Every name, record, and figure below is invented for illustration.
 *
 * Shared between `HomeV5`'s CRM & Internal Systems section and
 * `AiSystemsV5`'s CRM & internal systems section (W-6) — one component, one
 * source of truth for the seven workflow steps, so the two pages never drift
 * out of sync with each other's story.
 *
 * Interaction contract:
 *  - Seven nodes on a connected mint signal line. Desktop: a horizontal
 *    rail, the line stroke-draws once on scroll-reveal (static immediately
 *    under `prefers-reduced-motion: reduce`). Mobile (≤767px): the rail
 *    becomes a vertical list and the detail panel renders directly beneath
 *    the active node instead of the desktop's single panel below the rail.
 *  - Keyboard operable: every node is a real `<button>` (Tab + Enter/Space
 *    activate it natively); the active node carries `aria-current="step"`.
 *    Focus rings come from the existing global `[data-tone] button:focus-visible`
 *    rule (tokens-v3.css) — nothing here suppresses it.
 *  - The detail panel is data-driven from `OPS_MAP_NODES`, one entry per
 *    node, each naming what information enters, what SiteMint organizes,
 *    what automation may run, what the team sees, and the useful next
 *    action — plus a small synthetic record/task card.
 */

import { useId, useState } from "react";
import { useReveal } from "@/components/v3/useReveal";

export type OpsCardTone = "mint" | "amber" | "done" | "muted";

export interface OpsCardRow {
  label: string;
  value: string;
  tone?: OpsCardTone;
}

export interface OpsMapNode {
  id: string;
  /** Two-digit step number shown on the node and in the panel eyebrow. */
  no: string;
  /** Short label on the rail itself — kept to one or two words so the
   *  vertical mobile list never wraps or overflows at 360px. */
  railLabel: string;
  /** Full step name, shown as the panel heading (the owner's seven-step
   *  workflow language, verbatim). */
  title: string;
  enters: string;
  organizes: string;
  automation: string;
  teamSees: string;
  nextAction: string;
  cardBadge: string;
  cardRows: OpsCardRow[];
}

export const OPS_MAP_NODES: OpsMapNode[] = [
  {
    id: "discovery",
    no: "01",
    railLabel: "Discovery",
    title: "Discovery submitted",
    enters:
      "A structured intake brief — business details, goals, current tools, and budget range — submitted through the discovery flow, never a bare contact form.",
    organizes:
      "SiteMint creates a new project record and a contact record the moment the brief lands, tagged with its source and every intake answer attached as notes.",
    automation:
      "A webhook pushes the submission into the pipeline and fires an acknowledgment email within a minute. No automation touches pricing or scope.",
    teamSees:
      "A new card in the Discovery column with the full brief attached, visible to the assigned reviewer — nothing is client-facing yet.",
    nextAction:
      "A reviewer reads the brief and replies with a straight answer or books the discovery call.",
    cardBadge: "New project record",
    cardRows: [
      { label: "Contact", value: "Jordan — Bloom Dental" },
      { label: "Source", value: "Discovery brief · web" },
      { label: "Stage", value: "Discovery submitted", tone: "mint" },
    ],
  },
  {
    id: "lead",
    no: "02",
    railLabel: "Lead",
    title: "Lead organized",
    enters:
      "The reviewed brief plus any call notes — checked against existing contacts and jobs first, so the same business never gets entered twice.",
    organizes:
      "SiteMint files the lead into the right pipeline, then assigns an owner, a stage, and a next-touch date on the record.",
    automation:
      "Duplicate-contact matching runs automatically, and a follow-up task self-creates for the owner if no touch happens within two business days.",
    teamSees:
      "The pipeline board — every lead's stage, owner, and age at a glance. It's permissioned: each rep sees their own queue, leads see the whole board.",
    nextAction:
      "The owner reaches out to confirm scope and schedule the walkthrough.",
    cardBadge: "Pipeline record",
    cardRows: [
      { label: "Owner", value: "Priya N." },
      { label: "Pipeline", value: "Custom Connected System" },
      { label: "Stage", value: "Lead organized", tone: "mint" },
    ],
  },
  {
    id: "scope",
    no: "03",
    railLabel: "Scope",
    title: "Scope reviewed",
    enters:
      "Call notes, follow-up emails, and any documents the client shares — logged against the project as one running communication thread.",
    organizes:
      "SiteMint turns the conversation into a scoped feature list and an open-questions checklist attached to the project record.",
    automation:
      "A second-reviewer task auto-assigns as a sanity check the moment the checklist is marked ready — nothing gets quoted solo.",
    teamSees:
      "The full communication history plus a task list — each task carrying its own owner and due date, visible to the whole project team.",
    nextAction:
      "Once the checklist clears, the project moves into proposal drafting.",
    cardBadge: "Task list",
    cardRows: [
      { label: "Confirm integrations", value: "Done", tone: "done" },
      { label: "Verify timeline", value: "Due today", tone: "amber" },
      { label: "Second review", value: "Unassigned", tone: "muted" },
    ],
  },
  {
    id: "proposal",
    no: "04",
    railLabel: "Proposal",
    title: "Proposal prepared",
    enters:
      "The scoped feature list and a matching pricing tier — nothing is drafted until scope is actually confirmed.",
    organizes:
      "SiteMint generates a proposal record versioned against the project, linked back to every note and decision that shaped it.",
    automation:
      "A drafting assistant prepares the first pass from the scoped checklist; a person edits and approves every word before it ever sends.",
    teamSees:
      "The proposal record and its version history — draft v1 superseded, draft v2 current — plus who approved the send.",
    nextAction:
      "The approved proposal goes out with open and reply tracking attached.",
    cardBadge: "Proposal record",
    cardRows: [
      { label: "Document", value: "Growth System — draft v2" },
      { label: "Status", value: "Awaiting approval", tone: "amber" },
      { label: "Linked project", value: "Bloom Dental" },
    ],
  },
  {
    id: "tasks",
    no: "05",
    railLabel: "Tasks",
    title: "Tasks assigned",
    enters:
      "The signed proposal's line items — each one broken into a discrete task with the role that owns it.",
    organizes:
      "SiteMint splits the project into a task board by discipline — design, build, integrations, QA — with a stage and an owner tracked on every task.",
    automation:
      "Tasks route to the right role automatically by tag, and a webhook notifies the owner the instant a task lands in their queue.",
    teamSees:
      "A permissioned task board: each teammate sees their own assignments, leads see the whole board — nothing client-facing leaves the team.",
    nextAction:
      "Work starts against a checklist the client never has to chase.",
    cardBadge: "Task board",
    cardRows: [
      { label: "Design — homepage v2", value: "Alex", tone: "mint" },
      { label: "Build — CRM integration", value: "Priya", tone: "amber" },
      { label: "QA — cross-browser", value: "Unassigned", tone: "muted" },
    ],
  },
  {
    id: "build",
    no: "06",
    railLabel: "Build",
    title: "Project built",
    enters:
      "Completed tasks and review notes — each one timestamped against the project the moment work actually lands.",
    organizes:
      "SiteMint keeps a running build log on the project record: what shipped, when, and who reviewed it.",
    automation:
      "A deploy webhook posts every release straight to the project's activity feed — no manual status update required.",
    teamSees:
      "A full audit history of the build, in order — reconstructable after the fact if a client ever asks what happened and when.",
    nextAction: "The finished system moves onto a scheduled launch.",
    cardBadge: "Build log",
    cardRows: [
      { label: "Homepage shipped", value: "Reviewed", tone: "done" },
      { label: "CRM sync verified", value: "Reviewed", tone: "done" },
      { label: "Launch checklist", value: "In progress", tone: "amber" },
    ],
  },
  {
    id: "launch",
    no: "07",
    railLabel: "Launch",
    title: "Launch & ongoing optimization",
    enters:
      "Live usage — form submissions, call volume, support notes — the same events the finished system now generates on its own.",
    organizes:
      "SiteMint keeps the project record open past delivery, rolling ongoing activity into a reporting view instead of closing the file at launch.",
    automation:
      "Monitoring automation watches for a failed webhook or a stalled task and opens an internal alert before the client ever notices.",
    teamSees:
      "A reporting dashboard plus the complete audit history back to the first discovery brief — permissioned so the client sees their own results, the team sees everything.",
    nextAction:
      "SiteMint proposes the next tuning pass based on what the data actually shows.",
    cardBadge: "Reporting",
    cardRows: [
      { label: "Leads this month", value: "18", tone: "mint" },
      { label: "Automations run", value: "342" },
      { label: "Open alerts", value: "0", tone: "done" },
    ],
  },
];

const PANEL_FACTS: Array<{ key: keyof OpsMapNode; label: string }> = [
  { key: "enters", label: "What comes in" },
  { key: "organizes", label: "What SiteMint organizes" },
  { key: "automation", label: "What automation may run" },
  { key: "teamSees", label: "What the team sees" },
  { key: "nextAction", label: "Useful next action" },
];

function OpsRecordCard({ node }: { node: OpsMapNode }) {
  return (
    <div className="opsmap-card">
      <div className="opsmap-card__head">
        <span className="opsmap-card__badge">{node.cardBadge}</span>
        <span className="opsmap-card__note">Illustrative example — not a real client record</span>
      </div>
      <div className="opsmap-card__rows">
        {node.cardRows.map((row) => (
          <div className="opsmap-card__row" key={row.label}>
            <span className={`opsmap-card__dot opsmap-card__dot--${row.tone ?? "mint"}`} aria-hidden="true" />
            <span className="opsmap-card__k">{row.label}</span>
            <span className="opsmap-card__v">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpsPanel({ node, panelId, headingId }: { node: OpsMapNode; panelId: string; headingId: string }) {
  return (
    <div className="opsmap-panel" id={panelId} role="group" aria-labelledby={headingId} aria-live="polite">
      <span className="opsmap-panel__eyebrow">{node.no} &middot; Workflow step</span>
      <h3 className="opsmap-panel__title" id={headingId}>{node.title}</h3>
      <dl className="opsmap-panel__facts">
        {PANEL_FACTS.map((fact) => (
          <div className="opsmap-panel__fact" key={fact.key}>
            <dt>{fact.label}</dt>
            <dd>{node[fact.key] as string}</dd>
          </div>
        ))}
      </dl>
      <OpsRecordCard node={node} />
    </div>
  );
}

export interface ConnectedOpsMapProps {
  className?: string;
  /** Overrides the default active node (defaults to the first step). */
  defaultActiveId?: string;
}

export function ConnectedOpsMap({ className, defaultActiveId }: ConnectedOpsMapProps) {
  const reveal = useReveal();
  const instanceId = useId();
  const [activeId, setActiveId] = useState(defaultActiveId ?? OPS_MAP_NODES[0].id);
  const activeNode = OPS_MAP_NODES.find((n) => n.id === activeId) ?? OPS_MAP_NODES[0];
  const desktopPanelId = `opsmap-${instanceId}-panel-desktop`;
  const desktopHeadingId = `opsmap-${instanceId}-heading-desktop`;

  return (
    <div className={["opsmap", className].filter(Boolean).join(" ")}>
      <div className="opsmap__rail-wrap" ref={reveal}>
        <svg
          className="opsmap__thread"
          viewBox="0 0 100 20"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            className="opsmap__thread-path"
            d="M4,10 L96,10"
            fill="none"
            stroke="var(--sm-mint-500, #32C5D2)"
            strokeWidth="1.4"
            pathLength={1}
          />
        </svg>
        <ol className="opsmap__rail" role="list">
          {OPS_MAP_NODES.map((node) => {
            const isActive = node.id === activeId;
            const mobilePanelId = `opsmap-${instanceId}-panel-${node.id}`;
            const mobileHeadingId = `opsmap-${instanceId}-heading-${node.id}`;
            return (
              <li className="opsmap__item" key={node.id}>
                <button
                  type="button"
                  className="opsmap__node"
                  aria-current={isActive ? "step" : undefined}
                  aria-controls={isActive ? `${mobilePanelId} ${desktopPanelId}` : undefined}
                  onClick={() => setActiveId(node.id)}
                >
                  <span className="opsmap__node-no">{node.no}</span>
                  <span className="opsmap__node-label">{node.railLabel}</span>
                </button>
                {isActive && (
                  <div className="opsmap__panel-slot opsmap__panel-slot--mobile">
                    <OpsPanel node={node} panelId={mobilePanelId} headingId={mobileHeadingId} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="opsmap__panel-slot opsmap__panel-slot--desktop">
        <OpsPanel node={activeNode} panelId={desktopPanelId} headingId={desktopHeadingId} />
      </div>
    </div>
  );
}

export default ConnectedOpsMap;
