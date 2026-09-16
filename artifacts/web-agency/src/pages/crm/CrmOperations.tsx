import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, readAdminResource } from "@/lib/adminLoad";
import { Figure, LoadFailure } from "@/components/crm/LoadState";
import {
  PROJECT_STAGES, PROJECT_STAGE_STYLES, PROJECT_TYPES, type ProjectStage,
} from "@/lib/crmTaxonomy";
import {
  AlertCircle, Archive, ArchiveRestore, ArrowDown, ArrowUp, CalendarDays, Check,
  CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Copy, Cpu, FileText, Flag,
  HelpCircle, LayoutGrid, List, Mail, MessageSquare, Milestone as MilestoneIcon,
  Plus, RefreshCw, Send, ShieldCheck, User, X,
} from "lucide-react";

// ── M2: the delivery workspace ───────────────────────────────────────────────
//
// One screen for "what is being built, who owns it, and what is in the way".
// Board and List are two readings of the SAME server page (limit/offset), so
// the counts in the footer are always the counts on screen. Everything the
// drawer writes is followed by a re-read of the detail, so what a person sees
// after saving is what the database actually holds — not an optimistic guess.

// ── Types (mirror artifacts/api-server/src/routes/crmOperations.ts) ──────────

interface OpsProject {
  id: number;
  name: string;
  stage: string;
  projectType: string | null;
  ownerStaffId: number | null;
  collaboratorStaffIds: number[] | null;
  nextAction: string | null;
  nextActionDueAt: string | null;
  blockedReason: string | null;
  priority: string | null;
  startDate: string | null;
  targetLaunchDate: string | null;
  budget: string | null;
  notes: string | null;
  archivedAt: string | null;
  leadId: number | null;
  openTasks: number;
  totalTasks: number;
  doneMilestones: number;
  totalMilestones: number;
  progressPercent: number | null;
}

type MilestoneStatus = "pending" | "in_progress" | "done" | "blocked";

interface OpsMilestone {
  id: number;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: MilestoneStatus;
  orderIndex: number;
  dependsOnMilestoneId: number | null;
  blockedReason: string | null;
  completedAt: string | null;
}

interface OpsUpdate {
  id: number;
  body: string;
  stageAtUpdate: string | null;
  authorLabel: string;
  createdAt: string;
}

interface OpsComment {
  id: number;
  body: string;
  isInternal: boolean;
  authorLabel: string;
  createdAt: string;
}

type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";

interface OpsApproval {
  id: number;
  title: string;
  detail: string | null;
  status: ApprovalStatus;
  requestedByLabel: string;
  approverStaffId: number | null;
  decisionNote: string | null;
  createdAt: string;
}

interface OpsTask {
  id: number;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
  /**
   * "date" (a day) or "time" (a moment), from `crm_tasks.due_kind`. Anything
   * else — including a row written before the column existed — is a day, which
   * is what the server falls back to as well.
   */
  dueKind: string | null;
  priority: string | null;
  assignedToStaffId: number | null;
  type: string | null;
}

interface Assignee { id: number; displayName: string; email: string }
interface OpsLead { id: number; name: string; company?: string | null; email?: string | null }
interface OpsTemplate {
  id: number;
  name: string;
  description: string | null;
  projectType: string | null;
  tasks: unknown[];
  milestones: unknown[];
}

interface ProjectDetail {
  project: OpsProject;
  lead: OpsLead | null;
  tasks: OpsTask[];
  milestones: OpsMilestone[];
  updates: OpsUpdate[];
  comments: OpsComment[];
  approvals: OpsApproval[];
}

// ── Reminder delivery (mirrors routes/crmOperations.ts) ─────────────────────

type DeliveryState = "pending" | "attempting" | "accepted" | "refused" | "uncertain";
type RecoveryAction = "retry" | "resend" | "acknowledge";

interface DeliveryRow {
  deliveryId: number;
  jobId: number;
  kind: string;
  dedupeKey: string;
  staffId: number | null;
  recipientName: string | null;
  recipientEmail: string | null;
  /** The reminder's ORIGINAL run time. It never moves. */
  occurrence: string;
  state: DeliveryState;
  attempt: number;
  nextAttemptAt: string | null;
  providerRef: string | null;
  failureReason: string | null;
  failureDetail: string | null;
  origin: string;
  legacyRaw: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  idempotencyProtected: boolean;
  availableActions: RecoveryAction[];
  guidance: string;
  resendDuplicateRisk: string;
}

// ── Small shared vocabulary ─────────────────────────────────────────────────

const PRIORITIES = ["High", "Medium", "Low"] as const;

const PRIORITY_PILL: Record<string, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-teal-100 text-teal-700",
};

const MILESTONE_STATUSES: MilestoneStatus[] = ["pending", "in_progress", "done", "blocked"];

const MILESTONE_LABEL: Record<MilestoneStatus, string> = {
  pending: "Not started",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const MILESTONE_PILL: Record<MilestoneStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-sky-100 text-sky-700",
  done: "bg-emerald-100 text-emerald-700",
  blocked: "bg-red-100 text-red-700",
};

const APPROVAL_PILL: Record<ApprovalStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

const DRAWER_TABS = [
  { id: "overview", label: "Overview", icon: FileText },
  { id: "milestones", label: "Milestones", icon: MilestoneIcon },
  { id: "tasks", label: "Tasks", icon: ClipboardList },
  { id: "updates", label: "Updates", icon: RefreshCw },
  { id: "comments", label: "Comments", icon: MessageSquare },
  { id: "approvals", label: "Approvals", icon: ShieldCheck },
] as const;

type DrawerTab = typeof DRAWER_TABS[number]["id"];

// Two separate class strings rather than `INPUT + "w-auto text-xs"`: Tailwind
// resolves same-property utilities by stylesheet order, not by the order they
// appear in the attribute, so `w-full`/`text-sm` would silently win.
const INPUT = "w-full px-3 py-2 border border-input rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-foreground/20";
const INPUT_COMPACT = "px-2 py-1 border border-input rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-foreground/20";
const LABEL = "text-[11px] font-bold text-muted-foreground uppercase tracking-wide block mb-1";

function stageStyle(stage: string) {
  return PROJECT_STAGE_STYLES[stage as ProjectStage] || PROJECT_STAGE_STYLES["New Lead"];
}

/**
 * Both `date` columns ("2026-09-11") and timestamps ("2026-09-11T00:00:00.000Z")
 * are reduced to the same calendar day, so a value written from a `type="date"`
 * input reads back as the day that was typed.
 */
function isoDay(value?: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function fmtDay(value?: string | null): string {
  const day = isoDay(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return "—";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMoment(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** A `datetime-local` value is local wall-clock; the API wants an absolute instant. */
function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

// ── Presentational atoms ────────────────────────────────────────────────────

function Pill({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function BlockedPill({ reason }: { reason: string }) {
  return (
    <span
      title={reason}
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap"
    >
      <AlertCircle className="w-3 h-3 shrink-0" /> Blocked
    </span>
  );
}

function ProgressBar({ percent, accent }: { percent: number | null; accent: string }) {
  const pct = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <div className="h-1.5 bg-muted rounded-full overflow-hidden" role="presentation">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: accent }} />
    </div>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> <span>{message}</span>
    </p>
  );
}

function SectionHeading({ icon: Icon, children, right }: {
  icon: React.ElementType; children: React.ReactNode; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 mb-2">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" /> {children}
      </h3>
      {right}
    </div>
  );
}

// ── Delivery issues ─────────────────────────────────────────────────────────
//
// The question this screen exists to answer is "did that reminder actually
// reach anybody, and if nobody knows, what do I do about it?" — so the states
// are labelled in those words rather than in the machine's.

const DELIVERY_LABEL: Record<DeliveryState, string> = {
  pending: "Will try again",
  attempting: "Sending now",
  accepted: "Handed over",
  refused: "Refused",
  uncertain: "Unknown",
};

const DELIVERY_PILL: Record<DeliveryState, string> = {
  pending: "bg-amber-100 text-amber-700",
  attempting: "bg-amber-100 text-amber-700",
  accepted: "bg-teal-100 text-teal-700",
  refused: "bg-red-100 text-red-700",
  // The one that needs a person. Ringed so it reads differently from the
  // states a machine is still working on.
  uncertain: "bg-amber-100 text-amber-800 ring-1 ring-amber-400",
};

const DELIVERY_STATE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Everything open" },
  { value: "uncertain", label: "Unknown" },
  { value: "refused", label: "Refused" },
  { value: "pending", label: "Will try again" },
  { value: "attempting", label: "Sending now" },
];

const ACTION_LABEL: Record<RecoveryAction, string> = {
  retry: "Retry",
  resend: "Re-send (new copy)",
  acknowledge: "Acknowledge",
};

const ACTION_EXPLAINER: Record<RecoveryAction, string> = {
  retry:
    "Sends the same message again with the same idempotency key, so the provider collapses it into "
    + "the original. Nothing about the reminder changes and the recipient cannot get two.",
  resend:
    "Creates a genuinely NEW copy with a new idempotency key, so the provider will NOT collapse it.",
  acknowledge:
    "Closes this without sending anything. Use it once you know what happened.",
};

const ACTION_ICON: Record<RecoveryAction, React.ElementType> = {
  retry: RefreshCw,
  resend: Copy,
  acknowledge: CheckCircle2,
};

function deliveryRecipient(row: DeliveryRow): string {
  if (row.recipientName) return row.recipientName;
  if (row.recipientEmail) return row.recipientEmail;
  return "Not recorded";
}

/** One row's recovery panel: pick an action, say why, do it. */
function RecoveryPanel({ row, onDone, onCancel }: {
  row: DeliveryRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Re-send is never what opens selected, even when it is the only thing that
  // would work — it is the one action that can put a second copy in somebody's
  // inbox, and a pre-selected destructive default is how that happens by
  // accident.
  const [action, setAction] = useState<RecoveryAction>(
    row.availableActions.find(a => a !== "resend") ?? "acknowledge",
  );
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await adminFetch(`/api/crm/operations/deliveries/${row.deliveryId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          ...(action === "resend" ? { confirmDuplicateRisk: confirmed } : {}),
        }),
      });
      if (!res.ok) {
        setError(await errorFrom(res, "That didn't work. Try again."));
        return;
      }
      onDone();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const blocked = reason.trim().length < 3 || (action === "resend" && !confirmed);

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(["retry", "resend", "acknowledge"] as RecoveryAction[]).map(a => {
          const allowed = row.availableActions.includes(a);
          const Icon = ACTION_ICON[a];
          return (
            <button
              key={a}
              type="button"
              disabled={!allowed}
              aria-pressed={action === a}
              onClick={() => { setAction(a); setConfirmed(false); setError(""); }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                action === a
                  ? a === "resend"
                    ? "border-red-300 bg-red-50 text-red-700"
                    : "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-white text-muted-foreground hover:bg-accent"
              } ${allowed ? "" : "opacity-40 cursor-not-allowed"}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" /> {ACTION_LABEL[a]}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">{ACTION_EXPLAINER[action]}</p>

      {!row.availableActions.includes(action) && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          {action === "retry"
            ? "Retry isn't available here — it would no longer be collapsed into the original send, so it "
              + "could deliver a second copy. Re-send says that out loud instead."
            : "That isn't available for this delivery."}
        </p>
      )}

      {action === "resend" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 space-y-2">
          <p className="flex items-start gap-1.5 text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
            <span>{row.resendDuplicateRisk}</span>
          </p>
          <label className="flex items-start gap-2 text-xs text-red-700 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
            />
            <span>I understand this may put a second copy in their inbox, and I want that.</span>
          </label>
        </div>
      )}

      <div>
        <label className={LABEL} htmlFor={`reason-${row.deliveryId}`}>
          Why (recorded against this delivery)
        </label>
        <textarea
          id={`reason-${row.deliveryId}`}
          className={INPUT}
          rows={2}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Called them — the reminder never arrived."
        />
      </div>

      {error && <InlineError message={error} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={blocked || busy || !row.availableActions.includes(action)}
          onClick={() => void submit()}
        >
          {busy ? "Working…" : ACTION_LABEL[action]}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        {reason.trim().length < 3 && (
          <span className="text-[11px] text-muted-foreground">A reason is required.</span>
        )}
      </div>
    </div>
  );
}

function DeliveryCard({ row, open, onToggle, onDone }: {
  row: DeliveryRow; open: boolean; onToggle: () => void; onDone: () => void;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-3">
      <div className="flex flex-wrap items-start gap-2">
        <Pill className={DELIVERY_PILL[row.state]}>{DELIVERY_LABEL[row.state]}</Pill>
        <span className="text-sm font-medium text-foreground min-w-0 break-words">
          {deliveryRecipient(row)}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          Attempt {row.attempt}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">Reminder</dt>
          <dd className="text-foreground truncate">{row.kind.replace(/_/g, " ")}</dd>
        </div>
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">Sent for</dt>
          <dd className="text-foreground tabular-nums">{fmtMoment(row.occurrence)}</dd>
        </div>
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">Email</dt>
          <dd className="text-foreground truncate">{row.recipientEmail ?? "—"}</dd>
        </div>
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">Provider ref</dt>
          <dd className="text-foreground truncate font-mono text-[11px]">{row.providerRef ?? "—"}</dd>
        </div>
        {row.nextAttemptAt && (
          <div className="flex gap-1.5 min-w-0">
            <dt className="text-muted-foreground shrink-0">Next attempt</dt>
            <dd className="text-foreground tabular-nums">{fmtMoment(row.nextAttemptAt)}</dd>
          </div>
        )}
        {row.origin !== "live" && (
          <div className="flex gap-1.5 min-w-0">
            <dt className="text-muted-foreground shrink-0">Origin</dt>
            <dd className="text-amber-800">{row.origin.replace(/_/g, " ")}</dd>
          </div>
        )}
      </dl>

      {row.failureDetail && (
        <p className="mt-2 text-xs text-foreground break-words">
          <span className="text-muted-foreground">Reason: </span>{row.failureDetail}
        </p>
      )}
      {row.legacyRaw && (
        <p className="mt-1 text-[11px] text-muted-foreground font-mono break-all">{row.legacyRaw}</p>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> <span>{row.guidance}</span>
      </p>

      {open
        ? <RecoveryPanel row={row} onDone={onDone} onCancel={onToggle} />
        : (
          <div className="mt-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggle}>
              <Send className="w-3.5 h-3.5" /> What do you want to do?
            </Button>
          </div>
        )}
    </div>
  );
}

/**
 * The whole delivery queue, paged on the cursor the API returns.
 *
 * "Load more" walks the pages rather than jumping to one, because an unresolved
 * delivery is a message somebody may never have received — a page that can drop
 * one is worse than no page at all, since it looks complete.
 */
/** One page of the delivery queue, with the counts the server sent beside it. */
interface DeliveryQueue {
  rows: DeliveryRow[];
  nextCursor: number | null;
  /** Null when the server sent no count — never 0 standing in for one. */
  total: number | null;
  byState: Record<string, number>;
}

function pickDeliveryQueue(body: unknown): DeliveryQueue | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as { deliveries?: unknown; nextCursor?: unknown; counts?: unknown };
  // An answer without a list of deliveries is not an empty queue.
  if (!Array.isArray(b.deliveries)) return undefined;
  const counts = (b.counts && typeof b.counts === "object" ? b.counts : {}) as {
    matchingFilters?: unknown; byState?: unknown;
  };
  return {
    rows: b.deliveries as DeliveryRow[],
    nextCursor: typeof b.nextCursor === "number" ? b.nextCursor : null,
    total: typeof counts.matchingFilters === "number" ? counts.matchingFilters : null,
    byState: counts.byState && typeof counts.byState === "object"
      ? counts.byState as Record<string, number>
      : {},
  };
}

function DeliveryIssues({ onCountChange }: { onCountChange: (n: number | null) => void }) {
  const [state, setState] = useState("");
  const [queue, setQueue] = useState<Load<DeliveryQueue>>({ status: "loading" });
  /** A refused "Load more" must not take away the page already on screen. */
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const seq = useRef(0);

  const load = useCallback(async (after: number | null = null) => {
    const mine = ++seq.current;
    if (after === null) setQueue({ status: "loading" }); else setLoadingMore(true);
    setMoreError("");
    const p = new URLSearchParams({ limit: "25" });
    if (state) p.set("state", state);
    if (after !== null) p.set("cursor", String(after));
    const next = await readAdminResource(
      `/api/crm/operations/deliveries?${p.toString()}`,
      pickDeliveryQueue,
    );
    if (mine !== seq.current) return;
    if (after === null) {
      setQueue(next);
    } else if (next.status === "ready") {
      const page = next.data;
      setQueue(prev => (prev.status === "ready"
        ? { status: "ready", data: { ...page, rows: [...prev.data.rows, ...page.rows] } }
        : next));
    } else if (next.status === "error") {
      setMoreError(next.reason);
    }
    setLoadingMore(false);
    // The badge on the other views must never keep a number this read could not
    // confirm, and must never become 0 because the read failed. With a filter
    // on, the count is a filtered one and is not the badge's number at all.
    if (!state) {
      if (next.status === "ready") onCountChange(next.data.total);
      else if (next.status === "error") onCountChange(null);
    }
  }, [state, onCountChange]);

  useEffect(() => { void load(null); }, [load]);

  const afterRecovery = () => { setOpenId(null); void load(null); };

  // What actually loaded, or null. Never an empty page standing in for a
  // request nobody managed to complete.
  const data = queue.status === "ready" ? queue.data : null;
  const rows = data?.rows ?? [];
  const byState = data?.byState ?? {};

  return (
    <div className="flex-1 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-56">
          <label className={LABEL} htmlFor="delivery-state">Outcome</label>
          <select
            id="delivery-state"
            className={INPUT}
            value={state}
            onChange={e => { setState(e.target.value); }}
          >
            {DELIVERY_STATE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>
                {f.label}{f.value && byState[f.value] !== undefined ? ` (${byState[f.value]})` : ""}
              </option>
            ))}
          </select>
        </div>
        {/* This line renders above the failure below it, so it used to read
            "0 open · showing 0" next to "Couldn't load delivery issues" — a
            queue of possibly unreceived messages reported as empty. */}
        <p className="text-xs text-muted-foreground sm:pb-2.5 tabular-nums">
          <Figure value={data ? data.total : null} loading={queue.status === "loading"} /> open ·{" "}
          showing <Figure value={data ? rows.length : null} loading={queue.status === "loading"} />
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 sm:ml-auto sm:pb-2.5"
          aria-label="Refresh delivery issues"
          onClick={() => void load(null)}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {queue.status === "loading" ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <span className="sr-only">Loading delivery issues…</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : queue.status === "error" ? (
        <LoadFailure
          what="Delivery issues"
          reason={queue.reason}
          onRetry={() => { void load(null); }}
        >
          <p className="mt-2 min-w-0 break-words text-sm text-muted-foreground">
            No open count is shown while this is unavailable — reminders may be sitting in an unknown
            or failed state.
          </p>
        </LoadFailure>
      ) : rows.length === 0 ? (
        /* An empty queue is a fact about the reminders; the failure above is a
           fact about the request. They must never look alike. */
        <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
          <Mail className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">Every reminder is accounted for.</p>
          <p className="text-sm text-muted-foreground/70 max-w-md">
            Nothing here means no reminder is sitting in an unknown or failed state. A reminder that
            the mail provider took is not listed — only the ones somebody has to decide about.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map(row => (
              <DeliveryCard
                key={row.deliveryId}
                row={row}
                open={openId === row.deliveryId}
                onToggle={() => setOpenId(id => (id === row.deliveryId ? null : row.deliveryId))}
                onDone={afterRecovery}
              />
            ))}
          </div>
          {/* The page already on screen stays; only the page that did not
              arrive is reported missing. */}
          {moreError && (
            <LoadFailure
              what="More delivery issues"
              reason={moreError}
              variant="inline"
              onRetry={() => { if (data && data.nextCursor !== null) void load(data.nextCursor); }}
              retrying={loadingMore}
            />
          )}
          {data && data.nextCursor !== null && (
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void load(data.nextCursor)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
          {data && data.nextCursor === null && rows.length > 0 && (
            <p className="text-center text-xs text-muted-foreground pt-1">
              That is all {rows.length} of them — nothing is hidden by the page size.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Automation failures ─────────────────────────────────────────────────────
//
// The same shape as Delivery above, and deliberately so: the question is the
// same one — "this did not happen, and what am I supposed to do about it?" —
// and an operator should not have to learn a second set of words for it.
//
// Two verbs, not one button. Retry re-runs it and is OFFERED ONLY where
// re-running cannot repeat a side effect; the server decides that and sends the
// reason, which is rendered verbatim rather than re-derived here where it could
// drift. Acknowledge records a decision and re-runs nothing.

type FailureKind = "event" | "run";
type FailureVerb = "retry" | "acknowledge";

interface FailureStep {
  actionIndex: number;
  actionType: string;
  status: string;
  attempts: number;
  detail: string | null;
}

interface FailureRow {
  key: string;
  kind: FailureKind;
  id: number;
  failure: string;
  failureLabel: string;
  /** Null on an event — it never reached rule evaluation, so no rule fired. */
  ruleId: number | null;
  ruleName: string | null;
  trigger: string;
  recordType: string;
  recordId: number;
  status: string;
  stopReason: string | null;
  attempts: number;
  maxAttempts: number | null;
  nextAttemptAt: string | null;
  willRetryAutomatically: boolean;
  error: string | null;
  steps: FailureStep[];
  availableActions: FailureVerb[];
  retryWithheldReason: string;
  retryMeans: string;
  guidance: string;
  at: string;
  resolvedAt: string | null;
  resolvedByLabel: string | null;
  resolutionNote: string | null;
}

const FAILURE_PILL: Record<string, string> = {
  event_retrying: "bg-amber-100 text-amber-700",
  run_retrying: "bg-amber-100 text-amber-700",
  event_gave_up: "bg-red-100 text-red-700",
  run_failed_definitively: "bg-red-100 text-red-700",
  // The one nobody can resolve by pressing a button. Ringed so it reads
  // differently from the states a machine is still working on.
  run_outcome_unknown: "bg-amber-100 text-amber-800 ring-1 ring-amber-400",
  run_stopped_by_loop_protection: "bg-sky-100 text-sky-700",
};

const FAILURE_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Everything unresolved" },
  { value: "kind=run", label: "Rule runs only" },
  { value: "kind=event", label: "Events only" },
  { value: "scope=all", label: "Including acknowledged" },
];

const VERB_LABEL: Record<FailureVerb, string> = {
  retry: "Retry",
  acknowledge: "Acknowledge",
};

const VERB_ICON: Record<FailureVerb, React.ElementType> = {
  retry: RefreshCw,
  acknowledge: CheckCircle2,
};

const STEP_PILL: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-700",
  skipped: "bg-muted text-muted-foreground",
  failed: "bg-red-100 text-red-700",
  unknown: "bg-amber-100 text-amber-800",
  awaiting_approval: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
};

function failureSubject(row: FailureRow): string {
  return row.ruleName ?? "No rule ran — the event never got that far";
}

/** One row's recovery panel: pick a verb, say why, do it. */
function FailureRecoveryPanel({ row, onDone, onCancel }: {
  row: FailureRow; onDone: () => void; onCancel: () => void;
}) {
  const [verb, setVerb] = useState<FailureVerb>(row.availableActions[0] ?? "acknowledge");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const allowed = row.availableActions.includes(verb);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await adminFetch(
        `/api/crm/automation/failures/${row.kind}/${row.id}/${verb}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) {
        setError(await errorFrom(res, "That didn't work. Try again."));
        return;
      }
      onDone();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3 space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(["retry", "acknowledge"] as FailureVerb[]).map(v => {
          const on = row.availableActions.includes(v);
          const Icon = VERB_ICON[v];
          return (
            <button
              key={v}
              type="button"
              disabled={!on}
              aria-pressed={verb === v}
              onClick={() => { setVerb(v); setError(""); }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                verb === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-white text-muted-foreground hover:bg-accent"
              } ${on ? "" : "opacity-40 cursor-not-allowed"}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" /> {VERB_LABEL[v]}
            </button>
          );
        })}
      </div>

      {verb === "retry" && allowed && (
        <p className="text-xs text-muted-foreground">{row.retryMeans}</p>
      )}
      {verb === "acknowledge" && allowed && (
        <p className="text-xs text-muted-foreground">
          Records that you decided nothing more is needed. It re-runs nothing and changes no
          automation state — only the fact that you closed it is new.
        </p>
      )}

      {!allowed && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>That isn&rsquo;t available for this one.</span>
        </p>
      )}

      <div>
        <label className={LABEL} htmlFor={`fail-reason-${row.key}`}>
          Why (recorded against this automation)
        </label>
        <textarea
          id={`fail-reason-${row.key}`}
          className={INPUT}
          rows={2}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. Checked the contact — the task is already there."
        />
      </div>

      {error && <InlineError message={error} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={!allowed || busy || reason.trim().length < 3}
          onClick={() => void submit()}
        >
          {busy ? "Working…" : VERB_LABEL[verb]}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        {reason.trim().length < 3 && (
          <span className="text-[11px] text-muted-foreground">A reason is required.</span>
        )}
      </div>
    </div>
  );
}

function FailureCard({ row, open, onToggle, onDone }: {
  row: FailureRow; open: boolean; onToggle: () => void; onDone: () => void;
}) {
  return (
    <div className="bg-white border border-border rounded-xl p-3">
      <div className="flex flex-wrap items-start gap-2">
        <Pill className={FAILURE_PILL[row.failure] ?? "bg-muted text-muted-foreground"}>
          {row.failureLabel}
        </Pill>
        <span className="text-sm font-medium text-foreground min-w-0 break-words">
          {failureSubject(row)}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
          {row.maxAttempts === null
            ? `Attempt ${row.attempts}`
            : `Attempt ${row.attempts} of ${row.maxAttempts}`}
        </span>
      </div>

      <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">Triggered by</dt>
          <dd className="text-foreground truncate">{row.trigger.replace(/_/g, " ")}</dd>
        </div>
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">On</dt>
          <dd className="text-foreground truncate">
            {row.recordType.replace(/_/g, " ")} #{row.recordId}
          </dd>
        </div>
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">Last change</dt>
          <dd className="text-foreground tabular-nums">{fmtMoment(row.at)}</dd>
        </div>
        <div className="flex gap-1.5 min-w-0">
          <dt className="text-muted-foreground shrink-0">Next attempt</dt>
          <dd className="text-foreground tabular-nums">
            {row.willRetryAutomatically && row.nextAttemptAt
              ? fmtMoment(row.nextAttemptAt)
              : "None scheduled"}
          </dd>
        </div>
      </dl>

      {row.error && (
        <p className="mt-2 text-xs text-foreground break-words">
          <span className="text-muted-foreground">Error: </span>{row.error}
        </p>
      )}

      {row.steps.length > 0 && (
        <ul className="mt-2 space-y-1">
          {row.steps.map(step => (
            <li key={step.actionIndex} className="flex flex-wrap items-start gap-1.5 text-xs">
              <Pill className={STEP_PILL[step.status] ?? "bg-muted text-muted-foreground"}>
                {step.status.replace(/_/g, " ")}
              </Pill>
              <span className="text-foreground">
                Step {step.actionIndex + 1}: {step.actionType.replace(/_/g, " ")}
              </span>
              {step.detail && (
                <span className="text-muted-foreground min-w-0 break-words w-full sm:w-auto">
                  {step.detail}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
        <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> <span>{row.guidance}</span>
      </p>

      {/* Why retry is not on offer, on the CARD rather than inside the panel.
          The Retry button for such a row is disabled, so a reason shown only
          when Retry is selected could never be read — the one question the
          operator actually has ("why can't I just run it again?") would have
          had no answer anywhere. The server's own words, verbatim, so the
          screen cannot drift from the rule the API enforces. */}
      {!row.resolvedAt && row.retryWithheldReason && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span><strong>Retry is not available.</strong> {row.retryWithheldReason}</span>
        </p>
      )}

      {row.resolvedAt ? (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Acknowledged by {row.resolvedByLabel ?? "somebody"} on {fmtMoment(row.resolvedAt)}
            {row.resolutionNote ? ` — “${row.resolutionNote}”` : ""}
          </span>
        </p>
      ) : open ? (
        <FailureRecoveryPanel row={row} onDone={onDone} onCancel={onToggle} />
      ) : row.availableActions.length > 0 ? (
        <div className="mt-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={onToggle}>
            <ShieldCheck className="w-3.5 h-3.5" /> What do you want to do?
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nothing to decide yet — this has not finished.
        </p>
      )}
    </div>
  );
}

/**
 * The whole automation failure queue, walked page by page.
 *
 * Events and rule runs are two tables, so the API pages them as two keyset
 * streams and hands back one cursor for each. "Load more" advances whichever
 * still has a page, because a failure nobody can find is a failure nobody will
 * fix — a list that can silently drop one is worse than no list at all, since
 * it looks complete.
 */
/** One page of the automation queue. Events and rule runs page separately. */
interface FailureQueue {
  rows: FailureRow[];
  nextCursor: { run: number | null; event: number | null };
  hasMore: boolean;
  /** Null when the server sent no count — never 0 standing in for one. */
  total: number | null;
}

function pickFailureQueue(body: unknown): FailureQueue | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as { failures?: unknown; nextCursor?: unknown; hasMore?: unknown; counts?: unknown };
  // An answer without a list of failures is not "everything is accounted for".
  if (!Array.isArray(b.failures)) return undefined;
  const cursor = (b.nextCursor && typeof b.nextCursor === "object" ? b.nextCursor : {}) as {
    run?: unknown; event?: unknown;
  };
  const counts = (b.counts && typeof b.counts === "object" ? b.counts : {}) as {
    matchingFilters?: unknown;
  };
  return {
    rows: b.failures as FailureRow[],
    nextCursor: {
      run: typeof cursor.run === "number" ? cursor.run : null,
      event: typeof cursor.event === "number" ? cursor.event : null,
    },
    hasMore: b.hasMore === true,
    total: typeof counts.matchingFilters === "number" ? counts.matchingFilters : null,
  };
}

function AutomationFailures({ onCountChange }: { onCountChange: (n: number | null) => void }) {
  const [filter, setFilter] = useState("");
  const [queue, setQueue] = useState<Load<FailureQueue>>({ status: "loading" });
  /** A refused "Load more" must not take away the page already on screen. */
  const [moreError, setMoreError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const seq = useRef(0);

  const load = useCallback(async (after: { run: number | null; event: number | null } | null = null) => {
    const mine = ++seq.current;
    if (after === null) setQueue({ status: "loading" }); else setLoadingMore(true);
    setMoreError("");
    const p = new URLSearchParams(filter);
    p.set("limit", "25");
    if (after?.run != null) p.set("runCursor", String(after.run));
    if (after?.event != null) p.set("eventCursor", String(after.event));
    const next = await readAdminResource(
      `/api/crm/automation/failures?${p.toString()}`,
      pickFailureQueue,
    );
    if (mine !== seq.current) return;
    if (after === null) {
      setQueue(next);
    } else if (next.status === "ready") {
      const page = next.data;
      setQueue(prev => (prev.status === "ready"
        ? { status: "ready", data: { ...page, rows: [...prev.data.rows, ...page.rows] } }
        : next));
    } else if (next.status === "error") {
      setMoreError(next.reason);
    }
    setLoadingMore(false);
    // As with the delivery badge: a read that failed leaves no number behind,
    // and never a 0.
    if (filter === "") {
      if (next.status === "ready") onCountChange(next.data.total);
      else if (next.status === "error") onCountChange(null);
    }
  }, [filter, onCountChange]);

  useEffect(() => { void load(null); }, [load]);

  const afterRecovery = () => { setOpenKey(null); void load(null); };

  const data = queue.status === "ready" ? queue.data : null;
  const rows = data?.rows ?? [];

  return (
    <div className="flex-1 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full sm:w-56">
          <label className={LABEL} htmlFor="automation-filter">Show</label>
          <select
            id="automation-filter"
            className={INPUT}
            value={filter}
            onChange={e => setFilter(e.target.value)}
          >
            {FAILURE_FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        {/* Above the failure, as the delivery count was: "0 in total · showing 0"
            beside "Couldn't load automation failures" said every automation had
            run when nobody had managed to ask. */}
        <p className="text-xs text-muted-foreground sm:pb-2.5 tabular-nums">
          <Figure value={data ? data.total : null} loading={queue.status === "loading"} /> in total ·{" "}
          showing <Figure value={data ? rows.length : null} loading={queue.status === "loading"} />
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="px-2 sm:ml-auto sm:pb-2.5"
          aria-label="Refresh automation failures"
          onClick={() => void load(null)}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {queue.status === "loading" ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <span className="sr-only">Loading automation failures…</span>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : queue.status === "error" ? (
        <LoadFailure
          what="Automation failures"
          reason={queue.reason}
          onRetry={() => { void load(null); }}
        >
          <p className="mt-2 min-w-0 break-words text-sm text-muted-foreground">
            No total is shown while this is unavailable — rule runs may have failed and events may be
            sitting unprocessed.
          </p>
        </LoadFailure>
      ) : rows.length === 0 ? (
        /* Only ever said about a list that arrived. */
        <div className="flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
          <Cpu className="w-10 h-10 text-muted-foreground/40" />
          <p className="text-muted-foreground font-medium">Every automation is accounted for.</p>
          <p className="text-sm text-muted-foreground/70 max-w-md">
            Nothing here means no rule run failed and no event went unprocessed. Runs that finished,
            and ones a rule deliberately stopped, are not listed — only the ones somebody has to
            decide about.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {rows.map(row => (
              <FailureCard
                key={row.key}
                row={row}
                open={openKey === row.key}
                onToggle={() => setOpenKey(k => (k === row.key ? null : row.key))}
                onDone={afterRecovery}
              />
            ))}
          </div>
          {moreError && (
            <LoadFailure
              what="More automation failures"
              reason={moreError}
              variant="inline"
              onRetry={() => { if (data) void load(data.nextCursor); }}
              retrying={loadingMore}
            />
          )}
          {data && data.hasMore ? (
            <div className="flex flex-col items-center gap-1 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={loadingMore}
                onClick={() => void load(data.nextCursor)}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Showing {rows.length} of <Figure value={data.total} />. This is a page, not the whole
                list — keep loading to reach the rest.
              </p>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground pt-1">
              That is all {rows.length} of them — nothing is hidden by the page size.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function CrmOperations() {
  const [mode, setMode] = useState<"board" | "list" | "deliveries" | "automation">("board");
  /** Open delivery problems, so the badge is visible from the other two views. */
  const [deliveryCount, setDeliveryCount] = useState<number | null>(null);
  /** Unresolved automation failures, for the same reason. */
  const [automationCount, setAutomationCount] = useState<number | null>(null);

  const [stage, setStage] = useState("");
  const [ownerStaffId, setOwnerStaffId] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [limit, setLimit] = useState(25);
  const [offset, setOffset] = useState(0);

  const [projects, setProjects] = useState<OpsProject[]>([]);
  const [total, setTotal] = useState(0);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [templates, setTemplates] = useState<OpsTemplate[]>([]);
  const [leads, setLeads] = useState<OpsLead[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  const seq = useRef(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("limit", String(limit));
    p.set("offset", String(offset));
    if (stage) p.set("stage", stage);
    if (ownerStaffId) p.set("ownerStaffId", ownerStaffId);
    if (includeArchived) p.set("includeArchived", "true");
    return p.toString();
  }, [limit, offset, stage, ownerStaffId, includeArchived]);

  /**
   * `showSkeleton: false` is the post-mutation refresh — the filters, the page
   * and the open drawer all stay exactly where they were.
   */
  const load = useCallback(async (showSkeleton = true) => {
    const mine = ++seq.current;
    if (showSkeleton) setLoading(true);
    setError("");
    try {
      const [projectsRes, assigneesRes, templatesRes, leadsRes] = await Promise.all([
        adminFetch(`/api/crm/operations/projects?${query}`),
        adminFetch("/api/crm/operations/assignees"),
        adminFetch("/api/crm/operations/templates"),
        adminFetch("/api/crm/leads"),
      ]);
      if (mine !== seq.current) return;
      if (!projectsRes.ok) throw new Error(String(projectsRes.status));

      const data = await projectsRes.json() as { projects?: OpsProject[]; total?: number };
      setProjects(data.projects ?? []);
      setTotal(Number(data.total ?? 0));

      // The three supporting reads are best-effort: a missing template list or
      // people directory must not hide the projects themselves.
      if (assigneesRes.ok) {
        setAssignees(((await assigneesRes.json()) as { assignees?: Assignee[] }).assignees ?? []);
      }
      if (templatesRes.ok) {
        setTemplates(((await templatesRes.json()) as { templates?: OpsTemplate[] }).templates ?? []);
      }
      if (leadsRes.ok) {
        setLeads(((await leadsRes.json()) as { leads?: OpsLead[] }).leads ?? []);
      }
    } catch {
      if (mine === seq.current) {
        setError("Couldn't load the delivery workspace. Check your connection and try again.");
      }
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [query]);

  useEffect(() => { void load(); }, [load]);

  // One cheap read so the badge is honest from whichever view you land on. It
  // asks for a single row and reads the whole-set count beside it, rather than
  // counting what happens to be on a page.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await adminFetch("/api/crm/operations/deliveries?limit=1");
        if (!live || !res.ok) return;
        const data = await res.json() as { counts?: { matchingFilters?: number } };
        setDeliveryCount(Number(data.counts?.matchingFilters ?? 0));
      } catch { /* a missing badge must never hide the projects */ }
    })();
    return () => { live = false; };
  }, []);

  // The same cheap read for automation. It is a SELECT on the server and is not
  // allowed to be anything else — no view of this list may retry, emit or
  // release anything as a side effect of being looked at.
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await adminFetch("/api/crm/automation/failures?limit=1");
        if (!live || !res.ok) return;
        const data = await res.json() as { counts?: { matchingFilters?: number } };
        setAutomationCount(Number(data.counts?.matchingFilters ?? 0));
      } catch { /* a missing badge must never hide the projects */ }
    })();
    return () => { live = false; };
  }, []);

  const peopleById = useMemo(
    () => new Map(assignees.map(a => [a.id, a.displayName])),
    [assignees],
  );
  const leadsById = useMemo(
    () => new Map(leads.map(l => [l.id, l])),
    [leads],
  );

  const ownerName = useCallback(
    (id: number | null) => (id == null ? "Unassigned" : peopleById.get(id) ?? `Staff #${id}`),
    [peopleById],
  );
  const clientName = useCallback(
    (project: OpsProject) => {
      if (project.leadId == null) return "";
      const lead = leadsById.get(project.leadId);
      if (!lead) return `Contact #${project.leadId}`;
      return lead.company ? `${lead.name} · ${lead.company}` : lead.name;
    },
    [leadsById],
  );

  const filtersActive = !!stage || !!ownerStaffId || includeArchived;
  const resetPage = () => setOffset(0);
  const clearFilters = () => {
    setStage("");
    setOwnerStaffId("");
    setIncludeArchived(false);
    setOffset(0);
  };

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + projects.length, total);
  const visibleStages: string[] = stage ? [stage] : [...PROJECT_STAGES];

  return (
    <CrmLayout>
      <div className="flex flex-col min-h-[calc(100vh-48px)]">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-border px-4 md:px-6 py-3 shrink-0">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0">
              <h1 className="font-bold text-foreground">Delivery Operations</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Every live project, who owns it, what is next and what is in the way.
              </p>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-input overflow-hidden" role="group" aria-label="View mode">
                <button
                  type="button"
                  onClick={() => setMode("board")}
                  aria-pressed={mode === "board"}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
                    mode === "board" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Board
                </button>
                <button
                  type="button"
                  onClick={() => setMode("list")}
                  aria-pressed={mode === "list"}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-l border-input transition-colors ${
                    mode === "list" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> List
                </button>
                <button
                  type="button"
                  onClick={() => setMode("deliveries")}
                  aria-pressed={mode === "deliveries"}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-l border-input transition-colors ${
                    mode === "deliveries" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" /> Delivery
                  {deliveryCount !== null && deliveryCount > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                        mode === "deliveries" ? "bg-white/25 text-primary-foreground" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {deliveryCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("automation")}
                  aria-pressed={mode === "automation"}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-l border-input transition-colors ${
                    mode === "automation" ? "bg-primary text-primary-foreground" : "bg-white text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" /> Automation
                  {automationCount !== null && automationCount > 0 && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums ${
                        mode === "automation" ? "bg-white/25 text-primary-foreground" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {automationCount}
                    </span>
                  )}
                </button>
              </div>
              <Button
                variant="ghost" size="sm" className="px-2" aria-label="Refresh"
                onClick={() => void load()}
                disabled={mode === "deliveries" || mode === "automation"}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {mode === "deliveries" && (
            <p className="mt-2 text-xs text-muted-foreground max-w-2xl">
              Reminders whose delivery is not a recorded success. An <strong>unknown</strong> one may or
              may not have reached the recipient — nothing retries those by itself, because a retry
              could deliver a second copy. That decision is yours, and it is recorded.
            </p>
          )}

          {mode === "automation" && (
            <p className="mt-2 text-xs text-muted-foreground max-w-2xl">
              Automation that did not happen: an event no rule ever got to act on, or a rule run that
              failed. <strong>Retry</strong> is offered only where re-running cannot repeat what it
              already did — a step with an <strong>unknown</strong> outcome, and anything loop
              protection stopped, cannot be retried and say so.{" "}
              <strong>Acknowledge</strong> re-runs nothing; it records that you decided. Looking at
              this list releases nothing.
            </p>
          )}

          {/* Filters — stacked at 375px, inline from sm up. Project filters do
              not apply to the delivery or automation queues, which have their own. */}
          <div className={`mt-3 flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 ${
            mode === "deliveries" || mode === "automation" ? "hidden" : "flex"
          }`}>
            <div className="sm:w-52">
              <label className={LABEL} htmlFor="ops-stage">Stage</label>
              <select
                id="ops-stage"
                className={INPUT}
                value={stage}
                onChange={e => { setStage(e.target.value); resetPage(); }}
              >
                <option value="">All stages</option>
                {PROJECT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="sm:w-52">
              <label className={LABEL} htmlFor="ops-owner">Owner</label>
              <select
                id="ops-owner"
                className={INPUT}
                value={ownerStaffId}
                onChange={e => { setOwnerStaffId(e.target.value); resetPage(); }}
              >
                <option value="">Anyone</option>
                {assignees.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </select>
            </div>
            <div className="sm:w-32">
              <label className={LABEL} htmlFor="ops-limit">Per page</label>
              <select
                id="ops-limit"
                className={INPUT}
                value={limit}
                onChange={e => { setLimit(Number(e.target.value)); resetPage(); }}
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer sm:pb-2.5">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={e => { setIncludeArchived(e.target.checked); resetPage(); }}
              />
              Show archived
            </label>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-primary hover:underline sm:pb-2.5 text-left"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        {mode === "deliveries" ? (
          <DeliveryIssues onCountChange={setDeliveryCount} />
        ) : mode === "automation" ? (
          <AutomationFailures onCountChange={setAutomationCount} />
        ) : loading ? (
          mode === "board" ? (
            <div className="flex-1 flex gap-3 p-4 overflow-x-auto">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-72 shrink-0 space-y-2">
                  <div className="h-9 bg-muted rounded-t-xl animate-pulse" />
                  <div className="h-28 bg-muted rounded-xl animate-pulse" />
                  <div className="h-28 bg-muted rounded-xl animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex-1 p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          )
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-muted-foreground font-medium max-w-sm">{error}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 py-20 px-6 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">
              {filtersActive ? "No projects match these filters." : "No projects yet."}
            </p>
            <p className="text-sm text-muted-foreground/70 max-w-sm">
              {filtersActive
                ? "Widen the stage or owner filter, or include archived projects."
                : "Projects created from Sales or the Projects pipeline appear here as soon as they exist."}
            </p>
            {filtersActive && (
              <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : mode === "board" ? (
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 items-start min-w-max">
              {visibleStages.map(s => {
                const col = stageStyle(s);
                const inStage = projects.filter(p => p.stage === s);
                return (
                  <div key={s} className="w-72 shrink-0 flex flex-col">
                    <div className={`rounded-t-xl px-3 py-2.5 border border-b-0 ${col.border} ${col.bg}`}>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.accent }} />
                        <span className={`text-xs font-bold ${col.text} truncate`}>{s}</span>
                        <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/70 ${col.text} tabular-nums`}>
                          {inStage.length}
                        </span>
                      </div>
                    </div>
                    <div className={`p-2 space-y-2 rounded-b-xl border border-t-0 ${col.border} bg-muted/70 min-h-[110px]`}>
                      {inStage.length === 0 ? (
                        <p className="text-xs text-muted-foreground/60 text-center py-6">Nothing here</p>
                      ) : (
                        inStage.map(p => (
                          <BoardCard
                            key={p.id}
                            project={p}
                            client={clientName(p)}
                            owner={ownerName(p.ownerStaffId)}
                            onOpen={() => setDetailId(p.id)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 p-0 md:p-4">
            {/* Below md the table becomes stacked cards; above it, a real table. */}
            <div className="md:hidden divide-y divide-border/50 bg-white">
              {projects.map(p => (
                <MobileRow
                  key={p.id}
                  project={p}
                  client={clientName(p)}
                  owner={ownerName(p.ownerStaffId)}
                  onOpen={() => setDetailId(p.id)}
                />
              ))}
            </div>

            <div className="hidden md:block bg-white rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[900px]">
                <thead className="bg-muted/60 border-b border-border">
                  <tr>
                    {["Project", "Client", "Stage", "Owner", "Priority", "Target launch", "Progress", "Tasks", "Milestones"].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {projects.map(p => {
                    const col = stageStyle(p.stage);
                    return (
                      <tr
                        key={p.id}
                        onClick={() => setDetailId(p.id)}
                        onKeyDown={e => { if (e.key === "Enter") setDetailId(p.id); }}
                        tabIndex={0}
                        role="button"
                        className="cursor-pointer hover:bg-accent/60 focus:bg-accent/60 focus:outline-none"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-foreground">{p.name}</span>
                            {p.blockedReason && <BlockedPill reason={p.blockedReason} />}
                            {p.archivedAt && <Pill className="bg-muted text-muted-foreground">Archived</Pill>}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{clientName(p) || "—"}</td>
                        <td className="px-3 py-2.5">
                          <Pill className={`${col.bg} ${col.text}`}>{p.stage}</Pill>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">{ownerName(p.ownerStaffId)}</td>
                        <td className="px-3 py-2.5">
                          {p.priority
                            ? <Pill className={PRIORITY_PILL[p.priority] ?? "bg-muted text-muted-foreground"}>{p.priority}</Pill>
                            : <span className="text-muted-foreground/60">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap tabular-nums">
                          {fmtDay(p.targetLaunchDate)}
                        </td>
                        <td className="px-3 py-2.5 w-36">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-[70px]">
                              <ProgressBar percent={p.progressPercent} accent={col.accent} />
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums w-9 text-right">
                              {p.progressPercent == null ? "—" : `${p.progressPercent}%`}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">
                          {p.openTasks}/{p.totalTasks} open
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap">
                          {p.doneMilestones}/{p.totalMilestones}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Pagination (projects only; the delivery queue pages itself) ── */}
        {mode !== "deliveries" && !loading && !error && (
          <div className="bg-white border-t border-border px-4 md:px-6 py-2.5 flex flex-wrap items-center gap-3 shrink-0">
            <p className="text-xs text-muted-foreground tabular-nums">
              Showing {from}–{to} of {total}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={offset === 0}
                onClick={() => setOffset(o => Math.max(0, o - limit))}
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={offset + limit >= total}
                onClick={() => setOffset(o => o + limit)}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {detailId !== null && (
        <ProjectDrawer
          projectId={detailId}
          assignees={assignees}
          templates={templates}
          onClose={() => setDetailId(null)}
          onChanged={() => { void load(false); }}
        />
      )}
    </CrmLayout>
  );
}

// ── Board card ──────────────────────────────────────────────────────────────

function BoardCard({ project, client, owner, onOpen }: {
  project: OpsProject; client: string; owner: string; onOpen: () => void;
}) {
  const col = stageStyle(project.stage);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="bg-white rounded-xl border border-border shadow-sm p-3 cursor-pointer hover:shadow-md focus:ring-2 focus:ring-foreground/20 focus:outline-none transition-all"
    >
      <div className="flex items-start gap-2 mb-1.5">
        <p className="font-semibold text-sm text-foreground leading-snug flex-1">{project.name}</p>
        {project.archivedAt && <Pill className="bg-muted text-muted-foreground">Archived</Pill>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Pill className={`${col.bg} ${col.text}`}>{project.stage}</Pill>
        {project.priority && (
          <Pill className={PRIORITY_PILL[project.priority] ?? "bg-muted text-muted-foreground"}>{project.priority}</Pill>
        )}
        {project.blockedReason && <BlockedPill reason={project.blockedReason} />}
      </div>

      <div className="space-y-1 mb-2.5">
        {client && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="w-3 h-3 shrink-0" /> <span className="truncate">{client}</span>
          </p>
        )}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Flag className="w-3 h-3 shrink-0" /> <span className="truncate">{owner}</span>
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          <CalendarDays className="w-3 h-3 shrink-0" /> Launch {fmtDay(project.targetLaunchDate)}
        </p>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1 tabular-nums">
        <span>{project.openTasks}/{project.totalTasks} tasks open</span>
        <span>{project.progressPercent == null ? "—" : `${project.progressPercent}%`}</span>
      </div>
      <ProgressBar percent={project.progressPercent} accent={col.accent} />
      <p className="text-[10px] text-muted-foreground mt-1.5 tabular-nums">
        {project.doneMilestones}/{project.totalMilestones} milestones done
      </p>
    </div>
  );
}

// ── Mobile list row ─────────────────────────────────────────────────────────

function MobileRow({ project, client, owner, onOpen }: {
  project: OpsProject; client: string; owner: string; onOpen: () => void;
}) {
  const col = stageStyle(project.stage);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter") onOpen(); }}
      className="p-4 active:bg-accent cursor-pointer"
    >
      <div className="flex items-start gap-2 flex-wrap mb-1.5">
        <p className="font-semibold text-sm text-foreground flex-1 min-w-0">{project.name}</p>
        {project.blockedReason && <BlockedPill reason={project.blockedReason} />}
        {project.archivedAt && <Pill className="bg-muted text-muted-foreground">Archived</Pill>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <Pill className={`${col.bg} ${col.text}`}>{project.stage}</Pill>
        {project.priority && (
          <Pill className={PRIORITY_PILL[project.priority] ?? "bg-muted text-muted-foreground"}>{project.priority}</Pill>
        )}
      </div>
      {client && <p className="text-xs text-muted-foreground truncate">{client}</p>}
      <p className="text-xs text-muted-foreground">{owner}</p>
      <p className="text-xs text-muted-foreground tabular-nums">Launch {fmtDay(project.targetLaunchDate)}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1"><ProgressBar percent={project.progressPercent} accent={col.accent} /></div>
        <span className="text-[10px] text-muted-foreground tabular-nums w-9 text-right">
          {project.progressPercent == null ? "—" : `${project.progressPercent}%`}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
        {project.openTasks}/{project.totalTasks} tasks open · {project.doneMilestones}/{project.totalMilestones} milestones
      </p>
    </div>
  );
}

// ── Detail drawer ───────────────────────────────────────────────────────────

interface OverviewForm {
  name: string;
  stage: string;
  projectType: string;
  priority: string;
  ownerStaffId: string;
  nextAction: string;
  nextActionDueAt: string;
  blockedReason: string;
  startDate: string;
  targetLaunchDate: string;
  notes: string;
}

function formFrom(p: OpsProject): OverviewForm {
  return {
    name: p.name ?? "",
    stage: p.stage ?? "New Lead",
    projectType: p.projectType ?? "",
    priority: p.priority ?? "",
    ownerStaffId: p.ownerStaffId == null ? "" : String(p.ownerStaffId),
    nextAction: p.nextAction ?? "",
    nextActionDueAt: isoDay(p.nextActionDueAt),
    blockedReason: p.blockedReason ?? "",
    startDate: p.startDate ?? "",
    targetLaunchDate: p.targetLaunchDate ?? "",
    notes: p.notes ?? "",
  };
}

function ProjectDrawer({ projectId, assignees, templates, onClose, onChanged }: {
  projectId: number;
  assignees: Assignee[];
  templates: OpsTemplate[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<DrawerTab>("overview");
  const [form, setForm] = useState<OverviewForm | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateError, setTemplateError] = useState("");

  /**
   * `showSkeleton: false` is the re-read after a write — the tab, the scroll
   * position and the form stay put while the persisted values land.
   */
  const load = useCallback(async (showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    setError("");
    try {
      const res = await adminFetch(`/api/crm/operations/projects/${projectId}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as Partial<ProjectDetail>;
      if (!data.project) throw new Error("malformed");
      // Normalise every collection: one missing array must not white-screen
      // the drawer.
      setDetail({
        project: data.project,
        lead: data.lead ?? null,
        tasks: data.tasks ?? [],
        milestones: data.milestones ?? [],
        updates: data.updates ?? [],
        comments: data.comments ?? [],
        approvals: data.approvals ?? [],
      });
      setForm(formFrom(data.project));
    } catch {
      setError("Couldn't load this project. Check your connection and try again.");
    } finally {
      if (showSkeleton) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** Every write ends here: re-read the record, then refresh the list behind it. */
  const afterWrite = useCallback(async () => {
    await load(false);
    onChanged();
  }, [load, onChanged]);

  const applyTemplate = async (templateId: number) => {
    setTemplateBusy(true);
    setTemplateError("");
    const res = await adminFetch(`/api/crm/operations/projects/${projectId}/apply-template`, {
      method: "POST",
      body: JSON.stringify({ templateId }),
    });
    setTemplateBusy(false);
    if (!res.ok) {
      setTemplateError(await errorFrom(res, "Couldn't apply that template."));
      return;
    }
    setTemplateOpen(false);
    await afterWrite();
  };

  const peopleById = useMemo(() => new Map(assignees.map(a => [a.id, a.displayName])), [assignees]);
  const nameOf = (id: number | null) => (id == null ? "Unassigned" : peopleById.get(id) ?? `Staff #${id}`);

  const project = detail?.project ?? null;
  const col = stageStyle(project?.stage ?? "New Lead");
  const pendingApprovals = detail ? detail.approvals.filter(a => a.status === "pending").length : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex md:justify-end" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Project detail"
        className="bg-white w-full h-full md:max-w-2xl flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className={`px-4 md:px-5 py-3.5 border-b border-border/60 shrink-0 ${col.bg}`}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-bold text-foreground truncate">
                {project?.name ?? (loading ? "Loading…" : "Project")}
              </h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {project && <Pill className={`bg-white/70 ${col.text}`}>{project.stage}</Pill>}
                {detail?.lead && <span className="text-xs text-muted-foreground truncate">{detail.lead.name}</span>}
                {project?.blockedReason && <BlockedPill reason={project.blockedReason} />}
                {project?.archivedAt && <Pill className="bg-white/70 text-muted-foreground">Archived</Pill>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 bg-white"
                disabled={!project}
                onClick={() => { setTemplateOpen(o => !o); setTemplateError(""); }}
              >
                <Plus className="w-3.5 h-3.5" /> Apply template
              </Button>
              <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {templateOpen && (
            <div className="mt-3 rounded-xl border border-border bg-white p-3">
              <p className="text-xs font-semibold text-foreground mb-2">
                Applying a template adds its tasks and milestones to this project.
              </p>
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground">No templates have been created yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto">
                  {templates.map(t => (
                    <div key={t.id} className="flex items-start gap-2 border border-border rounded-lg px-2.5 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{t.name}</p>
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          {(t.tasks?.length ?? 0)} task(s) · {(t.milestones?.length ?? 0)} milestone(s)
                          {t.projectType ? ` · ${t.projectType}` : ""}
                        </p>
                        {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                      </div>
                      <Button size="sm" disabled={templateBusy} onClick={() => void applyTemplate(t.id)}>
                        {templateBusy ? "Applying…" : "Apply"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {templateError && <InlineError message={templateError} />}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-2 md:px-4 border-b border-border/60 overflow-x-auto shrink-0 bg-white">
          {DRAWER_TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            const count =
              t.id === "milestones" ? detail?.milestones.length
              : t.id === "tasks" ? detail?.tasks.length
              : t.id === "updates" ? detail?.updates.length
              : t.id === "comments" ? detail?.comments.length
              : t.id === "approvals" ? pendingApprovals
              : undefined;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {t.label}
                {count != null && count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 rounded-full bg-muted text-muted-foreground tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : error || !detail || !project || !form ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <p className="text-muted-foreground font-medium max-w-xs">
                {error || "This project could not be loaded."}
              </p>
              <Button variant="outline" size="sm" onClick={() => void load()}>Retry</Button>
            </div>
          ) : tab === "overview" ? (
            <OverviewTab
              project={project}
              lead={detail.lead}
              form={form}
              setForm={setForm}
              assignees={assignees}
              nameOf={nameOf}
              afterWrite={afterWrite}
            />
          ) : tab === "milestones" ? (
            <MilestonesTab projectId={projectId} milestones={detail.milestones} afterWrite={afterWrite} />
          ) : tab === "tasks" ? (
            <TasksTab projectId={projectId} tasks={detail.tasks} assignees={assignees} nameOf={nameOf} afterWrite={afterWrite} />
          ) : tab === "updates" ? (
            <UpdatesTab projectId={projectId} updates={detail.updates} afterWrite={afterWrite} />
          ) : tab === "comments" ? (
            <CommentsTab projectId={projectId} comments={detail.comments} afterWrite={afterWrite} />
          ) : (
            <ApprovalsTab
              projectId={projectId}
              approvals={detail.approvals}
              assignees={assignees}
              nameOf={nameOf}
              afterWrite={afterWrite}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({ project, lead, form, setForm, assignees, nameOf, afterWrite }: {
  project: OpsProject;
  lead: OpsLead | null;
  form: OverviewForm;
  setForm: (updater: (f: OverviewForm | null) => OverviewForm | null) => void;
  assignees: Assignee[];
  nameOf: (id: number | null) => string;
  afterWrite: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saved, setSaved] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const set = (patch: Partial<OverviewForm>) => {
    setSaved(false);
    setForm(f => (f ? { ...f, ...patch } : f));
  };

  const patchProject = async (body: Record<string, unknown>) => {
    const res = await adminFetch(`/api/crm/operations/projects/${project.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await errorFrom(res, "That change was refused."));
  };

  const save = async () => {
    if (!form.name.trim()) { setSaveError("Give the project a name."); return; }
    setSaving(true);
    setSaveError("");
    try {
      await patchProject({
        name: form.name.trim(),
        stage: form.stage,
        projectType: form.projectType || null,
        priority: form.priority || null,
        ownerStaffId: form.ownerStaffId ? Number(form.ownerStaffId) : null,
        nextAction: form.nextAction.trim() || null,
        nextActionDueAt: form.nextActionDueAt || null,
        blockedReason: form.blockedReason.trim() || null,
        startDate: form.startDate || null,
        targetLaunchDate: form.targetLaunchDate || null,
        notes: form.notes.trim() || null,
      });
      await afterWrite();
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "That change was refused.");
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    setArchiving(true);
    setSaveError("");
    try {
      await patchProject({ archived: !project.archivedAt });
      await afterWrite();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "That change was refused.");
    } finally {
      setArchiving(false);
    }
  };

  const collaborators = (project.collaboratorStaffIds ?? []).map(nameOf);

  return (
    <div className="space-y-5">
      <div>
        <label className={LABEL} htmlFor="ops-name">Project name</label>
        <input
          id="ops-name"
          className={INPUT}
          value={form.name}
          onChange={e => set({ name: e.target.value })}
        />
      </div>

      <div className="rounded-xl border border-border p-3.5 bg-accent/40">
        <SectionHeading icon={Flag}>Next action</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <input
            className={INPUT}
            placeholder="The single next thing that has to happen"
            value={form.nextAction}
            onChange={e => set({ nextAction: e.target.value })}
            aria-label="Next action"
          />
          <input
            type="date"
            className={`${INPUT} sm:w-44 tabular-nums`}
            value={form.nextActionDueAt}
            onChange={e => set({ nextActionDueAt: e.target.value })}
            aria-label="Next action due date"
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="ops-blocked">Blocked because</label>
        <input
          id="ops-blocked"
          className={INPUT}
          placeholder="Leave empty when delivery can proceed"
          value={form.blockedReason}
          onChange={e => set({ blockedReason: e.target.value })}
        />
        {form.blockedReason.trim() && (
          <p className="text-xs text-red-700 mt-1.5">
            This project shows as blocked on the board and in the list.
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL} htmlFor="ops-drawer-stage">Stage</label>
          <select id="ops-drawer-stage" className={INPUT} value={form.stage} onChange={e => set({ stage: e.target.value })}>
            {PROJECT_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ops-drawer-owner">Owner</label>
          <select id="ops-drawer-owner" className={INPUT} value={form.ownerStaffId} onChange={e => set({ ownerStaffId: e.target.value })}>
            <option value="">Unassigned</option>
            {assignees.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ops-drawer-type">Project type</label>
          <select id="ops-drawer-type" className={INPUT} value={form.projectType} onChange={e => set({ projectType: e.target.value })}>
            <option value="">—</option>
            {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ops-drawer-priority">Priority</label>
          <select id="ops-drawer-priority" className={INPUT} value={form.priority} onChange={e => set({ priority: e.target.value })}>
            <option value="">—</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ops-drawer-start">Start date</label>
          <input
            id="ops-drawer-start"
            type="date"
            className={`${INPUT} tabular-nums`}
            value={form.startDate}
            onChange={e => set({ startDate: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="ops-drawer-launch">Target launch</label>
          <input
            id="ops-drawer-launch"
            type="date"
            className={`${INPUT} tabular-nums`}
            value={form.targetLaunchDate}
            onChange={e => set({ targetLaunchDate: e.target.value })}
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="ops-drawer-notes">Notes</label>
        <textarea
          id="ops-drawer-notes"
          rows={3}
          className={`${INPUT} resize-y`}
          value={form.notes}
          onChange={e => set({ notes: e.target.value })}
        />
      </div>

      {saveError && <InlineError message={saveError} />}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-1.5" onClick={() => void save()} disabled={saving}>
          <Check className="w-3.5 h-3.5" /> {saving ? "Saving…" : "Save changes"}
        </Button>
        {saved && !saving && <span className="text-xs text-emerald-700 font-medium">Saved</span>}
        <Button
          variant="outline"
          className="gap-1.5 ml-auto"
          onClick={() => void toggleArchive()}
          disabled={archiving}
        >
          {project.archivedAt
            ? <><ArchiveRestore className="w-3.5 h-3.5" /> {archiving ? "Restoring…" : "Restore project"}</>
            : <><Archive className="w-3.5 h-3.5" /> {archiving ? "Archiving…" : "Archive project"}</>}
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 pt-4 border-t border-border/60 text-sm">
        <div>
          <dt className={LABEL}>Client</dt>
          <dd className="text-foreground">
            {lead ? (lead.company ? `${lead.name} · ${lead.company}` : lead.name) : "—"}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>Collaborators</dt>
          <dd className="text-foreground">{collaborators.length ? collaborators.join(", ") : "—"}</dd>
        </div>
        <div>
          <dt className={LABEL}>Tasks</dt>
          <dd className="text-foreground tabular-nums">{project.openTasks}/{project.totalTasks} open</dd>
        </div>
        <div>
          <dt className={LABEL}>Milestones</dt>
          <dd className="text-foreground tabular-nums">{project.doneMilestones}/{project.totalMilestones} done</dd>
        </div>
        <div>
          <dt className={LABEL}>Progress</dt>
          <dd className="text-foreground tabular-nums">
            {project.progressPercent == null ? "—" : `${project.progressPercent}%`}
          </dd>
        </div>
        <div>
          <dt className={LABEL}>Next action due</dt>
          <dd className="text-foreground tabular-nums">{fmtDay(project.nextActionDueAt)}</dd>
        </div>
      </dl>
    </div>
  );
}

// ── Milestones tab ──────────────────────────────────────────────────────────

function MilestonesTab({ projectId, milestones, afterWrite }: {
  projectId: number; milestones: OpsMilestone[]; afterWrite: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dependsOn, setDependsOn] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const titleById = useMemo(() => new Map(milestones.map(m => [m.id, m.title])), [milestones]);

  const patchMilestone = async (id: number, body: Record<string, unknown>) => {
    setBusyId(id);
    setRowError(null);
    const res = await adminFetch(`/api/crm/operations/milestones/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // 409 is the dependency rule: the blocking milestone's name comes back in
      // the message, so it is shown against the row the person just touched.
      setRowError({ id, message: await errorFrom(res, "That change was refused.") });
      setBusyId(null);
      return false;
    }
    await afterWrite();
    setBusyId(null);
    return true;
  };

  const move = async (index: number, direction: -1 | 1) => {
    const current = milestones[index];
    const neighbour = milestones[index + direction];
    if (!current || !neighbour) return;
    setBusyId(current.id);
    setRowError(null);
    const a = await adminFetch(`/api/crm/operations/milestones/${current.id}`, {
      method: "PATCH",
      body: JSON.stringify({ orderIndex: neighbour.orderIndex }),
    });
    const b = await adminFetch(`/api/crm/operations/milestones/${neighbour.id}`, {
      method: "PATCH",
      body: JSON.stringify({ orderIndex: current.orderIndex }),
    });
    if (!a.ok || !b.ok) {
      setRowError({ id: current.id, message: "Couldn't reorder these milestones." });
    }
    await afterWrite();
    setBusyId(null);
  };

  const add = async () => {
    if (title.trim().length < 2) { setAddError("Give the milestone a title."); return; }
    setAdding(true);
    setAddError("");
    const res = await adminFetch(`/api/crm/operations/projects/${projectId}/milestones`, {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        dueDate: dueDate || null,
        dependsOnMilestoneId: dependsOn ? Number(dependsOn) : null,
      }),
    });
    setAdding(false);
    if (!res.ok) { setAddError(await errorFrom(res, "Couldn't add that milestone.")); return; }
    setTitle(""); setDescription(""); setDueDate(""); setDependsOn("");
    await afterWrite();
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading icon={MilestoneIcon}>
          Milestones
          <span className="ml-1 text-muted-foreground/70 tabular-nums">
            ({milestones.filter(m => m.status === "done").length}/{milestones.length} done)
          </span>
        </SectionHeading>

        {milestones.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
            No milestones yet. Add the first one below.
          </p>
        ) : (
          <ol className="space-y-2">
            {milestones.map((m, i) => (
              <li key={m.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-bold text-muted-foreground tabular-nums w-5 pt-1.5 shrink-0">
                    {i + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="text-sm font-medium text-foreground flex-1 min-w-0">{m.title}</p>
                      <Pill className={MILESTONE_PILL[m.status]}>{MILESTONE_LABEL[m.status]}</Pill>
                    </div>
                    {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                    {m.dependsOnMilestoneId && (
                      <p className="text-xs text-amber-700 mt-1">
                        Waits for “{titleById.get(m.dependsOnMilestoneId) ?? `milestone #${m.dependsOnMilestoneId}`}”.
                      </p>
                    )}
                    {m.blockedReason && (
                      <p className="text-xs text-red-700 mt-1">Blocked: {m.blockedReason}</p>
                    )}
                    {m.completedAt && (
                      <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                        Completed {fmtMoment(m.completedAt)}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <select
                        className={INPUT_COMPACT}
                        value={m.status}
                        disabled={busyId === m.id}
                        aria-label={`Status for ${m.title}`}
                        onChange={e => { void patchMilestone(m.id, { status: e.target.value }); }}
                      >
                        {MILESTONE_STATUSES.map(s => (
                          <option key={s} value={s}>{MILESTONE_LABEL[s]}</option>
                        ))}
                      </select>
                      <input
                        type="date"
                        className={`${INPUT_COMPACT} tabular-nums`}
                        value={isoDay(m.dueDate)}
                        disabled={busyId === m.id}
                        aria-label={`Due date for ${m.title}`}
                        onChange={e => { void patchMilestone(m.id, { dueDate: e.target.value || null }); }}
                      />
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Move ${m.title} up`}
                          disabled={i === 0 || busyId === m.id}
                          onClick={() => { void move(i, -1); }}
                          className="p-1 rounded border border-input text-muted-foreground hover:bg-accent disabled:opacity-40"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${m.title} down`}
                          disabled={i === milestones.length - 1 || busyId === m.id}
                          onClick={() => { void move(i, 1); }}
                          className="p-1 rounded border border-input text-muted-foreground hover:bg-accent disabled:opacity-40"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {rowError?.id === m.id && <InlineError message={rowError.message} />}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-xl border border-border p-3.5 bg-muted/40">
        <SectionHeading icon={Plus}>Add a milestone</SectionHeading>
        <div className="space-y-2">
          <input
            className={INPUT}
            placeholder="Milestone title"
            value={title}
            onChange={e => { setTitle(e.target.value); setAddError(""); }}
            aria-label="New milestone title"
          />
          <textarea
            rows={2}
            className={`${INPUT} resize-y`}
            placeholder="What does done look like? (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            aria-label="New milestone description"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={LABEL} htmlFor="ops-ms-due">Due date</label>
              <input
                id="ops-ms-due"
                type="date"
                className={`${INPUT} tabular-nums`}
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="ops-ms-dep">Depends on</label>
              <select id="ops-ms-dep" className={INPUT} value={dependsOn} onChange={e => setDependsOn(e.target.value)}>
                <option value="">Nothing</option>
                {milestones.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
          </div>
          {addError && <InlineError message={addError} />}
          <Button size="sm" className="gap-1.5" onClick={() => void add()} disabled={adding}>
            <Plus className="w-3.5 h-3.5" /> {adding ? "Adding…" : "Add milestone"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Tasks tab ───────────────────────────────────────────────────────────────

function TasksTab({ projectId, tasks, assignees, nameOf, afterWrite }: {
  projectId: number;
  tasks: OpsTask[];
  assignees: Assignee[];
  nameOf: (id: number | null) => string;
  afterWrite: () => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  const [title, setTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [priority, setPriority] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const done = tasks.filter(t => t.status === "completed").length;

  const toggle = async (task: OpsTask) => {
    setBusyId(task.id);
    setRowError(null);
    const res = await adminFetch(`/api/crm/operations/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: task.status === "completed" ? "pending" : "completed" }),
    });
    if (!res.ok) {
      setRowError({ id: task.id, message: await errorFrom(res, "That change was refused.") });
      setBusyId(null);
      return;
    }
    await afterWrite();
    setBusyId(null);
  };

  const reassign = async (task: OpsTask, value: string) => {
    setBusyId(task.id);
    setRowError(null);
    const res = await adminFetch(`/api/crm/operations/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ assignedToStaffId: value ? Number(value) : null }),
    });
    if (!res.ok) {
      setRowError({ id: task.id, message: await errorFrom(res, "That reassignment was refused.") });
      setBusyId(null);
      return;
    }
    await afterWrite();
    setBusyId(null);
  };

  const add = async () => {
    if (title.trim().length < 2) { setAddError("Give the task a title."); return; }
    setAdding(true);
    setAddError("");
    const res = await adminFetch("/api/crm/operations/tasks", {
      method: "POST",
      body: JSON.stringify({
        title: title.trim(),
        projectId,
        assignedToStaffId: assignedTo ? Number(assignedTo) : null,
        dueDate: dueDate || null,
        // This composer only ever collected a day, so it says so rather than
        // letting the server infer it. Project work is owed by a date; a task
        // that needs a moment is set from My Day, which offers both.
        dueKind: "date",
        remindAt: localInputToIso(remindAt),
        priority: priority || null,
      }),
    });
    setAdding(false);
    if (!res.ok) { setAddError(await errorFrom(res, "Couldn't add that task.")); return; }
    setTitle(""); setAssignedTo(""); setDueDate(""); setRemindAt(""); setPriority("");
    await afterWrite();
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading icon={ClipboardList}>
          Tasks <span className="ml-1 text-muted-foreground/70 tabular-nums">({done}/{tasks.length} done)</span>
        </SectionHeading>

        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
            No tasks on this project yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {tasks.map(t => {
              const complete = t.status === "completed";
              return (
                <li key={t.id} className="rounded-xl border border-border p-3">
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => void toggle(t)}
                      disabled={busyId === t.id}
                      aria-label={complete ? `Reopen ${t.title}` : `Complete ${t.title}`}
                      className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        complete ? "bg-emerald-500 border-emerald-500 text-white" : "border-input hover:border-emerald-400"
                      }`}
                    >
                      {complete && <Check className="w-3 h-3" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className={`text-sm flex-1 min-w-0 ${complete ? "line-through text-muted-foreground" : "text-foreground"}`}>
                          {t.title}
                        </p>
                        {t.priority && (
                          <Pill className={PRIORITY_PILL[t.priority] ?? "bg-muted text-muted-foreground"}>{t.priority}</Pill>
                        )}
                      </div>
                      {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <select
                          className={INPUT_COMPACT}
                          value={t.assignedToStaffId == null ? "" : String(t.assignedToStaffId)}
                          disabled={busyId === t.id}
                          aria-label={`Assignee for ${t.title}`}
                          onChange={e => { void reassign(t, e.target.value); }}
                        >
                          <option value="">Unassigned</option>
                          {assignees.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
                        </select>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {/* Only a task somebody set as a moment shows one.
                              Printing 12:00 AM against a task due "Friday"
                              would put a decision in their mouth. */}
                          Due {t.dueKind === "time" ? fmtMoment(t.dueDate) : fmtDay(t.dueDate)}
                        </span>
                        <span className="text-xs text-muted-foreground/70 truncate">
                          {nameOf(t.assignedToStaffId)}
                        </span>
                      </div>
                      {rowError?.id === t.id && <InlineError message={rowError.message} />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-border p-3.5 bg-muted/40">
        <SectionHeading icon={Plus}>Add a task</SectionHeading>
        <div className="space-y-2">
          <input
            className={INPUT}
            placeholder="What needs doing?"
            value={title}
            onChange={e => { setTitle(e.target.value); setAddError(""); }}
            aria-label="New task title"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className={LABEL} htmlFor="ops-task-assignee">Assignee</label>
              <select id="ops-task-assignee" className={INPUT} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Me / unassigned</option>
                {assignees.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="ops-task-priority">Priority</label>
              <select id="ops-task-priority" className={INPUT} value={priority} onChange={e => setPriority(e.target.value)}>
                <option value="">—</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL} htmlFor="ops-task-due">Due date</label>
              <input
                id="ops-task-due"
                type="date"
                className={`${INPUT} tabular-nums`}
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
            <div>
              <label className={LABEL} htmlFor="ops-task-remind">Remind at (optional)</label>
              <input
                id="ops-task-remind"
                type="datetime-local"
                className={`${INPUT} tabular-nums`}
                value={remindAt}
                onChange={e => setRemindAt(e.target.value)}
              />
            </div>
          </div>
          {addError && <InlineError message={addError} />}
          <Button size="sm" className="gap-1.5" onClick={() => void add()} disabled={adding}>
            <Plus className="w-3.5 h-3.5" /> {adding ? "Adding…" : "Add task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Updates tab ─────────────────────────────────────────────────────────────

function UpdatesTab({ projectId, updates, afterWrite }: {
  projectId: number; updates: OpsUpdate[]; afterWrite: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const post = async () => {
    if (body.trim().length < 2) { setPostError("Write what happened."); return; }
    setPosting(true);
    setPostError("");
    const res = await adminFetch(`/api/crm/operations/projects/${projectId}/updates`, {
      method: "POST",
      body: JSON.stringify({ body: body.trim() }),
    });
    setPosting(false);
    if (!res.ok) { setPostError(await errorFrom(res, "Couldn't post that update.")); return; }
    setBody("");
    await afterWrite();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border p-3.5 bg-muted/40">
        <SectionHeading icon={RefreshCw}>Post an update</SectionHeading>
        <textarea
          rows={3}
          className={`${INPUT} resize-y`}
          placeholder="What moved today, and what it means for the launch date…"
          value={body}
          onChange={e => { setBody(e.target.value); setPostError(""); }}
          aria-label="New update"
        />
        {postError && <InlineError message={postError} />}
        <Button size="sm" className="mt-2 gap-1.5" onClick={() => void post()} disabled={posting}>
          <Check className="w-3.5 h-3.5" /> {posting ? "Posting…" : "Post update"}
        </Button>
      </div>

      <div>
        <SectionHeading icon={FileText}>
          Work log <span className="ml-1 text-muted-foreground/70 tabular-nums">({updates.length})</span>
        </SectionHeading>
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
            Nothing logged yet. The newest update always appears at the top.
          </p>
        ) : (
          <ol className="space-y-3">
            {updates.map(u => (
              <li key={u.id} className="border-l-2 border-teal-300 pl-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{u.authorLabel}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{fmtMoment(u.createdAt)}</span>
                  {u.stageAtUpdate && (
                    <Pill className={`${stageStyle(u.stageAtUpdate).bg} ${stageStyle(u.stageAtUpdate).text}`}>
                      {u.stageAtUpdate}
                    </Pill>
                  )}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{u.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Comments tab ────────────────────────────────────────────────────────────

function CommentsTab({ projectId, comments, afterWrite }: {
  projectId: number; comments: OpsComment[]; afterWrite: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  // Internal is the default on the server too — staff discussion must never
  // become customer-visible by accident.
  const [isInternal, setIsInternal] = useState(true);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");

  const post = async () => {
    if (!body.trim()) { setPostError("Write a comment."); return; }
    setPosting(true);
    setPostError("");
    const res = await adminFetch("/api/crm/operations/comments", {
      method: "POST",
      body: JSON.stringify({
        entityType: "project",
        entityId: projectId,
        body: body.trim(),
        isInternal,
      }),
    });
    setPosting(false);
    if (!res.ok) { setPostError(await errorFrom(res, "Couldn't post that comment.")); return; }
    setBody("");
    await afterWrite();
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading icon={MessageSquare}>
          Thread <span className="ml-1 text-muted-foreground/70 tabular-nums">({comments.length})</span>
        </SectionHeading>
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
            No comments yet.
          </p>
        ) : (
          <ol className="space-y-2">
            {comments.map(c => (
              <li
                key={c.id}
                className={`rounded-r-xl border-l-4 px-3 py-2.5 ${
                  c.isInternal
                    ? "border-amber-400 bg-amber-50"
                    : "border-teal-500 bg-teal-50"
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground">{c.authorLabel}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{fmtMoment(c.createdAt)}</span>
                  <Pill className={c.isInternal ? "bg-amber-200 text-amber-900" : "bg-teal-200 text-teal-900"}>
                    {c.isInternal ? "Internal only" : "Customer-visible"}
                  </Pill>
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap mt-1">{c.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-xl border border-border p-3.5 bg-muted/40">
        <SectionHeading icon={Plus}>Add a comment</SectionHeading>
        <textarea
          rows={3}
          className={`${INPUT} resize-y`}
          placeholder="Write a comment…"
          value={body}
          onChange={e => { setBody(e.target.value); setPostError(""); }}
          aria-label="New comment"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-input overflow-hidden" role="group" aria-label="Comment visibility">
            <button
              type="button"
              aria-pressed={isInternal}
              onClick={() => setIsInternal(true)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                isInternal ? "bg-amber-100 text-amber-900" : "bg-white text-muted-foreground hover:bg-accent"
              }`}
            >
              Internal only
            </button>
            <button
              type="button"
              aria-pressed={!isInternal}
              onClick={() => setIsInternal(false)}
              className={`px-3 py-1.5 text-xs font-semibold border-l border-input transition-colors ${
                !isInternal ? "bg-teal-100 text-teal-900" : "bg-white text-muted-foreground hover:bg-accent"
              }`}
            >
              Customer-visible
            </button>
          </div>
          <Button size="sm" className="gap-1.5" onClick={() => void post()} disabled={posting}>
            <Check className="w-3.5 h-3.5" /> {posting ? "Posting…" : "Post comment"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          {isInternal
            ? "Only staff can ever see this comment."
            : "This comment may be shown to the client in the customer portal."}
        </p>
        {postError && <InlineError message={postError} />}
      </div>
    </div>
  );
}

// ── Approvals tab ───────────────────────────────────────────────────────────

function ApprovalsTab({ projectId, approvals, assignees, nameOf, afterWrite }: {
  projectId: number;
  approvals: OpsApproval[];
  assignees: Assignee[];
  nameOf: (id: number | null) => string;
  afterWrite: () => Promise<void>;
}) {
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);

  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [approver, setApprover] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");

  const pending = approvals.filter(a => a.status === "pending");
  const decided = approvals.filter(a => a.status !== "pending");

  const decide = async (id: number, decision: "approved" | "rejected") => {
    setBusyId(id);
    setRowError(null);
    const res = await adminFetch(`/api/crm/operations/approvals/${id}/decide`, {
      method: "POST",
      body: JSON.stringify({ decision, note: notes[id]?.trim() || null }),
    });
    if (!res.ok) {
      setRowError({ id, message: await errorFrom(res, "That decision was refused.") });
      setBusyId(null);
      return;
    }
    setNotes(n => ({ ...n, [id]: "" }));
    await afterWrite();
    setBusyId(null);
  };

  const request = async () => {
    if (title.trim().length < 2) { setRequestError("Say what needs approving."); return; }
    setRequesting(true);
    setRequestError("");
    const res = await adminFetch("/api/crm/operations/approvals", {
      method: "POST",
      body: JSON.stringify({
        entityType: "project",
        entityId: projectId,
        title: title.trim(),
        detail: detail.trim() || null,
        approverStaffId: approver ? Number(approver) : null,
      }),
    });
    setRequesting(false);
    if (!res.ok) { setRequestError(await errorFrom(res, "Couldn't request that approval.")); return; }
    setTitle(""); setDetail(""); setApprover("");
    await afterWrite();
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeading icon={ShieldCheck}>
          Waiting on a decision <span className="ml-1 text-muted-foreground/70 tabular-nums">({pending.length})</span>
        </SectionHeading>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded-xl">
            Nothing is waiting for approval.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map(a => (
              <li key={a.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground flex-1 min-w-0">{a.title}</p>
                  <Pill className={APPROVAL_PILL[a.status]}>Pending</Pill>
                </div>
                {a.detail && <p className="text-xs text-muted-foreground mt-1">{a.detail}</p>}
                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  Asked by {a.requestedByLabel} · {fmtMoment(a.createdAt)} ·{" "}
                  {a.approverStaffId ? `for ${nameOf(a.approverStaffId)}` : "any owner may decide"}
                </p>
                <input
                  className={`${INPUT} mt-2`}
                  placeholder="Note (optional)"
                  value={notes[a.id] ?? ""}
                  onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))}
                  aria-label={`Decision note for ${a.title}`}
                />
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    disabled={busyId === a.id}
                    onClick={() => void decide(a.id, "approved")}
                  >
                    <Check className="w-3.5 h-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-red-700"
                    disabled={busyId === a.id}
                    onClick={() => void decide(a.id, "rejected")}
                  >
                    <X className="w-3.5 h-3.5" /> Reject
                  </Button>
                </div>
                {rowError?.id === a.id && <InlineError message={rowError.message} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <SectionHeading icon={Check}>
            Decided <span className="ml-1 text-muted-foreground/70 tabular-nums">({decided.length})</span>
          </SectionHeading>
          <ul className="space-y-2">
            {decided.map(a => (
              <li key={a.id} className="rounded-xl border border-border p-3">
                <div className="flex items-start gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground flex-1 min-w-0">{a.title}</p>
                  <Pill className={APPROVAL_PILL[a.status]}>{a.status}</Pill>
                </div>
                {a.decisionNote && <p className="text-xs text-muted-foreground mt-1">“{a.decisionNote}”</p>}
                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  Asked by {a.requestedByLabel} · {fmtMoment(a.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border p-3.5 bg-muted/40">
        <SectionHeading icon={Plus}>Request an approval</SectionHeading>
        <div className="space-y-2">
          <input
            className={INPUT}
            placeholder="What needs a decision?"
            value={title}
            onChange={e => { setTitle(e.target.value); setRequestError(""); }}
            aria-label="Approval title"
          />
          <textarea
            rows={2}
            className={`${INPUT} resize-y`}
            placeholder="Context for whoever decides (optional)"
            value={detail}
            onChange={e => setDetail(e.target.value)}
            aria-label="Approval detail"
          />
          <div>
            <label className={LABEL} htmlFor="ops-approver">Approver</label>
            <select id="ops-approver" className={INPUT} value={approver} onChange={e => setApprover(e.target.value)}>
              <option value="">Anyone who can approve</option>
              {assignees.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
            </select>
          </div>
          {requestError && <InlineError message={requestError} />}
          <Button size="sm" className="gap-1.5" onClick={() => void request()} disabled={requesting}>
            <ShieldCheck className="w-3.5 h-3.5" /> {requesting ? "Requesting…" : "Request approval"}
          </Button>
        </div>
      </div>
    </div>
  );
}
