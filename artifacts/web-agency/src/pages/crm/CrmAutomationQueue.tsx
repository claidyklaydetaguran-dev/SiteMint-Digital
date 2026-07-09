import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  computeWorkflowSteps,
  type WeLead, type WeActivity, type WeTask, type WorkflowStep,
} from "@/lib/workflowEngine";
import {
  Cpu, RefreshCw, Mail, MessageSquare, CheckSquare, Clock, AlertTriangle,
  CheckCircle2, ChevronRight,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "no date";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function ChannelIcon({ ch }: { ch: string }) {
  if (ch === "email") return <Mail className="w-4 h-4 text-blue-600" />;
  if (ch === "sms")   return <MessageSquare className="w-4 h-4 text-violet-600" />;
  return <CheckSquare className="w-4 h-4 text-gray-500" />;
}

// ── Row + section ─────────────────────────────────────────────────────────────

function QueueRow({ entry, onOpen }: { entry: QueueEntry; onOpen: (href: string) => void }) {
  return (
    <button
      onClick={() => onOpen(entry.href)}
      className="w-full flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 text-left transition-colors last:border-b-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        {entry.kind === "campaign" ? <ChannelIcon ch={entry.title} /> : <Cpu className="w-4 h-4 text-primary shrink-0" />}
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <Icon className={`w-4 h-4 ${tone}`} />
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground ml-auto">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground px-4 py-6 text-center">{emptyText}</p>
      ) : (
        <div>{entries.map(e => <QueueRow key={e.key} entry={e} onOpen={onOpen} />)}</div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CrmAutomationQueue() {
  const [, setLoc] = useLocation();
  const [leads, setLeads] = useState<LeadRow[] | null>(null);
  const [activities, setActivities] = useState<WeActivity[]>([]);
  const [tasks, setTasks] = useState<WeTask[]>([]);
  const [messages, setMessages] = useState<ScheduledMessageRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/crm/intelligence/automation-queue", {
        headers: { Authorization: `Bearer ${token()}` },
      });
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
      setError("Failed to load the automation queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

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

  const openHref = (href: string) => setLoc(href);

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Automation Queue</h1>
          </div>
          <button
            onClick={load}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          Every automated step in flight, org-wide — workflow steps and scheduled campaign sends, one view.
          Click a row to open the Sales Workspace or Campaign Queue to act on it.
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">{error}</div>
        )}

        {loading && !leads ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-muted-foreground">
            Loading automation queue…
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Section
              title="Active Now"
              icon={AlertTriangle}
              tone="text-red-600"
              entries={active}
              onOpen={openHref}
              emptyText="Nothing needs action right now."
            />
            <Section
              title="Pending"
              icon={Clock}
              tone="text-amber-600"
              entries={pending}
              onOpen={openHref}
              emptyText="No upcoming automation steps."
            />
            <Section
              title="Recently Completed"
              icon={CheckCircle2}
              tone="text-emerald-600"
              entries={completed}
              onOpen={openHref}
              emptyText="Nothing completed yet."
            />
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
