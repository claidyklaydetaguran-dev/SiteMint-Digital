import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ElementType, type ReactNode,
} from "react";
import { Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, AlertCircle, AlertTriangle, CalendarClock, CalendarDays, ChevronRight,
  ClipboardList, FileSignature, FileText, Globe, Inbox, Mail, MailOpen, PlayCircle,
  RefreshCw, TrendingUp, UserPlus, Wallet, X,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { responseFailureReason } from "@/lib/adminLoad";

// ── M4: the Command Center ───────────────────────────────────────────────────
//
// One screen that answers "what came in, what is owed, and what is the money
// actually doing". Everything here is read from `/api/crm/command-center`,
// which is the single place those numbers are derived — a button's count and
// the rows underneath it come from the SAME server function, so the two can
// never disagree.
//
// Two rules this page exists to keep visible:
//
//  1. A metric with no instrumentation says "Unavailable" and shows the reason.
//     It never shows a zero, because a fabricated zero reads exactly like
//     "nothing happened" and that is the lie that makes a dashboard useless.
//  2. Pipeline value, contracted value and money received are three different
//     things. They are labelled, toned and annotated differently so nobody can
//     read pipeline as revenue.
//
// Every figure carries the server's own definition in a tooltip, so a disputed
// number can be traced back to how it was derived.

// ── The live API contract ────────────────────────────────────────────────────

type Scope = "mine" | "team";

/** A panel row. Shapes differ per panel key, so access goes through helpers. */
type PanelRow = Record<string, unknown>;

interface Panel {
  key: string;
  label: string;
  available: boolean;
  /** Why it is unavailable. Shown verbatim — it is the operator's answer. */
  reason?: string;
  count: number | null;
  items: PanelRow[];
  definition: string;
}

interface SalesSummary {
  openDeals: { count: number; value: number };
  wonDeals: { count: number; value: number };
  lostDeals: { count: number };
  winRate: number | null;
  winRateDenominator: number;
  weightedForecast: number;
  moneyReceivedAllTime: number;
  moneyReceivedInPeriod: number;
  transactionCount: number;
  byStage: { stage: string; count: number; value: number }[];
  definitions: {
    openDeals: string;
    wonDeals: string;
    winRate: string;
    weightedForecast: string;
    moneyReceived: string;
  };
}

interface CommandCenterPayload {
  generatedAt: string;
  range: { days: number; since: string; label: string };
  scope: Scope;
  scopeDenied: boolean;
  timezone: string;
  signedInAs: { id: number; displayName: string } | null;
  panels: Panel[];
  sales: SalesSummary;
}

interface ActivityItem {
  id: number;
  leadId: number | null;
  leadName: string | null;
  type: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const POLL_MS = 60_000;
const STALE_MS = 3 * 60_000;
const TICK_MS = 30_000;

const RANGES = [7, 30, 90, 365] as const;

/** Display order of the activity buttons. */
const PANEL_ORDER = [
  "new_leads", "inquiries", "email_replies", "opened_emails", "return_visits",
  "tasks_due", "deadlines", "appointments", "documents_signed",
  "waiting_documents", "videos_watched",
] as const;

const PANEL_ICON: Record<string, ElementType> = {
  new_leads: UserPlus,
  inquiries: Inbox,
  email_replies: Mail,
  opened_emails: MailOpen,
  return_visits: Globe,
  tasks_due: ClipboardList,
  deadlines: CalendarClock,
  appointments: CalendarDays,
  documents_signed: FileSignature,
  waiting_documents: FileText,
  videos_watched: PlayCircle,
};

/** Nothing is due for a panel that is simply empty — say so in its own words. */
const PANEL_EMPTY: Record<string, string> = {
  new_leads: "No new leads arrived in this period.",
  inquiries: "Every discovery submission has been reviewed.",
  email_replies: "Nobody has replied in this period.",
  opened_emails: "No opens were recorded in this period.",
  tasks_due: "Nothing is due.",
  deadlines: "No launch dates or milestones fall inside the next 14 days.",
  waiting_documents: "No proposal or SOW is waiting for an answer.",
};

const TEAM_DENIED =
  "Seeing the whole team's work needs the team-read permission, which this sign-in does not have.";

/** Stage colours for the pipeline chart (mint/ocean family, not decoration). */
const STAGE_FILL: Record<string, string> = {
  Lead: "#8aa59c",
  Qualified: "#3e9978",
  Proposal: "#173f35",
};
const STAGE_FILL_FALLBACK = "#3e9978";
const CHART_GRID = "#dbe6de";
const CHART_TICK = "#5a7066";

const SELECT =
  "px-2.5 py-1.5 text-xs border border-input rounded-lg bg-white text-foreground " +
  "focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-50";

// ── Formatting ───────────────────────────────────────────────────────────────

/** Compact money for display: $980, $12.4K, $2.5M. Full value goes in `title`. */
function money(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, "");
  if (abs >= 1_000_000) return `${sign}$${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}$${trim(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

/** The exact figure, for the tooltip behind every compact number. */
function moneyFull(value: number): string {
  if (!Number.isFinite(value)) return "Not a number";
  return value.toLocaleString("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 2,
  });
}

function countText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US");
}

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/** "14:03:22" in the reader's own clock — this is a freshness indicator. */
function clockWithSeconds(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/**
 * Date-only columns ("2026-09-20") are rendered as that calendar day, never
 * shifted by the browser's offset; instants keep their time.
 */
function formatWhen(value: unknown): string {
  if (typeof value !== "string" || value === "") return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function relativeTime(iso: string, now: number): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const mins = Math.round((now - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return `${Math.round(days / 30)} mo ago`;
}

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const FIELD_LABEL: Record<string, string> = {
  id: "ID",
  leadId: "Lead ID",
  projectId: "Project ID",
  recipientId: "Recipient ID",
  sowStatus: "SOW",
  crmStatus: "CRM status",
  proposalStatus: "Proposal",
  owner: "Owner",
  assignedTo: "Owner as recorded",
  assignedToStaffId: "Assigned staff ID",
  createdAt: "Created",
  updatedAt: "Updated",
  occurredAt: "Occurred",
  lastContactedAt: "Last contacted",
  dueDate: "Due",
  due: "Due",
  body: "Message",
  fromNumber: "From number",
  contactName: "Contact",
  companyName: "Company",
  leadName: "Lead",
  kind: "Record type",
};

function labelFor(key: string): string {
  return FIELD_LABEL[key] ?? humanize(key);
}

function looksLikeDateField(key: string): boolean {
  return /(?:At|Date)$/.test(key) || key === "due";
}

// ── Reading a row without inventing anything ─────────────────────────────────

function text(row: PanelRow, key: string): string {
  const v = row[key];
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function numberOf(row: PanelRow, key: string): number | null {
  const v = row[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function isPrimitive(v: unknown): boolean {
  return v === null || v === undefined
    || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/** Deadlines mix project ids and milestone ids, so the key has to be composite. */
function rowKeyOf(row: PanelRow, index: number): string {
  const id = row["id"];
  const kind = row["kind"];
  if (typeof id === "number" || typeof id === "string") {
    return typeof kind === "string" ? `${kind}-${id}` : `id-${id}`;
  }
  return `row-${index}`;
}

function rowTitle(row: PanelRow): string {
  for (const candidate of ["name", "title", "contactName", "leadName", "companyName"]) {
    const value = text(row, candidate);
    if (value) return value;
  }
  const id = row["id"];
  return id === null || id === undefined ? "Record" : `Record #${String(id)}`;
}

/** One field, rendered honestly: empty is an em dash, never a zero or a guess. */
function fieldValue(key: string, value: unknown): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return <span className="tabular-nums">{plural(value.length, "item", "items")}</span>;
  if (typeof value === "object") {
    const json = JSON.stringify(value);
    return <span className="break-all">{json.length > 120 ? `${json.slice(0, 120)}…` : json}</span>;
  }
  if (typeof value === "number") return <span className="tabular-nums">{value.toLocaleString("en-US")}</span>;
  if (looksLikeDateField(key)) return <span className="tabular-nums">{formatWhen(value)}</span>;
  return String(value);
}

// ── Panel presentation ───────────────────────────────────────────────────────

interface PanelColumn {
  header: string;
  cell: (row: PanelRow) => ReactNode;
  /** Right-aligns and applies tabular figures. */
  numeric?: boolean;
}

function Stack({ main, sub }: { main: string; sub?: string }) {
  return (
    <span className="block min-w-0">
      <span className="block font-medium text-foreground break-words">{main || "—"}</span>
      {sub ? <span className="block text-xs text-muted-foreground break-words">{sub}</span> : null}
    </span>
  );
}

function Chip({ tone, children }: { tone: "good" | "warn" | "info" | "plain"; children: ReactNode }) {
  const cls =
    tone === "good" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : tone === "warn" ? "bg-amber-50 text-amber-700 border-amber-200"
    : tone === "info" ? "bg-sky-50 text-sky-700 border-sky-200"
    : "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>
      {children}
    </span>
  );
}

function When({ value }: { value: unknown }) {
  return <span className="tabular-nums text-muted-foreground">{formatWhen(value)}</span>;
}

function truncate(value: string, max: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * A meaningful column set per panel. Keys the server has not shipped a shape
 * for fall through to `genericColumns`, which reads whatever the row actually
 * has rather than pretending to know.
 */
const PANEL_COLUMNS: Record<string, PanelColumn[]> = {
  new_leads: [
    { header: "Lead", cell: (r) => <Stack main={text(r, "name")} sub={text(r, "company") || text(r, "email")} /> },
    { header: "Source", cell: (r) => text(r, "source") || "—" },
    {
      header: "Status",
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-1">
          <span>{text(r, "status") || "—"}</span>
          {r["responded"] === true
            ? <Chip tone="good">Contacted</Chip>
            : <Chip tone="warn">No reply yet</Chip>}
        </span>
      ),
    },
    { header: "Created", cell: (r) => <When value={r["createdAt"]} /> },
  ],
  inquiries: [
    { header: "Contact", cell: (r) => <Stack main={text(r, "contactName")} sub={text(r, "companyName")} /> },
    { header: "Received", cell: (r) => <When value={r["createdAt"]} /> },
    {
      header: "Lead record",
      cell: (r) => {
        const leadId = numberOf(r, "leadId");
        return leadId == null
          ? <Chip tone="warn">Not linked</Chip>
          : <span className="tabular-nums">Lead #{leadId}</span>;
      },
    },
  ],
  email_replies: [
    { header: "From", cell: (r) => <Stack main={text(r, "leadName") || "Unknown contact"} sub={text(r, "fromNumber")} /> },
    { header: "Channel", cell: (r) => <Chip tone="info">{text(r, "channel") || "—"}</Chip> },
    { header: "Message", cell: (r) => truncate(text(r, "body"), 90) || "—" },
    { header: "Received", cell: (r) => <When value={r["createdAt"]} /> },
  ],
  opened_emails: [
    { header: "Contact", cell: (r) => <Stack main={text(r, "leadName") || "Unknown contact"} /> },
    { header: "Opened", cell: (r) => <When value={r["createdAt"]} /> },
  ],
  tasks_due: [
    { header: "Task", cell: (r) => <Stack main={text(r, "title")} sub={truncate(text(r, "description"), 70)} /> },
    { header: "Due", cell: (r) => <When value={r["dueDate"]} /> },
    {
      header: "Priority",
      cell: (r) => {
        const p = text(r, "priority");
        if (!p) return "—";
        return <Chip tone={p === "High" ? "warn" : p === "Low" ? "plain" : "info"}>{p}</Chip>;
      },
    },
    { header: "Status", cell: (r) => text(r, "status") || "—" },
  ],
  deadlines: [
    { header: "What", cell: (r) => <Stack main={text(r, "title")} /> },
    {
      header: "Type",
      cell: (r) => <Chip tone="plain">{text(r, "kind") === "milestone" ? "Milestone" : "Project"}</Chip>,
    },
    { header: "Due", cell: (r) => <When value={r["due"]} /> },
    { header: "Stage", cell: (r) => text(r, "stage") || "—" },
  ],
  waiting_documents: [
    { header: "Lead", cell: (r) => <Stack main={text(r, "name")} sub={text(r, "company")} /> },
    {
      header: "Proposal",
      cell: (r) => {
        const s = text(r, "proposalStatus");
        return s ? <Chip tone={s === "Sent" ? "warn" : "plain"}>{s}</Chip> : "—";
      },
    },
    {
      header: "SOW",
      cell: (r) => {
        const s = text(r, "sowStatus");
        return s ? <Chip tone={s === "Sent" ? "warn" : "plain"}>{s}</Chip> : "—";
      },
    },
    { header: "Last change", cell: (r) => <When value={r["updatedAt"]} /> },
  ],
};

function genericColumns(rows: PanelRow[]): PanelColumn[] {
  const first = rows[0];
  if (!first) return [{ header: "Record", cell: (r) => rowTitle(r) }];
  const keys = Object.keys(first).filter((k) => k !== "id" && isPrimitive(first[k])).slice(0, 4);
  if (keys.length === 0) return [{ header: "Record", cell: (r) => rowTitle(r) }];
  return keys.map((k) => ({
    header: labelFor(k),
    cell: (row: PanelRow) => fieldValue(k, row[k]),
    numeric: typeof first[k] === "number",
  }));
}

function columnsFor(key: string, rows: PanelRow[]): PanelColumn[] {
  return PANEL_COLUMNS[key] ?? genericColumns(rows);
}

/** The record a row belongs to, for the detail panel's primary link. */
function panelLink(key: string, row: PanelRow): { href: string; label: string } | null {
  switch (key) {
    case "new_leads":
    case "waiting_documents": {
      const id = numberOf(row, "id");
      return id == null ? null : { href: `/admin/crm/leads/${id}`, label: "Open this lead" };
    }
    case "opened_emails":
    case "email_replies": {
      const leadId = numberOf(row, "leadId");
      if (key === "email_replies") return { href: "/admin/crm/inbox", label: "Open the inbox" };
      return leadId == null ? null : { href: `/admin/crm/leads/${leadId}`, label: "Open this lead" };
    }
    case "inquiries":
      return { href: "/admin/crm/discovery", label: "Open the discovery inbox" };
    case "tasks_due":
      return { href: "/admin/crm/my-day", label: "Open My Day" };
    case "deadlines":
      return { href: "/admin/crm/operations", label: "Open delivery operations" };
    default:
      return null;
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CrmExecutiveDashboard() {
  const [data, setData] = useState<CommandCenterPayload | null>(null);
  // null means the feed never arrived. An empty array is the server saying
  // "nothing has been logged"; the two must not render alike.
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [activityError, setActivityError] = useState("");
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const [days, setDays] = useState<number>(30);
  const [scope, setScope] = useState<Scope>("mine");
  const [teamDenied, setTeamDenied] = useState("");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [detailRow, setDetailRow] = useState<PanelRow | null>(null);

  const [now, setNow] = useState(() => Date.now());

  // One dashboard read at a time. A request that arrives while another is in
  // flight is remembered, not dropped — otherwise changing the range during a
  // poll would leave the screen showing the previous range's numbers.
  const inFlight = useRef(false);
  const queued = useRef(false);
  const refreshRef = useRef<() => void>(() => {});

  const loadDashboard = useCallback(async (): Promise<void> => {
    if (inFlight.current) { queued.current = true; return; }
    inFlight.current = true;
    setRefreshing(true);
    try {
      const [dashRes, actRes] = await Promise.all([
        adminFetch(`/api/crm/command-center?days=${days}&scope=${scope}&limit=25`),
        adminFetch("/api/crm/command-center/activity?limit=15"),
      ]);

      if (!dashRes.ok) {
        const body = await dashRes.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? `The command center could not be loaded (${dashRes.status}).`);
        return;
      }

      const payload = await dashRes.json() as CommandCenterPayload;
      setData(payload);
      setError("");
      setNow(Date.now());

      // The server silently falls back to "mine" rather than refusing, so the
      // toggle has to follow what actually came back.
      if (payload.scopeDenied) {
        setTeamDenied(TEAM_DENIED);
        setScope("mine");
      }

      if (actRes.ok) {
        const body = await actRes.json().catch(() => undefined) as { activity?: unknown } | undefined;
        const list = body?.activity;
        if (Array.isArray(list)) {
          setActivity(list as ActivityItem[]);
          setActivityError("");
        } else {
          // An answer we could not read is not an empty feed.
          setActivity(null);
          setActivityError("The server's answer was not in the expected shape.");
        }
      } else {
        setActivity(null);
        setActivityError(await responseFailureReason(actRes));
      }
    } catch {
      setError("Couldn't reach the server. The figures below may be out of date.");
    } finally {
      inFlight.current = false;
      setRefreshing(false);
      if (queued.current) {
        queued.current = false;
        refreshRef.current();
      }
    }
  }, [days, scope]);

  // A superseded panel response must never overwrite a newer selection, so the
  // panel read is sequenced rather than blocked — clicking B while A is in the
  // air has to land on B.
  const panelSeq = useRef(0);

  const loadPanel = useCallback(async (key: string): Promise<void> => {
    const mine = ++panelSeq.current;
    setPanelLoading(true);
    setPanelError("");
    try {
      const res = await adminFetch(
        `/api/crm/command-center/panel/${encodeURIComponent(key)}?days=${days}&scope=${scope}&limit=50`,
      );
      if (mine !== panelSeq.current) return;
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setPanelError(body.error ?? `That list could not be loaded (${res.status}).`);
        return;
      }
      const body = await res.json() as { panel?: Panel };
      if (mine !== panelSeq.current) return;
      if (body.panel) setPanel(body.panel);
      else setPanelError("The server returned no list for that button.");
    } catch {
      if (mine === panelSeq.current) {
        setPanelError("Couldn't load that list. Check your connection and try again.");
      }
    } finally {
      if (mine === panelSeq.current) setPanelLoading(false);
    }
  }, [days, scope]);

  useEffect(() => {
    refreshRef.current = () => {
      void loadDashboard();
      if (selectedKey) void loadPanel(selectedKey);
    };
  }, [loadDashboard, loadPanel, selectedKey]);

  // Range or scope changed — read again with the new parameters.
  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  useEffect(() => {
    if (!selectedKey) {
      panelSeq.current++;
      setPanel(null);
      setPanelError("");
      setPanelLoading(false);
      return;
    }
    setPanel((prev) => (prev && prev.key === selectedKey ? prev : null));
    void loadPanel(selectedKey);
  }, [selectedKey, loadPanel]);

  // Polling. The interval is torn down while the tab is hidden — a backgrounded
  // dashboard should not keep hitting the API — and coming back reads once
  // immediately so the first thing on screen is current.
  useEffect(() => {
    let timer: number | null = null;
    const stop = () => {
      if (timer !== null) { window.clearInterval(timer); timer = null; }
    };
    const start = () => {
      stop();
      timer = window.setInterval(() => { refreshRef.current(); }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.hidden) { stop(); return; }
      refreshRef.current();
      start();
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);

  // Keeps "3 min ago" and the stale badge honest between reads.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const panels = useMemo(() => {
    const rank = (key: string) => {
      const i = PANEL_ORDER.indexOf(key as typeof PANEL_ORDER[number]);
      return i === -1 ? PANEL_ORDER.length : i;
    };
    return [...(data?.panels ?? [])].sort((a, b) => rank(a.key) - rank(b.key));
  }, [data]);

  const summaryPanel = useMemo(
    () => panels.find((p) => p.key === selectedKey) ?? null,
    [panels, selectedKey],
  );

  /**
   * The fuller list once it lands; until then the summary payload's own rows,
   * which came from the same query. Never another panel's rows.
   */
  const shownPanel: Panel | null =
    panel && panel.key === selectedKey ? panel : summaryPanel;

  const generatedMs = data ? Date.parse(data.generatedAt) : Number.NaN;
  const stale = Number.isFinite(generatedMs) && now - generatedMs > STALE_MS;
  const sales = data?.sales ?? null;

  const chartData = useMemo(
    () => (sales?.byStage ?? []).map((s) => ({ ...s })),
    [sales],
  );
  const chartHasValue = chartData.some((s) => s.value > 0);

  const clearPanel = useCallback(() => {
    setSelectedKey(null);
    setDetailRow(null);
  }, []);

  const choosePanel = useCallback((key: string) => {
    setDetailRow(null);
    setSelectedKey((prev) => (prev === key ? null : key));
  }, []);

  const initialLoading = !data && !error;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Command Center</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data?.signedInAs
                ? <span className="font-medium text-foreground">{data.signedInAs.displayName}</span>
                : <span>Shared admin sign-in</span>}
              {data ? (
                <>
                  <span className="mx-1.5 text-muted-foreground/60">·</span>
                  <span>{data.range.label}</span>
                  <span className="mx-1.5 text-muted-foreground/60">·</span>
                  <span>{data.scope === "team" ? "whole team" : "your work"}</span>
                  <span className="mx-1.5 text-muted-foreground/60">·</span>
                  <span>days counted in {data.timezone}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Date range"
              className={SELECT}
              value={String(days)}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {RANGES.map((r) => (
                <option key={r} value={String(r)}>Last {r} days</option>
              ))}
            </select>

            <div className="flex bg-muted p-0.5 rounded-lg" role="group" aria-label="Scope">
              <button
                type="button"
                onClick={() => setScope("mine")}
                aria-pressed={scope === "mine"}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  scope === "mine" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Mine
              </button>
              <button
                type="button"
                onClick={() => { setTeamDenied(""); setScope("team"); }}
                disabled={!!teamDenied}
                aria-pressed={scope === "team"}
                title={teamDenied || "Everyone's work"}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                  scope === "team" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Team
              </button>
            </div>

            {stale && (
              <span
                title="This page has not managed a successful read for more than three minutes."
                className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200"
              >
                <AlertTriangle className="w-3 h-3" /> Stale
              </span>
            )}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={refreshing}
              onClick={() => refreshRef.current()}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              <span className="tabular-nums">
                {data ? `Updated ${clockWithSeconds(data.generatedAt)}` : "Refresh"}
              </span>
            </Button>
          </div>
        </div>

        {teamDenied && (
          <Banner tone="warn">
            {teamDenied} The server answered with your own work instead, and that is what is shown.
          </Banner>
        )}

        {/* A failed read never blanks a page that already has real figures. */}
        {error && data && (
          <Banner tone="error" onRetry={() => refreshRef.current()}>
            {error} Showing the last successful read from {clockWithSeconds(data.generatedAt)}.
          </Banner>
        )}

        {error && !data ? (
          <div className="rounded-xl border border-border bg-white py-14 px-6 text-center">
            <AlertTriangle className="w-9 h-9 text-red-500/70 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">{error}</p>
            <Button size="sm" variant="outline" className="mt-4 gap-1.5" onClick={() => refreshRef.current()}>
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </Button>
          </div>
        ) : initialLoading ? (
          <DashboardSkeleton />
        ) : (
          <>
            {/* ── Sales summary ─────────────────────────────────────────────── */}
            {sales && data && (
              <section className="space-y-3">
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Money
                </h2>

                <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
                  <Tile
                    icon={TrendingUp}
                    tone="pipeline"
                    label="Open pipeline"
                    value={money(sales.openDeals.value)}
                    valueTitle={moneyFull(sales.openDeals.value)}
                    detail={plural(sales.openDeals.count, "open deal", "open deals")}
                    note="Pipeline value — not revenue"
                    definition={sales.definitions.openDeals}
                  />
                  <Tile
                    icon={FileSignature}
                    tone="contracted"
                    label="Contracted / won"
                    value={money(sales.wonDeals.value)}
                    valueTitle={moneyFull(sales.wonDeals.value)}
                    detail={`${countText(sales.wonDeals.count)} won · ${countText(sales.lostDeals.count)} lost`}
                    note="Signed value — not cash in the bank"
                    definition={sales.definitions.wonDeals}
                  />
                  <Tile
                    icon={Wallet}
                    tone="cash"
                    label="Money received"
                    value={money(sales.moneyReceivedInPeriod)}
                    valueTitle={moneyFull(sales.moneyReceivedInPeriod)}
                    detail={`in the ${data.range.label}`}
                    note={`${money(sales.moneyReceivedAllTime)} all time · ${plural(sales.transactionCount, "transaction", "transactions")}`}
                    noteTitle={`All time: ${moneyFull(sales.moneyReceivedAllTime)}`}
                    definition={sales.definitions.moneyReceived}
                  />
                  <Tile
                    icon={Activity}
                    tone="rate"
                    label="Win rate"
                    value={sales.winRate === null ? "—" : `${sales.winRate}%`}
                    valueTitle={sales.winRate === null
                      ? "No deal has been won or lost yet, so there is no rate to state."
                      : `${sales.winRate}% of ${sales.winRateDenominator} decided deals`}
                    detail={sales.winRate === null
                      ? "no decided deals yet"
                      : plural(sales.winRateDenominator, "decided deal", "decided deals")}
                    definition={sales.definitions.winRate}
                  />
                  <Tile
                    icon={CalendarClock}
                    tone="forecast"
                    label="Weighted forecast"
                    value={money(sales.weightedForecast)}
                    valueTitle={moneyFull(sales.weightedForecast)}
                    detail="open pipeline, weighted by stage"
                    note="A stated assumption, not a prediction"
                    definition={sales.definitions.weightedForecast}
                  />
                </div>

                {/* Pipeline by stage */}
                <div className="bg-white rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">Open pipeline value by stage</h3>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {money(sales.openDeals.value)} across {plural(sales.openDeals.count, "deal", "deals")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {sales.definitions.openDeals}
                  </p>

                  <div className="h-56 mt-3">
                    {chartHasValue ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                          <XAxis dataKey="stage" tick={{ fontSize: 11, fill: CHART_TICK }} axisLine={false} tickLine={false} />
                          <YAxis
                            tick={{ fontSize: 11, fill: CHART_TICK }}
                            axisLine={false}
                            tickLine={false}
                            width={52}
                            tickFormatter={(v: number) => money(v)}
                          />
                          <Tooltip cursor={{ fill: "#f4f8f3" }} content={<StageTooltip />} />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                            {chartData.map((row) => (
                              <Cell key={row.stage} fill={STAGE_FILL[row.stage] ?? STAGE_FILL_FALLBACK} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center">
                        <TrendingUp className="w-7 h-7 text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">No open deal value to chart.</p>
                        <Link href="/admin/crm/deals" className="text-xs text-primary hover:underline mt-1">
                          Open the deals board
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* ── Activity buttons ─────────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                  Activity
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  A number and its list come from the same query. Anything uninstrumented says so.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                {panels.map((p) => (
                  <PanelButton
                    key={p.key}
                    panel={p}
                    selected={selectedKey === p.key}
                    onSelect={() => choosePanel(p.key)}
                  />
                ))}
              </div>

              {/* The list, right here — never on another page. */}
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                {!shownPanel ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Pick anything above to see the records behind its number.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 border-b border-border">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-semibold text-foreground">{shownPanel.label}</h3>
                          {shownPanel.available
                            ? <span className="tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-accent text-teal-800">
                                {countText(shownPanel.count)}
                              </span>
                            : <Chip tone="plain">Unavailable</Chip>}
                          {panelLoading && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <RefreshCw className="w-3 h-3 animate-spin" /> loading…
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
                          {shownPanel.definition}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearPanel}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        Clear
                      </button>
                    </div>

                    {panelError && (
                      <div className="px-4 pt-3">
                        <Banner tone="error" onRetry={() => { if (selectedKey) void loadPanel(selectedKey); }}>
                          {panelError}
                        </Banner>
                      </div>
                    )}

                    {!shownPanel.available ? (
                      <div className="px-4 py-6">
                        <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                          <AlertCircle className="w-4 h-4 text-amber-600" /> Unavailable
                        </h4>
                        <p className="text-sm text-foreground mt-2 max-w-2xl leading-relaxed">
                          {shownPanel.reason ?? "This metric has no instrumentation behind it."}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-3 max-w-2xl">
                          It would report as {shownPanel.definition.charAt(0).toLowerCase()}{shownPanel.definition.slice(1)}
                        </p>
                      </div>
                    ) : panelLoading && shownPanel.items.length === 0 ? (
                      <RowsSkeleton />
                    ) : shownPanel.items.length === 0 ? (
                      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {PANEL_EMPTY[shownPanel.key] ?? "Nothing to show for this period."}
                      </p>
                    ) : (
                      <PanelRows
                        columns={columnsFor(shownPanel.key, shownPanel.items)}
                        rows={shownPanel.items}
                        onOpen={setDetailRow}
                      />
                    )}
                  </>
                )}
              </div>
            </section>

            {/* ── Recent activity ──────────────────────────────────────────── */}
            <section className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Activity className="w-4 h-4 text-teal-700 shrink-0" />
                <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
                <span className="tabular-nums text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {countText(activity === null ? null : activity.length)}
                </span>
              </div>

              {activityError && (
                <div className="px-4 pt-3">
                  <Banner tone="error" onRetry={() => refreshRef.current()}>{activityError}</Banner>
                </div>
              )}

              {activity === null ? (
                /* The feed never arrived, so this panel says nothing about what
                   has happened. It used to read "0" over "Nothing has been
                   logged against a record yet" beside its own error banner. */
                <p className="px-4 py-8 text-center text-sm text-muted-foreground break-words">
                  Recent activity could not be loaded, so none is listed here. Use Retry above.
                </p>
              ) : activity.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing has been logged against a record yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {activity.slice(0, 15).map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-foreground break-words">{item.title}</span>
                        <span className="block text-xs text-muted-foreground break-words">
                          {item.leadId != null ? (
                            <Link href={`/admin/crm/leads/${item.leadId}`} className="text-primary hover:underline">
                              {item.leadName ?? `Lead #${item.leadId}`}
                            </Link>
                          ) : (
                            <span>No linked record</span>
                          )}
                          <span className="mx-1.5 text-muted-foreground/60">·</span>
                          <span>by {item.createdBy || "unknown"}</span>
                          {item.type ? (
                            <>
                              <span className="mx-1.5 text-muted-foreground/60">·</span>
                              <span>{item.type}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                        {relativeTime(item.createdAt, now)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {detailRow && selectedKey && shownPanel && (
        <RowDrawer
          panelKey={selectedKey}
          panelLabel={shownPanel.label}
          row={detailRow}
          onClose={() => setDetailRow(null)}
        />
      )}
    </CrmLayout>
  );
}

// ── Sales tile ───────────────────────────────────────────────────────────────

const TILE_TONE: Record<string, { chip: string; icon: string; value: string }> = {
  pipeline: { chip: "bg-sky-50", icon: "text-sky-600", value: "text-sky-700" },
  contracted: { chip: "bg-accent", icon: "text-teal-700", value: "text-teal-800" },
  cash: { chip: "bg-emerald-50", icon: "text-emerald-600", value: "text-emerald-700" },
  rate: { chip: "bg-cyan-50", icon: "text-cyan-700", value: "text-foreground" },
  forecast: { chip: "bg-amber-50", icon: "text-amber-600", value: "text-foreground" },
};

function Tile({
  icon: Icon, tone, label, value, valueTitle, detail, note, noteTitle, definition,
}: {
  icon: ElementType;
  tone: keyof typeof TILE_TONE;
  label: string;
  value: string;
  valueTitle?: string;
  detail: string;
  note?: string;
  noteTitle?: string;
  definition: string;
}) {
  const t = TILE_TONE[tone] ?? TILE_TONE["rate"];
  return (
    <div title={definition} className="bg-white rounded-xl border border-border p-3 min-w-0">
      <div className="flex items-start gap-2.5">
        <span className={`w-8 h-8 rounded-lg ${t.chip} flex items-center justify-center shrink-0`}>
          <Icon className={`w-4 h-4 ${t.icon}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">
              {label}
            </p>
            <span
              tabIndex={0}
              role="note"
              title={definition}
              aria-label={`How ${label} is worked out: ${definition}`}
              className="shrink-0 w-3.5 h-3.5 rounded-full border border-border text-[9px] leading-[12px] text-center text-muted-foreground cursor-help"
            >
              i
            </span>
          </div>
          <p title={valueTitle} className={`text-xl font-bold leading-tight tabular-nums break-words ${t.value}`}>
            {value}
          </p>
          <p className="text-[11px] text-muted-foreground tabular-nums leading-snug break-words">{detail}</p>
          {note ? (
            <p title={noteTitle} className="text-[10px] text-muted-foreground/80 tabular-nums mt-0.5 leading-snug break-words">
              {note}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ── Chart tooltip ────────────────────────────────────────────────────────────

function StageTooltip({ active, payload }: {
  active?: boolean;
  payload?: { payload?: { stage?: string; value?: number; count?: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-foreground mb-0.5">{row.stage ?? "—"}</p>
      <p className="text-foreground tabular-nums">{moneyFull(row.value ?? 0)}</p>
      <p className="text-muted-foreground tabular-nums">{plural(row.count ?? 0, "open deal", "open deals")}</p>
    </div>
  );
}

// ── Activity button ──────────────────────────────────────────────────────────

function PanelButton({ panel, selected, onSelect }: {
  panel: Panel;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = PANEL_ICON[panel.key] ?? Activity;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={panel.available ? panel.definition : (panel.reason ?? panel.definition)}
      className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${
        selected
          ? "border-primary bg-accent ring-2 ring-primary/30"
          : "border-border bg-white hover:bg-accent/60"
      }`}
    >
      <span className="flex items-start gap-2">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${panel.available ? "text-teal-700" : "text-muted-foreground/60"}`} />
        <span className="min-w-0 flex-1">
          <span className={`block text-xs font-semibold leading-snug break-words ${
            panel.available ? "text-foreground" : "text-muted-foreground"
          }`}>
            {panel.label}
          </span>
          <span className="block mt-1">
            {panel.available ? (
              <span className="tabular-nums text-lg font-bold text-foreground leading-none">
                {countText(panel.count)}
              </span>
            ) : (
              <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                Unavailable
              </span>
            )}
          </span>
        </span>
      </span>
    </button>
  );
}

// ── Rows: table on desktop, cards on mobile ──────────────────────────────────

function PanelRows({ columns, rows, onOpen }: {
  columns: PanelColumn[];
  rows: PanelRow[];
  onOpen: (row: PanelRow) => void;
}) {
  const first = columns[0];
  return (
    <>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((c) => (
                <th
                  key={c.header}
                  scope="col"
                  className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground ${
                    c.numeric ? "text-right" : "text-left"
                  }`}
                >
                  {c.header}
                </th>
              ))}
              <th scope="col" className="w-8"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={rowKeyOf(row, i)}
                tabIndex={0}
                role="button"
                aria-label={`Open ${rowTitle(row)}`}
                onClick={() => onOpen(row)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(row); }
                }}
                className="border-b border-border/50 last:border-0 cursor-pointer hover:bg-accent/60 focus:bg-accent focus:outline-none"
              >
                {columns.map((c) => (
                  <td
                    key={c.header}
                    className={`px-3 py-2.5 align-top ${c.numeric ? "text-right tabular-nums" : "text-left"}`}
                  >
                    {c.cell(row)}
                  </td>
                ))}
                <td className="px-2 align-middle">
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-border/60">
        {rows.map((row, i) => (
          <button
            key={rowKeyOf(row, i)}
            type="button"
            onClick={() => onOpen(row)}
            className="w-full text-left px-3 py-3 flex items-start gap-2 hover:bg-accent/60 transition-colors"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-foreground">
                {first ? first.cell(row) : rowTitle(row)}
              </span>
              {columns.slice(1).map((c) => (
                <span key={c.header} className="flex items-baseline gap-1.5 mt-1 text-xs min-w-0">
                  <span className="text-muted-foreground shrink-0">{c.header}</span>
                  <span className={`text-foreground min-w-0 break-words ${c.numeric ? "tabular-nums" : ""}`}>
                    {c.cell(row)}
                  </span>
                </span>
              ))}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          </button>
        ))}
      </div>
    </>
  );
}

// ── Row detail: side panel on desktop, full sheet on mobile ──────────────────

function RowDrawer({ panelKey, panelLabel, row, onClose }: {
  panelKey: string;
  panelLabel: string;
  row: PanelRow;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const link = panelLink(panelKey, row);
  const entries = Object.entries(row);

  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 flex md:justify-end" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${panelLabel} record`}
        className="bg-white w-full h-full md:max-w-md flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border shrink-0 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{panelLabel}</p>
            <h2 className="text-base font-bold text-foreground break-words">{rowTitle(row)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">This record carries no fields.</p>
          ) : (
            <dl className="divide-y divide-border/60">
              {entries.map(([key, value]) => (
                <div key={key} className="py-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground w-32 shrink-0">
                    {labelFor(key)}
                  </dt>
                  <dd className="text-sm text-foreground min-w-0 flex-1 break-words">
                    {fieldValue(key, value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="px-4 py-3 border-t border-border shrink-0">
          {link ? (
            <Link
              href={link.href}
              onClick={onClose}
              className="inline-flex items-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-3 py-2 rounded-lg hover:bg-primary/85 transition-colors"
            >
              {link.label} <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">
              This row has no record of its own to open — it is an event, not an entity.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Banners and skeletons ────────────────────────────────────────────────────

function Banner({ tone, children, onRetry }: {
  tone: "warn" | "error";
  children: ReactNode;
  onRetry?: () => void;
}) {
  const cls = tone === "error"
    ? "border-red-200 bg-red-50 text-red-800"
    : "border-amber-200 bg-amber-50 text-amber-800";
  const iconCls = tone === "error" ? "text-red-600" : "text-amber-600";
  return (
    <div className={`flex flex-wrap items-start gap-2 rounded-lg border p-3 ${cls}`}>
      <AlertCircle className={`w-4 h-4 shrink-0 mt-0.5 ${iconCls}`} />
      <p className="text-xs flex-1 min-w-0">{children}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-xs font-semibold underline shrink-0">
          Retry
        </button>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading the command center">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-border p-3">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-2 w-16 rounded bg-muted animate-pulse" />
                <div className="h-5 w-20 rounded bg-muted animate-pulse" />
                <div className="h-2 w-14 rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border p-4">
        <div className="h-3 w-52 rounded bg-muted animate-pulse mb-3" />
        <div className="h-56 rounded-lg bg-muted animate-pulse" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-white px-3 py-2.5">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-5 w-10 rounded bg-muted animate-pulse mt-2" />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-border p-4 space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="px-4 py-3 space-y-2" aria-busy="true" aria-label="Loading records">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />
      ))}
    </div>
  );
}
