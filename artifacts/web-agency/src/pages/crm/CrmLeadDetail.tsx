import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useLocation, useParams, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Mail, Phone, MessageSquare, Globe, Building, Calendar, Tag,
  Plus, Check, Trash2, Send, X, Clock, PhoneCall, AlertCircle,
  FileText, CheckCircle2, XCircle, RefreshCw,
} from "lucide-react";
import { scoreLeadFromFields } from "@/lib/leadScore";
import {
  computeCommunicationStats,
  type CiLead,
} from "@/lib/communicationIntelligence";
import {
  computeDiscProfile,
  DISC_META,
  type DiLead,
} from "@/lib/discEngine";
import { SalesWorkspace } from "./SalesWorkspace";
import {
  computeSalesNBA, computeLeadMomentum,
  type SiLead, type SiActivity, type SiTask,
} from "@/lib/salesIntelligence";

const token = () => localStorage.getItem("adminToken") || "";

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUSES = ["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"];
const PRIORITIES = ["Low","Medium","High"];
const TASK_TYPES = ["Call","Email","Send Proposal","Follow Up","Check Website","Ask for Decision","Send Contract","Other"];
const TEAM = ["Claidy Taguran","Shasta Greene","Saisa Lorraigne","Unassigned"];

const statusColor: Record<string,string> = {
  New:"bg-blue-100 text-blue-700",Contacted:"bg-indigo-100 text-indigo-700",
  "Follow-up":"bg-yellow-100 text-yellow-700","Proposal Sent":"bg-purple-100 text-purple-700",
  Negotiating:"bg-orange-100 text-orange-700",Won:"bg-green-100 text-green-700",
  Lost:"bg-red-100 text-red-700",Nurture:"bg-gray-100 text-gray-600",
};

const statusBtnColor: Record<string,string> = {
  New:"border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100",
  Contacted:"border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100",
  "Follow-up":"border-yellow-200 bg-yellow-50 text-yellow-800 hover:bg-yellow-100",
  "Proposal Sent":"border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-100",
  Negotiating:"border-orange-200 bg-orange-50 text-orange-800 hover:bg-orange-100",
  Won:"border-green-200 bg-green-50 text-green-800 hover:bg-green-100",
  Lost:"border-red-200 bg-red-50 text-red-800 hover:bg-red-100",
  Nurture:"border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100",
};

const activityIcon: Record<string,string> = {
  lead_created:"🟢",lead_imported:"📥",status_changed:"🔄",note_added:"📝",
  email_sent:"📧",task_created:"✅",task_completed:"🎯",follow_up_changed:"⏰",
  sms_attempted:"📱",sms_sent:"📤",sms_received:"📩",
  call_initiated:"📞",call_received:"📲",sms_opt_out:"🚫",sms_opt_in:"✅",
};

// ── Modal ─────────────────────────────────────────────────────────────────────

function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lead {
  id:number; name:string; company?:string; phone?:string; email:string; website?:string;
  source:string; serviceInterest?:string; status:string; priority:string; assignedTo?:string;
  tags:string[]; lastContactedAt?:string; nextFollowUpAt?:string; notes?:string;
  estimatedValue?:string; packageType?:string; discoveryFormStatus:string;
  proposalStatus:string; sowStatus:string; createdAt:string; updatedAt:string;
  discoverySubmissionId?:number;
  smsConsent:boolean; smsOptOut:boolean;
  generatedProposal?:string; generatedSow?:string;
}
interface Activity { id:number; type:string; title:string; description?:string; createdAt:string; }
interface CrmMessage {
  id:number; direction:string; channel:string; body?:string; status?:string;
  fromNumber?:string; toNumber?:string; callStatus?:string; duration?:number; createdAt:string;
}
interface Task {
  id:number; leadId:number; type:string; title:string; description?:string;
  dueDate?:string; status:string; completedAt?:string; createdAt:string;
}
type ModalType = "call"|"text"|"email"|"note"|"task"|"status"|null;
interface ToastItem { id:number; type:"success"|"error"|"info"; msg:string; }

// ── Component ─────────────────────────────────────────────────────────────────

export default function CrmLeadDetail() {
  const params = useParams<{id:string}>();
  const [, navigate] = useLocation();
  const [lead, setLead] = useState<Lead|null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const health = useMemo(
    () => (lead ? scoreLeadFromFields(lead, activities) : null),
    [lead, activities],
  );
  const ciStats = useMemo(() => {
    if (!lead) return null;
    const ciLead: CiLead = {
      id: lead.id, status: lead.status,
      lastContactedAt: lead.lastContactedAt,
      nextFollowUpAt: lead.nextFollowUpAt,
      proposalStatus: lead.proposalStatus,
      smsConsent: lead.smsConsent,
      smsOptOut: lead.smsOptOut,
    };
    return computeCommunicationStats(ciLead, activities, []);
  }, [lead, activities]);
  const siLead = useMemo((): SiLead | null => {
    if (!lead) return null;
    return {
      id: lead.id, name: lead.name, company: lead.company, status: lead.status,
      priority: lead.priority, estimatedValue: lead.estimatedValue,
      lastContactedAt: lead.lastContactedAt, nextFollowUpAt: lead.nextFollowUpAt,
      proposalStatus: lead.proposalStatus ?? "Not Started",
      sowStatus: lead.sowStatus ?? "Not Started",
      generatedProposal: lead.generatedProposal, generatedSow: lead.generatedSow,
      discoverySubmissionId: lead.discoverySubmissionId,
      createdAt: lead.createdAt, updatedAt: lead.updatedAt,
    };
  }, [lead]);

  const siActivities = useMemo((): SiActivity[] =>
    activities.map(a => ({ type: a.type, createdAt: a.createdAt })), [activities]);

  const siTasks = useMemo((): SiTask[] =>
    tasks.map(t => ({ status: t.status, dueDate: t.dueDate, completedAt: t.completedAt, createdAt: t.createdAt })), [tasks]);

  const salesNBA = useMemo(() => {
    if (!siLead) return null;
    return computeSalesNBA(siLead, siActivities, siTasks, health?.score ?? 50, ciStats?.engagementScore.score ?? 50);
  }, [siLead, siActivities, siTasks, health, ciStats]);

  const momentum = useMemo(() => {
    if (!siLead) return null;
    return computeLeadMomentum(siLead, siActivities, siTasks, health?.score ?? 50, ciStats?.engagementScore.score ?? 50);
  }, [siLead, siActivities, siTasks, health, ciStats]);

  const discProfile = useMemo(() => {
    if (!lead) return null;
    const diLead: DiLead = {
      id: lead.id, status: lead.status, priority: lead.priority,
      source: lead.source, serviceInterest: lead.serviceInterest,
      notes: lead.notes, tags: lead.tags, estimatedValue: lead.estimatedValue,
      packageType: lead.packageType, proposalStatus: lead.proposalStatus,
      discoveryFormStatus: lead.discoveryFormStatus,
      lastContactedAt: lead.lastContactedAt, nextFollowUpAt: lead.nextFollowUpAt,
      smsConsent: lead.smsConsent, smsOptOut: lead.smsOptOut,
    };
    return computeDiscProfile(diLead, [], activities);
  }, [lead, activities]);
  const [activeTab, setActiveTab] = useState<"timeline"|"tasks"|"sms"|"email">("timeline");
  const smsThreadRef = useRef<HTMLDivElement>(null);

  // Modals & toasts
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const showToast = useCallback((msg: string, type: ToastItem["type"] = "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4500);
  }, []);

  // SMS / call state
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [smsBody, setSmsBody] = useState("");
  const [sendingSms, setSendingSms] = useState(false);
  const [callingLead, setCallingLead] = useState(false);

  // Edit state (sidebar)
  const [editStatus, setEditStatus] = useState("");
  const [editPriority, setEditPriority] = useState("");
  const [editAssigned, setEditAssigned] = useState("");
  const [editFollowUp, setEditFollowUp] = useState("");
  const [editEstValue, setEditEstValue] = useState("");
  const [editPackage, setEditPackage] = useState("");

  // Note
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Task
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ type:"Follow Up", title:"", description:"", dueDate:"" });
  const [addingTask, setAddingTask] = useState(false);

  // Email
  const [templates, setTemplates] = useState<{id:number;name:string;subject:string;body:string}[]>([]);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailTestMode, setEmailTestMode] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setLoading(true);
    const r = await fetch(`/api/crm/leads/${params.id}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 401) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    if (!r.ok) { navigate("/admin/crm/leads"); return; }
    const d = await r.json() as { lead:Lead; activities:Activity[]; tasks:Task[] };
    setLead(d.lead);
    setActivities(d.activities || []);
    setTasks(d.tasks || []);
    setEditStatus(d.lead.status);
    setEditPriority(d.lead.priority);
    setEditAssigned(d.lead.assignedTo || "");
    setEditFollowUp(d.lead.nextFollowUpAt ? d.lead.nextFollowUpAt.substring(0,10) : "");
    setEditEstValue(d.lead.estimatedValue || "");
    setEditPackage(d.lead.packageType || "");
    setLoading(false);
  }, [params.id, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!token()) return;
    fetch("/api/crm/email-templates", { headers: { Authorization: `Bearer ${token()}` } })
      .then(r => r.json()).then(d => setTemplates((d as {templates?: typeof templates}).templates || []));
  }, []);

  const loadMessages = useCallback(async () => {
    if (!params.id) return;
    setLoadingMessages(true);
    const r = await fetch(`/api/crm/leads/${params.id}/messages`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.ok) {
      const d = await r.json() as { messages: CrmMessage[] };
      setMessages((d.messages || []).slice().reverse());
      setTimeout(() => smsThreadRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 100);
    }
    setLoadingMessages(false);
  }, [params.id]);

  useEffect(() => {
    if (activeTab === "sms") loadMessages();
  }, [activeTab, loadMessages]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const callLead = async () => {
    setCallingLead(true);
    const r = await fetch(`/api/crm/leads/${params.id}/call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    });
    const d = await r.json() as { error?: string };
    if (r.ok) {
      showToast("Bridge call initiated — your phone will ring shortly.", "info");
      setOpenModal(null);
      load();
    } else {
      showToast(d.error ?? "Failed to initiate call", "error");
    }
    setCallingLead(false);
  };

  const sendSms = async () => {
    if (!smsBody.trim() || !lead) return;
    setSendingSms(true);
    const r = await fetch(`/api/crm/leads/${params.id}/sms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: smsBody.trim() }),
    });
    const d = await r.json() as { error?: string };
    if (r.ok) {
      setSmsBody("");
      showToast(`SMS sent to ${lead.name}`);
      setOpenModal(null);
      loadMessages();
    } else {
      showToast(d.error ?? "Failed to send SMS", "error");
    }
    setSendingSms(false);
  };

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    const r = await fetch(`/api/crm/leads/${params.id}/notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText }),
    });
    if (r.ok) {
      setNoteText("");
      showToast("Note saved");
      setOpenModal(null);
      load();
    } else {
      showToast("Failed to save note", "error");
    }
    setAddingNote(false);
  };

  const addTask = async () => {
    if (!taskForm.title) return;
    setAddingTask(true);
    const r = await fetch(`/api/crm/leads/${params.id}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(taskForm),
    });
    if (r.ok) {
      setTaskForm({ type:"Follow Up", title:"", description:"", dueDate:"" });
      setShowTaskForm(false);
      showToast("Task created");
      setOpenModal(null);
      load();
    } else {
      showToast("Failed to create task", "error");
    }
    setAddingTask(false);
  };

  const sendEmail = async () => {
    if (!emailSubject || !emailBody) return;
    setSendingEmail(true);
    const r = await fetch(`/api/crm/leads/${params.id}/email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subject: emailSubject, body: emailBody, testMode: emailTestMode }),
    });
    if (r.ok) {
      const d = await r.json() as { testMode: boolean };
      showToast(d.testMode ? "Email logged (test mode — not sent externally)" : "Email sent!", "info");
      setEmailSubject("");
      setEmailBody("");
      setOpenModal(null);
      load();
    } else {
      showToast("Failed to send email", "error");
    }
    setSendingEmail(false);
  };

  const quickUpdateStatus = async (newStatus: string) => {
    if (!lead || newStatus === lead.status) { setOpenModal(null); return; }
    setUpdatingStatus(true);
    const r = await fetch(`/api/crm/leads/${params.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (r.ok) {
      showToast(`Status → ${newStatus}`);
      setOpenModal(null);
      load();
    } else {
      showToast("Failed to update status", "error");
    }
    setUpdatingStatus(false);
  };

  const saveField = async (updates: Record<string,unknown>) => {
    setSaving(true);
    await fetch(`/api/crm/leads/${params.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    setSaving(false);
    load();
  };

  const completeTask = async (taskId: number) => {
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    load();
  };

  const deleteTask = async (taskId: number) => {
    await fetch(`/api/crm/tasks/${taskId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  if (!lead) return <CrmLayout><div className="p-8 text-center text-muted-foreground">Lead not found.</div></CrmLayout>;

  const pendingTasks = tasks.filter(t => t.status !== "completed");

  return (
    <CrmLayout>
      {/* ── Toast Container ───────────────────────────────────────────────── */}
      <div className="fixed top-4 right-4 z-[60] space-y-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-xs
            ${t.type === "success" ? "bg-green-600 text-white" : t.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"}`}>
            {t.type === "success"
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : t.type === "error"
                ? <XCircle className="w-4 h-4 shrink-0" />
                : <AlertCircle className="w-4 h-4 shrink-0" />}
            {t.msg}
          </div>
        ))}
      </div>

      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Back */}
        <Link href="/admin/crm/leads">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Leads
          </button>
        </Link>

        {/* ── Contact Command Bar ───────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-5">
          <div className="flex items-stretch divide-x divide-gray-100">
            {/* Call */}
            <button
              onClick={() => setOpenModal("call")}
              disabled={!lead.phone}
              title={!lead.phone ? "No phone number on record" : "Initiate bridge call"}
              className="flex-1 flex flex-col items-center gap-1 px-3 py-3.5 hover:bg-green-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <PhoneCall className="w-4 h-4 text-green-600 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">Call</span>
            </button>
            {/* Text */}
            <button
              onClick={() => { setOpenModal("text"); loadMessages(); }}
              disabled={!lead.phone}
              title={!lead.phone ? "No phone number on record" : lead.smsOptOut ? "SMS opted out" : "Send SMS"}
              className="flex-1 flex flex-col items-center gap-1 px-3 py-3.5 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed group"
            >
              <MessageSquare className="w-4 h-4 text-blue-600 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">Text</span>
              {lead.smsOptOut && <span className="text-[9px] text-red-600 leading-none">Opted out</span>}
            </button>
            {/* Email */}
            <button
              onClick={() => setOpenModal("email")}
              className="flex-1 flex flex-col items-center gap-1 px-3 py-3.5 hover:bg-indigo-50 transition-colors group"
            >
              <Mail className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">Email</span>
            </button>
            {/* Note */}
            <button
              onClick={() => setOpenModal("note")}
              className="flex-1 flex flex-col items-center gap-1 px-3 py-3.5 hover:bg-yellow-50 transition-colors group"
            >
              <FileText className="w-4 h-4 text-yellow-600 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">Add Note</span>
            </button>
            {/* Task */}
            <button
              onClick={() => setOpenModal("task")}
              className="flex-1 flex flex-col items-center gap-1 px-3 py-3.5 hover:bg-purple-50 transition-colors group"
            >
              <Plus className="w-4 h-4 text-purple-600 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">Add Task</span>
            </button>
            {/* Status */}
            <button
              onClick={() => setOpenModal("status")}
              className="flex-1 flex flex-col items-center gap-1 px-3 py-3.5 hover:bg-orange-50 transition-colors group min-w-0"
            >
              <RefreshCw className="w-4 h-4 text-orange-500 group-hover:scale-110 transition-transform shrink-0" />
              <span className="text-xs font-medium text-foreground whitespace-nowrap">Status</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium leading-tight max-w-full truncate ${statusColor[lead.status] || "bg-gray-100 text-gray-600"}`}>
                {lead.status}
              </span>
            </button>
          </div>
        </div>

        {/* ── Main Grid ────────────────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Main panel */}
          <div className="space-y-5">
            {/* Lead header / contact card */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-serif font-bold text-foreground">{lead.name}</h1>
                  {lead.company && (
                    <p className="text-muted-foreground text-sm flex items-center gap-1 mt-0.5">
                      <Building className="w-3.5 h-3.5" />{lead.company}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor[lead.status] || "bg-gray-100 text-gray-600"}`}>
                    {lead.status}
                  </span>
                  <button
                    onClick={() => setOpenModal("status")}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors border border-gray-200 rounded-full px-2.5 py-1 hover:border-gray-300"
                  >
                    Change ↓
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 mt-4">
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="w-3.5 h-3.5 shrink-0" /> {lead.email}
                </a>
                {lead.phone && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                      <Phone className="w-3.5 h-3.5 shrink-0" /> {lead.phone}
                    </a>
                    {lead.smsOptOut && (
                      <span className="text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 font-medium">SMS opt-out</span>
                    )}
                  </div>
                )}
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                    <Globe className="w-3.5 h-3.5 shrink-0" /> {lead.website}
                  </a>
                )}
                {lead.nextFollowUpAt && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5 shrink-0" /> Follow-up: {new Date(lead.nextFollowUpAt).toLocaleDateString()}
                  </div>
                )}
              </div>

              {lead.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {lead.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-foreground/5 rounded-full text-muted-foreground border border-gray-200">
                      <Tag className="w-2.5 h-2.5" />{t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Sales Workspace */}
            <SalesWorkspace
              lead={lead}
              activities={activities}
              tasks={tasks}
              onReload={load}
            />

            {/* Tab panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex border-b border-gray-200 px-4 overflow-x-auto">
                {(["timeline","tasks","sms","email"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors -mb-px ${
                      activeTab === tab
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "timeline" ? "Activity Timeline"
                      : tab === "tasks" ? `Tasks${pendingTasks.length > 0 ? ` (${pendingTasks.length})` : ""}`
                      : tab === "sms" ? "📱 SMS & Calls"
                      : "Send Email"}
                  </button>
                ))}
              </div>

              {/* ── Timeline tab ─── */}
              {activeTab === "timeline" && (
                <div className="p-5">
                  <div className="mb-5">
                    <textarea
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                      rows={3}
                      placeholder="Add a note…"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                    />
                    <Button size="sm" className="mt-2" onClick={addNote} disabled={addingNote || !noteText.trim()}>
                      {addingNote ? "Saving…" : "Add Note"}
                    </Button>
                  </div>
                  {lead.notes && (
                    <div className="mb-5 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap">
                      {lead.notes}
                    </div>
                  )}
                  {activities.length === 0 ? (
                    <p className="text-center text-muted-foreground text-sm py-8">No activity yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {activities.map(a => (
                        <li key={a.id} className="flex gap-3">
                          <span className="text-base mt-0.5 shrink-0">{activityIcon[a.type] || "•"}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{a.title}</p>
                            {a.description && <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>}
                            <p className="text-xs text-muted-foreground/60 mt-1">{new Date(a.createdAt).toLocaleString()}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* ── Tasks tab ─── */}
              {activeTab === "tasks" && (
                <div className="p-5">
                  <Button size="sm" className="mb-4 gap-1.5" onClick={() => setShowTaskForm(v => !v)}>
                    <Plus className="w-3.5 h-3.5" /> Add Task
                  </Button>
                  {showTaskForm && (
                    <div className="mb-4 border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground block mb-1">Type</label>
                          <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={taskForm.type} onChange={e=>setTaskForm(f=>({...f,type:e.target.value}))}>
                            {TASK_TYPES.map(t=><option key={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-muted-foreground block mb-1">Due Date</label>
                          <input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={taskForm.dueDate} onChange={e=>setTaskForm(f=>({...f,dueDate:e.target.value}))} />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Title</label>
                        <input className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" placeholder="Task title" value={taskForm.title} onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-muted-foreground block mb-1">Description</label>
                        <textarea className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none" rows={2} placeholder="Optional details" value={taskForm.description} onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))} />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={addTask} disabled={addingTask||!taskForm.title}>{addingTask?"Saving…":"Save Task"}</Button>
                        <Button size="sm" variant="ghost" onClick={()=>setShowTaskForm(false)}>Cancel</Button>
                      </div>
                    </div>
                  )}
                  {tasks.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm py-8">
                      <p>No tasks yet.</p>
                      <p className="text-xs mt-1">Add a follow-up task to stay on track.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {tasks.map(task => (
                        <li key={task.id} className={`flex items-start gap-3 p-3 rounded-lg border ${task.status==="completed"?"border-gray-100 bg-gray-50 opacity-60":task.status==="overdue"?"border-red-100 bg-red-50":"border-gray-200 bg-white"}`}>
                          <button
                            onClick={() => task.status!=="completed" && completeTask(task.id)}
                            className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${task.status==="completed"?"bg-green-500 border-green-500":"border-gray-300 hover:border-green-500"}`}
                          >
                            {task.status==="completed"&&<Check className="w-3 h-3 text-white"/>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${task.status==="completed"?"line-through text-muted-foreground":"text-foreground"}`}>{task.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{task.type}</span>
                              {task.dueDate && (
                                <span className={`flex items-center gap-1 text-xs ${task.status==="overdue"?"text-red-600 font-medium":"text-muted-foreground"}`}>
                                  <Clock className="w-3 h-3"/>{new Date(task.dueDate).toLocaleDateString()}
                                  {task.status==="overdue"&&" · Overdue"}
                                </span>
                              )}
                            </div>
                          </div>
                          <button onClick={()=>deleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition-colors mt-0.5 shrink-0">
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* ── SMS & Calls tab ─── */}
              {activeTab === "sms" && (
                <div className="flex flex-col h-[520px]">
                  {lead.smsOptOut && (
                    <div className="mx-5 mt-4 flex items-center gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      SMS disabled: this lead has opted out of text messages.
                    </div>
                  )}
                  {!lead.smsConsent && !lead.smsOptOut && (
                    <div className="mx-5 mt-4 flex items-center gap-2 text-xs bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      No SMS consent recorded. Ensure you have permission before texting this lead.
                    </div>
                  )}
                  <div ref={smsThreadRef} className="flex-1 overflow-y-auto p-5 space-y-3">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center h-32">
                        <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center text-muted-foreground text-sm py-12">
                        {lead.phone ? "No messages yet. Send an SMS below." : "No phone number on record for this lead."}
                      </div>
                    ) : messages.map(m => {
                      const isOut = m.direction === "outbound";
                      const isCall = m.channel === "call";
                      return (
                        <div key={m.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm ${
                            isCall ? "bg-gray-100 text-gray-700 border border-gray-200 w-full"
                            : isOut ? "bg-foreground text-white"
                            : "bg-blue-50 border border-blue-200 text-foreground"
                          }`}>
                            {isCall ? (
                              <div className="flex items-center gap-2">
                                <Phone className={`w-3.5 h-3.5 shrink-0 ${m.callStatus==="completed"?"text-green-600":m.callStatus==="no-answer"||m.callStatus==="busy"||m.callStatus==="failed"?"text-red-500":"text-yellow-600"}`} />
                                <div>
                                  <p className="font-medium text-xs">{isOut?"Outbound":"Inbound"} Call — {m.callStatus ?? "initiated"}</p>
                                  {m.duration != null && <p className="text-xs opacity-70">{Math.floor(m.duration/60)}:{String(m.duration%60).padStart(2,"0")} duration</p>}
                                  {m.body && <p className="text-xs opacity-70 mt-0.5">{m.body}</p>}
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className="whitespace-pre-wrap">{m.body}</p>
                                {m.status && <p className={`text-[10px] mt-1 ${isOut?"text-white/60":"text-muted-foreground"}`}>{m.status}</p>}
                              </>
                            )}
                            <p className={`text-[10px] mt-1 ${isOut&&!isCall?"text-white/50":"text-muted-foreground/60"}`}>{new Date(m.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {lead.phone && !lead.smsOptOut && (
                    <div className="border-t border-gray-200 p-4 space-y-2">
                      <div className="flex gap-2">
                        <textarea
                          className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                          rows={3}
                          placeholder={`Text ${lead.name}…`}
                          value={smsBody}
                          onChange={e => setSmsBody(e.target.value)}
                          onKeyDown={e => { if (e.key==="Enter"&&(e.metaKey||e.ctrlKey)) sendSms(); }}
                        />
                        <div className="flex flex-col gap-2">
                          <Button size="sm" onClick={sendSms} disabled={sendingSms||!smsBody.trim()} className="gap-1.5 h-auto py-2">
                            <Send className="w-3.5 h-3.5"/>{sendingSms?"Sending…":"Send SMS"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={callLead} disabled={callingLead} className="gap-1.5 h-auto py-2 text-xs">
                            <PhoneCall className="w-3.5 h-3.5"/>{callingLead?"Calling…":"Bridge Call"}
                          </Button>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground">⌘+Enter to send · Bridge call routes through Twilio to your phone</p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Email tab ─── */}
              {activeTab === "email" && (
                <div className="p-5 space-y-4">
                  {emailTestMode && (
                    <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      Email test mode is enabled. Messages are logged but not sent externally.
                    </div>
                  )}
                  {templates.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Load Template</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        onChange={e => {
                          const t = templates.find(t => t.id === Number(e.target.value));
                          if (t) { setEmailSubject(t.subject.replace("{{name}}",lead.name)); setEmailBody(t.body.replace("{{name}}",lead.name.split(" ")[0])); }
                        }}
                        defaultValue=""
                      >
                        <option value="">— Select a template —</option>
                        {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">To</label>
                    <div className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-muted-foreground bg-gray-50">{lead.email}</div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Subject</label>
                    <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" placeholder="Email subject" value={emailSubject} onChange={e=>setEmailSubject(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Body</label>
                    <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none" rows={8} placeholder="Email body…" value={emailBody} onChange={e=>setEmailBody(e.target.value)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={emailTestMode} onChange={e=>setEmailTestMode(e.target.checked)} className="rounded" />
                      <span className="text-muted-foreground">Test Mode <span className="text-xs">(logs activity, doesn't send)</span></span>
                    </label>
                    <Button onClick={sendEmail} disabled={sendingEmail||!emailSubject||!emailBody} className="gap-1.5">
                      <Send className="w-3.5 h-3.5"/>{sendingEmail?"Sending…":emailTestMode?"Log Email (Test)":"Send Email"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar ───────────────────────────────────────────────────── */}
          <div className="space-y-4">

            {/* ── Lead Health Score ──────────────────────────────────────── */}
            {health && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif font-bold text-sm text-foreground">Lead Health</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${health.bgColor} ${health.color} ${health.borderColor}`}>
                    {health.badge}
                  </span>
                </div>

                {/* Score gauge */}
                <div>
                  <div className="flex items-end gap-2 mb-1.5">
                    <span className={`text-4xl font-bold leading-none ${health.color}`}>{health.score}</span>
                    <span className="text-sm text-muted-foreground mb-0.5">/ 100</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all ${health.barColor}`}
                      style={{ width: `${health.score}%` }}
                    />
                  </div>
                </div>

                {/* Reasons */}
                {health.reasons.length > 0 && (
                  <div className="space-y-1.5">
                    {health.reasons.map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs">
                        <span className={`shrink-0 mt-0.5 font-bold ${
                          r.type === "positive" ? "text-emerald-600" :
                          r.type === "warning"  ? "text-amber-500"  :
                          "text-red-500"
                        }`}>
                          {r.type === "positive" ? "✓" : r.type === "warning" ? "⚠" : "✗"}
                        </span>
                        <span className={
                          r.type === "positive" ? "text-emerald-700" :
                          r.type === "warning"  ? "text-amber-700"  :
                          "text-red-600"
                        }>{r.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommended action */}
                <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Recommended Action</p>
                  <p className="text-xs text-foreground font-medium">{health.action}</p>
                </div>
              </div>
            )}

            {/* ── Communication Intelligence ──────────────────────────────── */}
            {ciStats && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif font-bold text-sm text-foreground">Communication</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ciStats.engagementScore.bgColor} ${ciStats.engagementScore.color} ${ciStats.engagementScore.borderColor}`}>
                    {ciStats.status}
                  </span>
                </div>

                <div>
                  <div className="flex items-end gap-1.5 mb-1">
                    <span className={`text-3xl font-bold leading-none ${ciStats.engagementScore.color}`}>
                      {ciStats.engagementScore.score}
                    </span>
                    <span className="text-xs text-muted-foreground mb-0.5">/ 100 engagement</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full ${ciStats.engagementScore.barColor}`}
                      style={{ width: `${ciStats.engagementScore.score}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Response Rate</p>
                    <p className="text-sm font-bold text-foreground">{ciStats.responseRate.rate}%</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ciStats.responseRate.inboundCount} / {ciStats.responseRate.outboundCount} msgs
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Reply Risk</p>
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full border ${
                      ciStats.replyRisk === "Low"    ? "bg-green-50  text-green-700  border-green-200" :
                      ciStats.replyRisk === "Medium" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                                       "bg-red-50    text-red-700    border-red-200"
                    }`}>
                      {ciStats.replyRisk}
                    </span>
                  </div>
                </div>

                {ciStats.engagementScore.badge !== "Highly Engaged" && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5 border border-gray-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Badge</p>
                    <p className={`text-xs font-semibold ${ciStats.engagementScore.color}`}>
                      {ciStats.engagementScore.badge}
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Open <strong>Communications</strong> tab in Sales Workspace for full timeline.
                </p>
              </div>
            )}

            {/* ── Sales Intelligence ───────────────────────────────────────── */}
            {salesNBA && momentum && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif font-bold text-sm text-foreground">Sales Intelligence</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    salesNBA.priority === "critical" ? "bg-red-50 text-red-700 border-red-200" :
                    salesNBA.priority === "high"     ? "bg-orange-50 text-orange-700 border-orange-200" :
                    salesNBA.priority === "medium"   ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                                                       "bg-gray-50 text-gray-600 border-gray-200"
                  }`}>
                    {salesNBA.priority === "critical" ? "🚨 Critical" :
                     salesNBA.priority === "high"     ? "🔥 High"     :
                     salesNBA.priority === "medium"   ? "⚠️ Medium"   : "· Low"}
                  </span>
                </div>

                {/* Next Best Action */}
                <div className={`rounded-lg px-3 py-2.5 border ${
                  salesNBA.priority === "critical" ? "bg-red-50 border-red-200" :
                  salesNBA.priority === "high"     ? "bg-orange-50 border-orange-200" :
                  salesNBA.priority === "medium"   ? "bg-amber-50 border-amber-200" :
                                                     "bg-gray-50 border-gray-100"
                }`}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Next Best Action</p>
                  <p className="text-sm font-bold text-foreground mb-1">{salesNBA.action}</p>
                  <p className="text-xs text-muted-foreground leading-snug mb-1.5">{salesNBA.reason}</p>
                  <p className="text-[11px] font-medium text-foreground leading-snug">{salesNBA.expectedOutcome}</p>
                </div>

                {/* Confidence + Urgency */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Confidence</p>
                    <p className="text-sm font-bold text-foreground">{salesNBA.confidence}%</p>
                    <div className="h-1 w-full bg-gray-200 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-1 rounded-full ${
                          salesNBA.confidence >= 80 ? "bg-emerald-500" :
                          salesNBA.confidence >= 60 ? "bg-amber-400" : "bg-gray-400"
                        }`}
                        style={{ width: `${salesNBA.confidence}%` }}
                      />
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg px-2.5 py-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Urgency</p>
                    <span className={`text-xs font-semibold ${
                      salesNBA.urgency === "immediate" ? "text-red-600" :
                      salesNBA.urgency === "today"     ? "text-orange-600" :
                      salesNBA.urgency === "this-week" ? "text-amber-600" : "text-muted-foreground"
                    }`}>
                      {salesNBA.urgency === "immediate" ? "🚨 Immediate" :
                       salesNBA.urgency === "today"     ? "📅 Today" :
                       salesNBA.urgency === "this-week" ? "📆 This Week" : "· When Ready"}
                    </span>
                  </div>
                </div>

                {/* Lead Momentum */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Momentum</span>
                    <span className={`text-[10px] font-bold ${
                      momentum.trend === "rising"   ? "text-emerald-600" :
                      momentum.trend === "declining" ? "text-red-600"    : "text-muted-foreground"
                    }`}>
                      {momentum.trend === "rising" ? "↑ Rising" :
                       momentum.trend === "declining" ? "↓ Declining" : "→ Stable"}
                    </span>
                  </div>
                  <div className="flex items-end gap-2 mb-1">
                    <span className={`text-2xl font-bold leading-none ${
                      momentum.score >= 65 ? "text-emerald-600" :
                      momentum.score <= 35 ? "text-red-600"     : "text-amber-600"
                    }`}>{momentum.score}</span>
                    <span className="text-xs text-muted-foreground mb-0.5">/ 100</span>
                  </div>
                  <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mb-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        momentum.score >= 65 ? "bg-emerald-400" :
                        momentum.score <= 35 ? "bg-red-400"     : "bg-amber-400"
                      }`}
                      style={{ width: `${momentum.score}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{momentum.explanation}</p>
                </div>

                {/* Top signals */}
                {(momentum.positiveSignals.length > 0 || momentum.negativeSignals.length > 0) && (
                  <div className="space-y-1">
                    {momentum.positiveSignals.slice(0, 2).map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px]">
                        <span className="text-emerald-500 font-bold shrink-0">✓</span>
                        <span className="text-emerald-700">{s}</span>
                      </div>
                    ))}
                    {momentum.negativeSignals.slice(0, 2).map((s, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-[11px]">
                        <span className="text-red-500 font-bold shrink-0">✗</span>
                        <span className="text-red-600">{s}</span>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Open <strong>Intelligence</strong> tab in Sales Workspace for full breakdown.
                </p>
              </div>
            )}

            {/* ── DISC Behavioral Profile ──────────────────────────────────── */}
            {discProfile && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <h3 className="font-serif font-bold text-sm text-foreground">Behavioral Profile</h3>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${DISC_META[discProfile.primaryStyle].bgColor} ${DISC_META[discProfile.primaryStyle].textColor} ${DISC_META[discProfile.primaryStyle].borderColor}`}>
                    {DISC_META[discProfile.primaryStyle].emoji} {discProfile.primaryStyle}
                  </span>
                </div>

                {/* Primary + Secondary */}
                <div className="flex items-center gap-2">
                  <div className={`flex-1 rounded-lg p-2 text-center ${DISC_META[discProfile.primaryStyle].bgColor} ${DISC_META[discProfile.primaryStyle].borderColor} border`}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Primary</p>
                    <p className={`text-sm font-bold ${DISC_META[discProfile.primaryStyle].textColor}`}>
                      {DISC_META[discProfile.primaryStyle].emoji} {discProfile.primaryStyle}
                    </p>
                    <p className={`text-[10px] ${DISC_META[discProfile.primaryStyle].textColor} opacity-80`}>{DISC_META[discProfile.primaryStyle].shortDesc}</p>
                  </div>
                  <div className={`flex-1 rounded-lg p-2 text-center ${DISC_META[discProfile.secondaryStyle].bgColor} ${DISC_META[discProfile.secondaryStyle].borderColor} border opacity-80`}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Secondary</p>
                    <p className={`text-sm font-bold ${DISC_META[discProfile.secondaryStyle].textColor}`}>
                      {DISC_META[discProfile.secondaryStyle].emoji} {discProfile.secondaryStyle}
                    </p>
                    <p className={`text-[10px] ${DISC_META[discProfile.secondaryStyle].textColor} opacity-80`}>{DISC_META[discProfile.secondaryStyle].shortDesc}</p>
                  </div>
                </div>

                {/* Confidence */}
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Confidence</span>
                    <span className="text-[10px] font-bold text-foreground">{discProfile.confidence}%</span>
                  </div>
                  <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-1 rounded-full bg-gray-400 transition-all"
                      style={{ width: `${discProfile.confidence}%` }}
                    />
                  </div>
                </div>

                {/* Score bars */}
                <div className="space-y-1.5">
                  {(["Driver","Expressive","Amiable","Analytical"] as const).map(style => {
                    const key = style.toLowerCase() as "driver"|"expressive"|"amiable"|"analytical";
                    const pct = discProfile.normalized[key];
                    const meta = DISC_META[style];
                    return (
                      <div key={style} className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium w-16 shrink-0 ${meta.textColor}`}>{meta.emoji} {style}</span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-1.5 rounded-full ${meta.barColor} transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-7 text-right shrink-0">{pct}%</span>
                      </div>
                    );
                  })}
                </div>

                {/* Top reasons */}
                {discProfile.reasons.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground">Signals detected</p>
                    {discProfile.reasons.slice(0, 4).map((r, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className={`text-[10px] font-bold shrink-0 ${DISC_META[r.style].textColor}`}>{DISC_META[r.style].emoji}</span>
                        <p className="text-[10px] text-muted-foreground leading-snug">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggested approach */}
                <div className={`rounded-lg p-2.5 border ${DISC_META[discProfile.primaryStyle].bgColor} ${DISC_META[discProfile.primaryStyle].borderColor}`}>
                  <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mb-1">Suggested Approach</p>
                  <p className={`text-xs font-medium leading-snug ${DISC_META[discProfile.primaryStyle].textColor}`}>
                    {discProfile.communicationProfile.approach}
                  </p>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Based on activities and lead fields. More signals improve accuracy.
                </p>
              </div>
            )}

            {/* Lead management */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
              <h3 className="font-serif font-bold text-sm text-foreground">Lead Management</h3>
              {([
                { label:"Status", value:editStatus, onChange:setEditStatus, options:STATUSES },
                { label:"Priority", value:editPriority, onChange:setEditPriority, options:PRIORITIES },
                { label:"Assigned To", value:editAssigned, onChange:setEditAssigned, options:TEAM },
              ] as const).map(({ label, value, onChange, options }) => (
                <div key={label}>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                    value={value}
                    onChange={e => (onChange as (v: string) => void)(e.target.value)}
                  >
                    {options.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Next Follow-up</label>
                <input type="date" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={editFollowUp} onChange={e=>setEditFollowUp(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Est. Value ($)</label>
                <input type="number" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" placeholder="0.00" value={editEstValue} onChange={e=>setEditEstValue(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Package Type</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={editPackage} onChange={e=>setEditPackage(e.target.value)}>
                  <option value="">— None —</option>
                  <option>Essential Presence</option>
                  <option>Lead Generation Website</option>
                  <option>Growth Platform</option>
                  <option>CRM System</option>
                  <option>Business Automation</option>
                  <option>Custom</option>
                </select>
              </div>
              <Button
                className="w-full"
                disabled={saving}
                onClick={() => saveField({
                  status: editStatus, priority: editPriority,
                  assignedTo: editAssigned !== "Unassigned" ? editAssigned : null,
                  nextFollowUpAt: editFollowUp || null,
                  estimatedValue: editEstValue || null,
                  packageType: editPackage || null,
                })}
              >
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>

            {/* Pipeline docs */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
              <h3 className="font-serif font-bold text-sm text-foreground">Pipeline Docs</h3>
              {[
                { label:"Discovery Form", key:"discoveryFormStatus", value:lead.discoveryFormStatus },
                { label:"Proposal", key:"proposalStatus", value:lead.proposalStatus },
                { label:"Scope of Work", key:"sowStatus", value:lead.sowStatus },
              ].map(({ label, key, value }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <select
                    className="text-xs px-2 py-1 border border-gray-200 rounded-md focus:outline-none"
                    value={value}
                    onChange={e => saveField({ [key]: e.target.value })}
                  >
                    {["Not Started","In Progress","Sent","Completed","Rejected"].map(s=><option key={s}>{s}</option>)}
                  </select>
                </div>
              ))}
              {lead.discoverySubmissionId && (
                <Link href={`/admin/submissions/${lead.discoverySubmissionId}`}>
                  <Button variant="outline" size="sm" className="w-full text-xs mt-1">View Discovery Submission</Button>
                </Link>
              )}
            </div>

            {/* Lead info */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <h3 className="font-serif font-bold text-sm text-foreground mb-3">Lead Info</h3>
              <dl className="space-y-2 text-xs">
                <div className="flex justify-between"><dt className="text-muted-foreground">Source</dt><dd className="font-medium text-foreground">{lead.source}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Service</dt><dd className="font-medium text-foreground text-right">{lead.serviceInterest||"—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Last Contacted</dt><dd className="font-medium text-foreground">{lead.lastContactedAt?new Date(lead.lastContactedAt).toLocaleDateString():"—"}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">Created</dt><dd className="font-medium text-foreground">{new Date(lead.createdAt).toLocaleDateString()}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* Modals                                                              */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ── Call Modal ─── */}
      <Modal open={openModal === "call"} onClose={() => setOpenModal(null)} title="📞 Initiate Bridge Call">
        <div className="px-5 py-4 space-y-4">
          {!lead.phone ? (
            <div className="flex items-start gap-2.5 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>No phone number on record. Add one in Lead Management to enable calling.</span>
            </div>
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100">
                <p className="text-xs text-muted-foreground mb-1">Calling</p>
                <p className="font-semibold text-foreground text-lg">{lead.name}</p>
                <a href={`tel:${lead.phone}`} className="text-sm text-blue-600">{lead.phone}</a>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Twilio will call your forwarding number first, then bridge you to {lead.name}.
              </p>
            </>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setOpenModal(null)}>Cancel</Button>
            {lead.phone && (
              <Button className="flex-1 gap-2" onClick={callLead} disabled={callingLead}>
                <PhoneCall className="w-3.5 h-3.5" />
                {callingLead ? "Initiating…" : "Start Call"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── SMS Modal ─── */}
      <Modal open={openModal === "text"} onClose={() => setOpenModal(null)} title="💬 Send SMS">
        <div className="px-5 py-4 space-y-3">
          {!lead.phone ? (
            <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              No phone number on record for this lead.
            </div>
          ) : lead.smsOptOut ? (
            <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              SMS disabled: this lead has opted out of text messages.
            </div>
          ) : (
            <>
              {!lead.smsConsent && (
                <div className="flex items-center gap-2 text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  No SMS consent recorded. Ensure you have permission.
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                To: <span className="font-medium text-foreground">{lead.name} ({lead.phone})</span>
              </p>
              <textarea
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                rows={4}
                placeholder={`Message ${lead.name}…`}
                value={smsBody}
                onChange={e => setSmsBody(e.target.value)}
                autoFocus
              />
              <p className="text-[10px] text-muted-foreground">{smsBody.length} chars</p>
            </>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setOpenModal(null)}>Cancel</Button>
            {lead.phone && !lead.smsOptOut && (
              <Button className="flex-1 gap-2" onClick={sendSms} disabled={sendingSms || !smsBody.trim()}>
                <Send className="w-3.5 h-3.5" />
                {sendingSms ? "Sending…" : "Send SMS"}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── Email Modal ─── */}
      <Modal open={openModal === "email"} onClose={() => setOpenModal(null)} title="✉️ Send Email">
        <div className="px-5 py-4 space-y-3">
          {emailTestMode && (
            <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              Email test mode is enabled. Message may not be sent externally.
            </div>
          )}
          {templates.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Template</label>
              <select
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                onChange={e => {
                  const t = templates.find(t => t.id === Number(e.target.value));
                  if (t) { setEmailSubject(t.subject.replace("{{name}}",lead.name)); setEmailBody(t.body.replace("{{name}}",lead.name.split(" ")[0])); }
                }}
                defaultValue=""
              >
                <option value="">— Select a template —</option>
                {templates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">To: <span className="font-medium text-foreground">{lead.email}</span></p>
          <input
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
            placeholder="Subject"
            value={emailSubject}
            onChange={e => setEmailSubject(e.target.value)}
            autoFocus
          />
          <textarea
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
            rows={6}
            placeholder="Email body…"
            value={emailBody}
            onChange={e => setEmailBody(e.target.value)}
          />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={emailTestMode} onChange={e => setEmailTestMode(e.target.checked)} className="rounded" />
            <span className="text-muted-foreground">Test mode — log only, don't send externally</span>
          </label>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setOpenModal(null)}>Cancel</Button>
            <Button className="flex-1 gap-2" onClick={sendEmail} disabled={sendingEmail || !emailSubject || !emailBody}>
              <Send className="w-3.5 h-3.5" />
              {sendingEmail ? "Sending…" : emailTestMode ? "Log (Test)" : "Send Email"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Note Modal ─── */}
      <Modal open={openModal === "note"} onClose={() => setOpenModal(null)} title="📝 Add Note">
        <div className="px-5 py-4 space-y-3">
          <textarea
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
            rows={5}
            placeholder="Write a note about this lead…"
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpenModal(null)}>Cancel</Button>
            <Button className="flex-1" onClick={addNote} disabled={addingNote || !noteText.trim()}>
              {addingNote ? "Saving…" : "Save Note"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Task Modal ─── */}
      <Modal open={openModal === "task"} onClose={() => setOpenModal(null)} title="✅ Add Task">
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Type</label>
              <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" value={taskForm.type} onChange={e=>setTaskForm(f=>({...f,type:e.target.value}))}>
                {TASK_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Due Date</label>
              <input type="date" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none" value={taskForm.dueDate} onChange={e=>setTaskForm(f=>({...f,dueDate:e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Title <span className="text-red-500">*</span></label>
            <input
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Task title"
              value={taskForm.title}
              onChange={e=>setTaskForm(f=>({...f,title:e.target.value}))}
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
            <textarea
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-foreground/20"
              rows={2}
              placeholder="Optional details"
              value={taskForm.description}
              onChange={e=>setTaskForm(f=>({...f,description:e.target.value}))}
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setOpenModal(null)}>Cancel</Button>
            <Button className="flex-1" onClick={addTask} disabled={addingTask || !taskForm.title}>
              {addingTask ? "Saving…" : "Create Task"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Status Modal ─── */}
      <Modal open={openModal === "status"} onClose={() => setOpenModal(null)} title="🔄 Update Status">
        <div className="px-5 py-4">
          <p className="text-xs text-muted-foreground mb-3">
            Current:&nbsp;
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[lead.status] || "bg-gray-100 text-gray-600"}`}>
              {lead.status}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => quickUpdateStatus(s)}
                disabled={updatingStatus}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border text-left disabled:opacity-60
                  ${lead.status === s
                    ? `${statusBtnColor[s] || "border-gray-200 bg-gray-50 text-gray-700"} ring-2 ring-offset-1 ring-foreground/20`
                    : `${statusBtnColor[s] || "border-gray-200 bg-gray-50 text-gray-700"} opacity-75 hover:opacity-100`
                  }`}
              >
                {lead.status === s ? `● ${s}` : s}
              </button>
            ))}
          </div>
          <Button variant="outline" className="w-full mt-3" onClick={() => setOpenModal(null)}>Cancel</Button>
        </div>
      </Modal>

    </CrmLayout>
  );
}
