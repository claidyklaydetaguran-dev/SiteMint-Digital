import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  computeWorkflowSteps,
  type WeLead, type WeActivity, type WeTask, type WorkflowStep,
} from "@/lib/workflowEngine";
import WorkflowBuilder, {
  type AutomationVocabulary, type WorkflowRuleDraft,
} from "@/components/crm/WorkflowBuilder";
import {
  AlertTriangle, CheckCircle2, CheckSquare, ChevronRight, Clock, Cpu, Mail,
  MessageSquare, Pencil, Play, Plus, RefreshCw, ShieldCheck, Trash2, XCircle,
} from "lucide-react";

import { adminFetch } from "@/lib/adminFetch";

// ── M4: Automation ───────────────────────────────────────────────────────────
//
// Two things live on this page because they are two halves of one question —
// "what is the CRM doing on its own?":
//
//   In flight   the standard sales sequence and the scheduled campaign sends,
//               computed by the LOCKED `workflowEngine` module. Advice: where
//               each lead is and what a person should do next. Nothing here
//               writes anything.
//   Rules       automations somebody wrote, that fire on real events and change
//               real records, with every run recorded.
//
// The first is unchanged and still rendered by the same locked engine. The
// second is new. Keeping them apart matters: one is a suggestion and one is an
// action, and a screen that blurs them would leave people unsure which of the
// two just created a task on their lead.

// ── Types ─────────────────────────────────────────────────────────────────────

interface LeadRow extends WeLead {
  company?: string | null;
}

interface ScheduledMessageRow {
  id: number;
  campaignId: number;
  leadId: number;
  channel: string;
  subject: string | null;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  leadName: string;
  campaignName: string;
}

interface QueueEntry {
  key: string;
  kind: "workflow" | "campaign";
  leadId: number;
  leadName: string;
  company?: string | null;
  title: string;
  subtitle: string;
  dueAt: string | null;
  overdue: boolean;
  href: string;
}

interface RuleRow extends WorkflowRuleDraft {
  id: number;
  enabled: boolean;
  archivedAt: string | null;
  recordType: string | null;
  createdByLabel: string | null;
  counts: Record<string, number> & { total: number };
}

interface ExecutionRow {
  id: number;
  ruleId: number;
  ruleName?: string | null;
  trigger: string;
  recordType: string;
  recordId: number;
  status: string;
  conditionOutcome: string;
  stopReason: string | null;
  detail: string | null;
  chainDepth: number;
  attempts: number;
  createdAt: string;
  finishedAt: string | null;
}

interface ActionRunRow {
  id: number;
  actionIndex: number;
  actionType: string;
  status: string;
  attempts: number;
  detail: string | null;
  affectedRecordType: string | null;
  affectedRecordId: number | null;
}

interface ApprovalRow {
  id: number;
  executionId: number;
  ruleId: number;
  ruleName: string | null;
  actionIndex: number;
  actionType: string;
  approverStaffId: number;
  status: string;
  summary: string;
  recordType: string;
  recordId: number;
  decisionReason: string | null;
  decidableByMe: boolean;
  createdAt: string;
}

type Tab = "in_flight" | "rules" | "history" | "approvals";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "no date";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

const words = (s: string) => s.replace(/_/g, " ");

/**
 * The tone a run's status should be read in.
 *
 * `stopped` is deliberately amber, not red: a rule that stopped because a
 * person completed the task, or because loop protection caught it, worked
 * exactly as intended. Only `failed` — something tried and did not land — is
 * a problem.
 */
function statusTone(status: string): string {
  if (status === "completed") return "text-teal-700 bg-teal-50 border-teal-200";
  if (status === "failed") return "text-red-700 bg-red-50 border-red-200";
  if (status === "awaiting_approval") return "text-amber-700 bg-amber-50 border-amber-200";
  if (status === "stopped") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-muted-foreground bg-muted border-border";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${statusTone(status)}`}>
      {words(status)}
    </span>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span className="min-w-0 flex-1">{message}</span>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border border-red-200 rounded-lg bg-background hover:bg-accent transition-colors"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

function ChannelIcon({ ch }: { ch: string }) {
  if (ch === "email") return <Mail className="w-4 h-4 text-primary" />;
  if (ch === "sms") return <MessageSquare className="w-4 h-4 text-teal-600" />;
  return <CheckSquare className="w-4 h-4 text-muted-foreground" />;
}

// ── In flight (the locked workflowEngine's view, unchanged) ───────────────────

function QueueRow({ entry, onOpen }: { entry: QueueEntry; onOpen: (href: string) => void }) {
  return (
    <button
      onClick={() => onOpen(entry.href)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-border/60 hover:bg-accent text-left transition-colors last:border-b-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        {entry.kind === "campaign"
          ? <ChannelIcon ch={entry.title} />
          : <Cpu className="w-4 h-4 text-primary shrink-0" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground truncate">{entry.leadName}</span>
            {entry.company && <span className="text-xs text-muted-foreground truncate">{entry.company}</span>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{entry.subtitle}</div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {entry.dueAt && (
          <span className={`text-[11px] font-medium flex items-center gap-1 ${entry.overdue ? "text-red-600" : "text-muted-foreground"}`}>
            {entry.overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
            {fmtDate(entry.dueAt)}
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}

function Section({ title, icon: Icon, tone, entries, onOpen, emptyText }: {
  title: string; icon: React.ElementType; tone: string;
  entries: QueueEntry[]; onOpen: (href: string) => void; emptyText: string;
}) {
  return (
    <div className="bg-background rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted">
        <Icon className={`w-4 h-4 ${tone}`} />
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{entries.length}</span>
      </div>
      {entries.length === 0
        ? <Empty>{emptyText}</Empty>
        : <div>{entries.map((e) => <QueueRow key={e.key} entry={e} onOpen={onOpen} />)}</div>}
    </div>
  );
}

function InFlight({ onOpen }: { onOpen: (href: string) => void }) {
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [activities, setActivities] = useState<WeActivity[]>([]);
  const [tasks, setTasks] = useState<WeTask[]>([]);
  const [messages, setMessages] = useState<ScheduledMessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await adminFetch("/api/crm/intelligence/automation-queue");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as {
        leads: LeadRow[]; activities: (WeActivity & { leadId: number })[];
        tasks: (WeTask & { leadId: number | null })[]; scheduledMessages: ScheduledMessageRow[];
      };
      setLeads(data.leads);
      setActivities(data.activities);
      setTasks(data.tasks.filter((t): t is WeTask & { leadId: number } => t.leadId != null));
      setMessages(data.scheduledMessages);
    } catch {
      setError("The in-flight queue could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { active, pending, completed } = useMemo(() => {
    const now = Date.now();
    const activitiesByLead = new Map<number, WeActivity[]>();
    for (const a of activities as (WeActivity & { leadId: number })[]) {
      const bucket = activitiesByLead.get(a.leadId) ?? [];
      bucket.push(a);
      activitiesByLead.set(a.leadId, bucket);
    }
    const tasksByLead = new Map<number, WeTask[]>();
    for (const t of tasks as (WeTask & { leadId: number })[]) {
      const bucket = tasksByLead.get(t.leadId) ?? [];
      bucket.push(t);
      tasksByLead.set(t.leadId, bucket);
    }

    const workflowActive: QueueEntry[] = [];
    const workflowPending: QueueEntry[] = [];
    const workflowCompleted: QueueEntry[] = [];

    for (const lead of leads ?? []) {
      const leadActivities = activitiesByLead.get(lead.id) ?? [];
      const leadTasks = tasksByLead.get(lead.id) ?? [];
      const steps: WorkflowStep[] = computeWorkflowSteps(lead, leadActivities, leadTasks);
      const overdue = !!lead.nextFollowUpAt && new Date(lead.nextFollowUpAt).getTime() < now;
      const href = `/admin/crm/leads/${lead.id}?tab=workflow`;

      for (const step of steps) {
        const entry: QueueEntry = {
          key: `wf-${lead.id}-${step.id}`,
          kind: "workflow",
          leadId: lead.id,
          leadName: lead.name,
          company: lead.company,
          title: step.title,
          subtitle: step.recommendedAction ?? step.description,
          dueAt: lead.nextFollowUpAt ?? null,
          overdue,
          href,
        };
        if (step.status === "active") workflowActive.push(entry);
        else if (step.status === "pending") workflowPending.push(entry);
        else if (step.status === "completed") workflowCompleted.push(entry);
      }
    }

    const campaignActive: QueueEntry[] = [];
    const campaignPending: QueueEntry[] = [];
    const campaignCompleted: QueueEntry[] = [];

    for (const m of messages) {
      const dueAt = m.scheduledAt;
      const overdue = !!dueAt && new Date(dueAt).getTime() < now;
      const entry: QueueEntry = {
        key: `cm-${m.id}`,
        kind: "campaign",
        leadId: m.leadId,
        leadName: m.leadName,
        title: m.channel,
        subtitle: `${m.campaignName} — ${m.subject ?? m.channel}`,
        dueAt: m.status === "sent" ? m.sentAt : dueAt,
        overdue,
        href: "/admin/crm/campaign-queue",
      };
      if (m.status === "sent") campaignCompleted.push(entry);
      else if (m.status === "queued" || overdue) campaignActive.push(entry);
      else campaignPending.push(entry);
    }

    const byUrgency = (a: QueueEntry, b: QueueEntry) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    };

    return {
      active: [...workflowActive, ...campaignActive].sort(byUrgency),
      pending: [...workflowPending, ...campaignPending].sort(byUrgency),
      completed: [...workflowCompleted, ...campaignCompleted]
        .sort((a, b) => (b.dueAt ?? "").localeCompare(a.dueAt ?? ""))
        .slice(0, 30),
    };
  }, [leads, activities, tasks, messages]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (loading && !leads) {
    return (
      <div className="bg-background rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
        Loading the in-flight queue…
      </div>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Every automated step in flight, org-wide — sales-sequence steps and scheduled campaign sends.
        These are suggestions and scheduled messages; they do not change records on their own.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Section title="Active Now" icon={AlertTriangle} tone="text-red-600" entries={active}
          onOpen={onOpen} emptyText="Nothing needs action right now." />
        <Section title="Pending" icon={Clock} tone="text-amber-600" entries={pending}
          onOpen={onOpen} emptyText="No upcoming automation steps." />
        <Section title="Recently Completed" icon={CheckCircle2} tone="text-teal-600" entries={completed}
          onOpen={onOpen} emptyText="Nothing completed yet." />
      </div>
    </>
  );
}

// ── Rules ─────────────────────────────────────────────────────────────────────

function RunDetail({ executionId }: { executionId: number }) {
  const [runs, setRuns] = useState<ActionRunRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await adminFetch(`/api/crm/automation/executions/${executionId}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { actionRuns: ActionRunRow[] };
      setRuns(data.actionRuns);
    } catch {
      setError("This run's steps could not be loaded.");
    }
  }, [executionId]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <div className="px-4 py-3"><ErrorState message={error} onRetry={() => void load()} /></div>;
  if (!runs) return <p className="px-4 py-3 text-xs text-muted-foreground">Loading steps…</p>;
  if (runs.length === 0) {
    return <p className="px-4 py-3 text-xs text-muted-foreground">No steps ran — the conditions did not match.</p>;
  }

  return (
    <ol className="px-4 py-3 space-y-2">
      {runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-start gap-2 text-xs">
          <span className="font-bold text-muted-foreground shrink-0">{run.actionIndex + 1}.</span>
          <span className="font-medium text-foreground shrink-0">{words(run.actionType)}</span>
          <StatusPill status={run.status} />
          {run.attempts > 1 && (
            <span className="text-[11px] text-muted-foreground">after {run.attempts} attempts</span>
          )}
          {run.affectedRecordType && (
            <span className="text-[11px] text-muted-foreground">
              → {words(run.affectedRecordType)} {run.affectedRecordId}
            </span>
          )}
          {run.detail && <span className="w-full text-[11px] text-muted-foreground">{run.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

function ExecutionList({ executions, counts, showRule }: {
  executions: ExecutionRow[]; counts: Record<string, number> | null; showRule?: boolean;
}) {
  const [openId, setOpenId] = useState<number | null>(null);

  return (
    <div className="bg-background border border-border rounded-xl overflow-hidden">
      {counts && (
        <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-border bg-muted">
          <span className="text-xs font-semibold text-foreground">{counts["total"] ?? 0} run(s)</span>
          {["completed", "failed", "stopped", "awaiting_approval", "queued", "running"]
            .filter((s) => (counts[s] ?? 0) > 0)
            .map((s) => (
              <span key={s} className="text-[11px] text-muted-foreground">
                {counts[s]} {words(s)}
              </span>
            ))}
        </div>
      )}

      {executions.length === 0 ? <Empty>Nothing has run yet.</Empty> : (
        <ul className="divide-y divide-border/60">
          {executions.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => setOpenId(openId === e.id ? null : e.id)}
                className="w-full text-left px-4 py-3 hover:bg-accent transition-colors"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={e.status} />
                  {showRule && e.ruleName && (
                    <span className="text-sm font-medium text-foreground truncate">{e.ruleName}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {words(e.trigger)} · {words(e.recordType)} {e.recordId}
                  </span>
                  <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                    {fmtDate(e.createdAt)}
                  </span>
                </div>
                {e.conditionOutcome === "not_matched" && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Conditions did not match.</p>
                )}
                {e.stopReason && (
                  <p className="mt-1 text-[11px] text-amber-700">Stopped: {words(e.stopReason)}</p>
                )}
                {e.detail && <p className="mt-1 text-[11px] text-muted-foreground">{e.detail}</p>}
              </button>
              {openId === e.id && (
                <div className="border-t border-border/60 bg-muted/40">
                  <RunDetail executionId={e.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleHistory({ ruleId }: { ruleId: number }) {
  const [executions, setExecutions] = useState<ExecutionRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await adminFetch(`/api/crm/automation/rules/${ruleId}/executions?limit=100`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { executions: ExecutionRow[]; counts: Record<string, number> };
      setExecutions(data.executions);
      setCounts(data.counts);
    } catch {
      setError("This rule's history could not be loaded.");
    }
  }, [ruleId]);

  useEffect(() => { void load(); }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!executions) return <p className="text-xs text-muted-foreground px-1">Loading history…</p>;
  return <ExecutionList executions={executions} counts={counts} />;
}

// ── The page ──────────────────────────────────────────────────────────────────

export default function CrmAutomationQueue() {
  const [, setLoc] = useLocation();
  const [tab, setTab] = useState<Tab>("in_flight");

  const [vocabulary, setVocabulary] = useState<AutomationVocabulary | null>(null);
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRow[] | null>(null);
  const [recent, setRecent] = useState<ExecutionRow[] | null>(null);
  const [recentCounts, setRecentCounts] = useState<Record<string, number> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<WorkflowRuleDraft | null>(null);
  const [builderError, setBuilderError] = useState<string | null>(null);
  const [openHistoryFor, setOpenHistoryFor] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // A record to look up "what have automations done to this?" — the question
  // people actually ask, with a contact open in front of them.
  const [lookupType, setLookupType] = useState("lead");
  const [lookupId, setLookupId] = useState("");

  const loadRules = useCallback(async () => {
    setError(null);
    try {
      const [vocabRes, rulesRes, approvalsRes] = await Promise.all([
        adminFetch("/api/crm/automation/vocabulary"),
        adminFetch("/api/crm/automation/rules"),
        adminFetch("/api/crm/automation/approvals?status=pending"),
      ]);
      if (!vocabRes.ok || !rulesRes.ok || !approvalsRes.ok) {
        throw new Error(`HTTP ${[vocabRes, rulesRes, approvalsRes].find((r) => !r.ok)?.status}`);
      }
      setVocabulary(await vocabRes.json() as AutomationVocabulary);
      setRules(((await rulesRes.json()) as { rules: RuleRow[] }).rules);
      setApprovals(((await approvalsRes.json()) as { approvals: ApprovalRow[] }).approvals);
    } catch {
      setError("Automation rules could not be loaded. You may not have permission to see them.");
    }
  }, []);

  useEffect(() => { void loadRules(); }, [loadRules]);

  const loadRecord = useCallback(async () => {
    const id = Number(lookupId);
    if (!Number.isFinite(id) || id <= 0) return;
    setError(null);
    try {
      const r = await adminFetch(
        `/api/crm/automation/records/${lookupType}/${id}/executions?limit=100`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { executions: ExecutionRow[]; counts: Record<string, number> };
      setRecent(data.executions);
      setRecentCounts(data.counts);
    } catch {
      setError("That record's automation history could not be loaded.");
    }
  }, [lookupType, lookupId]);

  const saveRule = async (draft: WorkflowRuleDraft) => {
    setBusy(true);
    setBuilderError(null);
    try {
      const res = await adminFetch(
        draft.id ? `/api/crm/automation/rules/${draft.id}` : "/api/crm/automation/rules",
        { method: draft.id ? "PATCH" : "POST", body: JSON.stringify(draft) },
      );
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setBuilderError(body.error ?? `The rule could not be saved (HTTP ${res.status}).`); return; }
      setEditing(null);
      await loadRules();
    } catch {
      setBuilderError("The rule could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleRule = async (rule: RuleRow) => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/crm/automation/rules/${rule.id}`,
        { method: "PATCH", body: JSON.stringify({ enabled: !rule.enabled }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadRules();
    } catch {
      setError("That rule could not be switched.");
    } finally {
      setBusy(false);
    }
  };

  const deleteRule = async (rule: RuleRow) => {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/crm/automation/rules/${rule.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotice(`"${rule.name}" is off. Its run history is kept.`);
      await loadRules();
    } catch {
      setError("That rule could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  const runRule = async (rule: RuleRow) => {
    const answer = window.prompt(
      `Run "${rule.name}" against which ${words(rule.recordType ?? "record")}? Enter its id.`);
    if (!answer) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await adminFetch(`/api/crm/automation/rules/${rule.id}/run`,
        { method: "POST", body: JSON.stringify({ recordId: Number(answer) }) });
      const body = await res.json().catch(() => ({})) as { error?: string; execution?: ExecutionRow };
      if (!res.ok) { setError(body.error ?? `The rule could not be run (HTTP ${res.status}).`); return; }
      setNotice(`Run finished: ${words(body.execution?.status ?? "queued")}.`);
      setOpenHistoryFor(rule.id);
      await loadRules();
    } catch {
      setError("The rule could not be run.");
    } finally {
      setBusy(false);
    }
  };

  const decide = async (approval: ApprovalRow, decision: "approve" | "reject") => {
    let reason: string | null = null;
    if (decision === "reject") {
      reason = window.prompt("Why are you rejecting this? The person whose rule stops needs to know.");
      if (!reason?.trim()) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/crm/automation/approvals/${approval.id}/decide`,
        { method: "POST", body: JSON.stringify({ decision, reason }) });
      const body = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setError(body.error ?? `That decision could not be recorded (HTTP ${res.status}).`); return; }
      setNotice(decision === "approve" ? "Approved — the rule has continued." : "Rejected — the run has stopped.");
      await loadRules();
    } catch {
      setError("That decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  };

  const pendingForMe = (approvals ?? []).filter((a) => a.decidableByMe).length;

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "in_flight", label: "In flight" },
    { id: "rules", label: "Rules", badge: rules?.filter((r) => r.enabled).length },
    { id: "history", label: "History" },
    { id: "approvals", label: "Approvals", badge: pendingForMe || undefined },
  ];

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Cpu className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-xl font-semibold text-foreground truncate">Automation</h1>
          </div>
          <button
            onClick={() => void loadRules()}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-accent transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <nav className="flex flex-wrap gap-1 border-b border-border -mb-px" aria-label="Automation views">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.badge !== undefined && t.badge > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-muted text-[11px]">{t.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {notice && (
          <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 text-teal-800 text-sm rounded-lg px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1">{notice}</span>
            <button onClick={() => setNotice(null)} aria-label="Dismiss"
              className="text-teal-800/70 hover:text-teal-800">×</button>
          </div>
        )}
        {error && <ErrorState message={error} onRetry={() => void loadRules()} />}

        {tab === "in_flight" && <InFlight onOpen={(href) => setLoc(href)} />}

        {tab === "rules" && (
          <div className="space-y-4">
            {editing && vocabulary ? (
              <WorkflowBuilder
                vocabulary={vocabulary}
                initial={editing.name === "" && !editing.id ? null : editing}
                saving={busy}
                error={builderError}
                onSave={(draft) => void saveRule(draft)}
                onCancel={() => { setEditing(null); setBuilderError(null); }}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => { setBuilderError(null); setEditing({ name: "", trigger: "" }); }}
                    disabled={!vocabulary}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> New rule
                  </button>
                  <p className="text-xs text-muted-foreground">
                    Rules act on real records. Every run is recorded, and no rule can contact a customer.
                  </p>
                </div>

                {!rules ? (
                  <div className="bg-background rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
                    Loading rules…
                  </div>
                ) : rules.length === 0 ? (
                  <div className="bg-background rounded-xl border border-border">
                    <Empty>No automation rules yet. The in-flight tab still shows the standard sales sequence.</Empty>
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {rules.map((rule) => (
                      <li key={rule.id} className="bg-background border border-border rounded-xl overflow-hidden">
                        <div className="px-4 py-3 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-foreground min-w-0 truncate">{rule.name}</span>
                            <span className={`px-2 py-0.5 rounded-full border text-[11px] font-medium ${
                              rule.enabled
                                ? "text-teal-700 bg-teal-50 border-teal-200"
                                : "text-muted-foreground bg-muted border-border"
                            }`}>
                              {rule.enabled ? "on" : "off"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {words(rule.trigger)} · {rule.counts.total} run(s)
                            </span>
                          </div>

                          {rule.description && (
                            <p className="text-xs text-muted-foreground">{rule.description}</p>
                          )}

                          <p className="text-[11px] text-muted-foreground">
                            {(rule.actions ?? []).length} step(s) ·
                            {" "}stops after {rule.maxChainDepth} automation hop(s) ·
                            {" "}at most {rule.windowCap} run(s) per record per {rule.windowMinutes} min
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <button onClick={() => void toggleRule(rule)} disabled={busy}
                              className="px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50">
                              {rule.enabled ? "Switch off" : "Switch on"}
                            </button>
                            <button onClick={() => { setBuilderError(null); setEditing(rule); }}
                              className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors">
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                            <button onClick={() => void runRule(rule)} disabled={busy || !rule.enabled}
                              className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors disabled:opacity-50">
                              <Play className="w-3 h-3" /> Run now
                            </button>
                            <button onClick={() => setOpenHistoryFor(openHistoryFor === rule.id ? null : rule.id)}
                              className="px-2.5 py-1 text-[11px] border border-border rounded-lg hover:bg-accent transition-colors">
                              {openHistoryFor === rule.id ? "Hide history" : "History"}
                            </button>
                            <button onClick={() => void deleteRule(rule)} disabled={busy}
                              className="flex items-center gap-1 px-2.5 py-1 text-[11px] border border-red-200 text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50">
                              <Trash2 className="w-3 h-3" /> Delete
                            </button>
                          </div>
                        </div>

                        {openHistoryFor === rule.id && (
                          <div className="border-t border-border bg-muted/40 p-3">
                            <RuleHistory ruleId={rule.id} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}

        {tab === "history" && (
          <div className="space-y-4">
            <div className="bg-background border border-border rounded-xl p-4 space-y-2.5">
              <p className="text-xs text-muted-foreground">
                "Why does this contact have three tasks nobody remembers creating?" — look the record up.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto] gap-2">
                <select
                  value={lookupType}
                  onChange={(e) => setLookupType(e.target.value)}
                  className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground"
                >
                  {(vocabulary?.recordTypes ?? ["lead"]).map((t) => (
                    <option key={t} value={t}>{words(t)}</option>
                  ))}
                </select>
                <input
                  value={lookupId}
                  onChange={(e) => setLookupId(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void loadRecord(); }}
                  inputMode="numeric"
                  placeholder="Record id"
                  className="px-3 py-2 text-sm border border-input rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button
                  onClick={() => void loadRecord()}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
                >
                  Look up
                </button>
              </div>
            </div>

            {recent
              ? <ExecutionList executions={recent} counts={recentCounts} showRule />
              : (
                <div className="bg-background border border-border rounded-xl">
                  <Empty>Pick a record to see everything automation has done to it.</Empty>
                </div>
              )}
          </div>
        )}

        {tab === "approvals" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A step that needs a person. Only the named approver can decide — a rejection stops the
              whole run and records the reason.
            </p>

            {!approvals ? (
              <div className="bg-background rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
                Loading approvals…
              </div>
            ) : approvals.length === 0 ? (
              <div className="bg-background rounded-xl border border-border">
                <Empty>Nothing is waiting on anybody.</Empty>
              </div>
            ) : (
              <ul className="space-y-3">
                {approvals.map((a) => (
                  <li key={a.id} className="bg-background border border-border rounded-xl px-4 py-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="text-sm font-semibold text-foreground min-w-0 truncate">
                        {a.ruleName ?? `Rule ${a.ruleId}`}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        step {a.actionIndex + 1} · {words(a.actionType)} · {words(a.recordType)} {a.recordId}
                      </span>
                      <span className="ml-auto text-[11px] text-muted-foreground shrink-0">
                        {fmtDate(a.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-foreground">{a.summary}</p>

                    {a.decidableByMe ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button onClick={() => void decide(a, "approve")} disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-teal-200 text-teal-800 bg-teal-50 rounded-lg hover:bg-teal-100 transition-colors disabled:opacity-50">
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </button>
                        <button onClick={() => void decide(a, "reject")} disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium border border-red-200 text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-50">
                          <XCircle className="w-3 h-3" /> Reject
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Waiting on somebody else — only the named approver can decide this.
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
