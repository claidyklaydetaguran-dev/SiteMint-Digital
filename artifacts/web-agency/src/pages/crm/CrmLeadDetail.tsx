import { useEffect, useState, useCallback } from "react";
import { useLocation, useParams, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Mail, Phone, MessageSquare, Globe, Building, Calendar, Tag,
  Plus, Check, Trash2, ChevronDown, Send, X, Clock,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

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

const activityIcon: Record<string,string> = {
  lead_created:"🟢",lead_imported:"📥",status_changed:"🔄",note_added:"📝",
  email_sent:"📧",task_created:"✅",task_completed:"🎯",follow_up_changed:"⏰",sms_attempted:"📱",
};

interface Lead {
  id:number; name:string; company?:string; phone?:string; email:string; website?:string;
  source:string; serviceInterest?:string; status:string; priority:string; assignedTo?:string;
  tags:string[]; lastContactedAt?:string; nextFollowUpAt?:string; notes?:string;
  estimatedValue?:string; packageType?:string; discoveryFormStatus:string;
  proposalStatus:string; sowStatus:string; createdAt:string; discoverySubmissionId?:number;
}
interface Activity { id:number; type:string; title:string; description?:string; createdAt:string; }
interface Task {
  id:number; leadId:number; type:string; title:string; description?:string;
  dueDate?:string; status:string; completedAt?:string; createdAt:string;
}

export default function CrmLeadDetail() {
  const params = useParams<{id:string}>();
  const [, navigate] = useLocation();
  const [lead, setLead] = useState<Lead|null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline"|"tasks"|"email">("timeline");

  // Edit state
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
  const [emailMsg, setEmailMsg] = useState("");

  const load = useCallback(async () => {
    if (!token()) { navigate("/admin"); return; }
    setLoading(true);
    const r = await fetch(`/api/crm/leads/${params.id}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 401) { navigate("/admin"); return; }
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
      .then(r => r.json()).then(d => setTemplates(d.templates || []));
  }, []);

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

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    await fetch(`/api/crm/leads/${params.id}/notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ note: noteText }),
    });
    setNoteText(""); setAddingNote(false); load();
  };

  const addTask = async () => {
    if (!taskForm.title) return;
    setAddingTask(true);
    await fetch(`/api/crm/leads/${params.id}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(taskForm),
    });
    setTaskForm({ type:"Follow Up", title:"", description:"", dueDate:"" });
    setShowTaskForm(false); setAddingTask(false); load();
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
    await fetch(`/api/crm/tasks/${taskId}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token()}` },
    });
    load();
  };

  const sendEmail = async () => {
    if (!emailSubject || !emailBody) return;
    setSendingEmail(true);
    const r = await fetch(`/api/crm/leads/${params.id}/email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subject: emailSubject, body: emailBody, testMode: emailTestMode }),
    });
    const d = await r.json() as { testMode: boolean };
    setEmailMsg(d.testMode ? "Logged as test (not sent). Toggle off Test Mode to send real emails." : "Email sent successfully!");
    setSendingEmail(false);
    load();
    setTimeout(() => setEmailMsg(""), 5000);
  };

  if (loading) return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  if (!lead) return <CrmLayout><div className="p-8 text-center text-muted-foreground">Lead not found.</div></CrmLayout>;

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        {/* Back */}
        <Link href="/admin/crm/leads">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Leads
          </button>
        </Link>

        <div className="grid lg:grid-cols-[1fr_300px] gap-5">
          {/* Main panel */}
          <div className="space-y-5">
            {/* Lead header */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-xl font-serif font-bold text-foreground">{lead.name}</h1>
                  {lead.company && <p className="text-muted-foreground text-sm flex items-center gap-1 mt-0.5"><Building className="w-3.5 h-3.5" />{lead.company}</p>}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor[lead.status]||"bg-gray-100 text-gray-600"}`}>{lead.status}</span>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 mt-4">
                <a href={`mailto:${lead.email}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="w-3.5 h-3.5 shrink-0" /> {lead.email}
                </a>
                {lead.phone && (
                  <div className="flex items-center gap-3">
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                      <Phone className="w-3.5 h-3.5 shrink-0" /> {lead.phone}
                    </a>
                    <a href={`sms:${lead.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-600 transition-colors" title="Send text message">
                      <MessageSquare className="w-3.5 h-3.5" /> Text
                    </a>
                  </div>
                )}
                {lead.website && <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
                  <Globe className="w-3.5 h-3.5 shrink-0" /> {lead.website}
                </a>}
                {lead.nextFollowUpAt && <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="w-3.5 h-3.5 shrink-0" /> Follow-up: {new Date(lead.nextFollowUpAt).toLocaleDateString()}
                </div>}
              </div>

              {lead.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {lead.tags.map(t => (
                    <span key={t} className="flex items-center gap-1 px-2 py-0.5 text-xs bg-foreground/8 rounded-full text-muted-foreground">
                      <Tag className="w-2.5 h-2.5" />{t}
                    </span>
                  ))}
                </div>
              )}

              {/* Quick actions */}
              <div className="flex gap-2 mt-4 flex-wrap">
                <a href={`mailto:${lead.email}`}>
                  <Button size="sm" variant="outline" className="gap-1.5"><Mail className="w-3.5 h-3.5" />Email</Button>
                </a>
                {lead.phone && <>
                  <a href={`tel:${lead.phone}`}>
                    <Button size="sm" variant="outline" className="gap-1.5"><Phone className="w-3.5 h-3.5" />Call</Button>
                  </a>
                  <a href={`sms:${lead.phone}`}>
                    <Button size="sm" variant="outline" className="gap-1.5"><MessageSquare className="w-3.5 h-3.5" />Text</Button>
                  </a>
                </>}
                <Button size="sm" className="gap-1.5 ml-auto" onClick={() => setActiveTab("email")}>
                  <Send className="w-3.5 h-3.5" /> Send Email via CRM
                </Button>
              </div>
            </div>

            {/* Tab panel */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="flex border-b border-gray-200 px-4">
                {(["timeline","tasks","email"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors -mb-px ${
                      activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "timeline" ? "Activity Timeline" : tab === "tasks" ? `Tasks (${tasks.filter(t=>t.status!=="completed").length})` : "Send Email"}
                  </button>
                ))}
              </div>

              {/* Timeline tab */}
              {activeTab === "timeline" && (
                <div className="p-5">
                  {/* Add note */}
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
                  {/* Notes display */}
                  {lead.notes && (
                    <div className="mb-5 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap">
                      {lead.notes}
                    </div>
                  )}
                  {/* Activity feed */}
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

              {/* Tasks tab */}
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
                          <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={taskForm.type} onChange={e => setTaskForm(f=>({...f,type:e.target.value}))}>
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
                    <p className="text-center text-muted-foreground text-sm py-8">No tasks yet. Add a follow-up task to stay on track.</p>
                  ) : (
                    <ul className="space-y-2">
                      {tasks.map(task => (
                        <li key={task.id} className={`flex items-start gap-3 p-3 rounded-lg border ${task.status==="completed"?"border-gray-100 bg-gray-50 opacity-60":task.status==="overdue"?"border-red-100 bg-red-50":"border-gray-200 bg-white"}`}>
                          <button onClick={() => task.status!=="completed" && completeTask(task.id)} className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${task.status==="completed"?"bg-green-500 border-green-500":"border-gray-300 hover:border-green-500"}`}>
                            {task.status==="completed"&&<Check className="w-3 h-3 text-white"/>}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium ${task.status==="completed"?"line-through text-muted-foreground":"text-foreground"}`}>{task.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{task.type}</span>
                              {task.dueDate && (
                                <span className={`flex items-center gap-1 text-xs ${task.status==="overdue"?"text-red-600 font-medium":"text-muted-foreground"}`}>
                                  <Clock className="w-3 h-3"/>{new Date(task.dueDate).toLocaleDateString()}
                                  {task.status==="overdue"&&" • Overdue"}
                                </span>
                              )}
                            </div>
                          </div>
                          <button onClick={()=>deleteTask(task.id)} className="text-gray-300 hover:text-red-500 transition-colors mt-0.5">
                            <Trash2 className="w-3.5 h-3.5"/>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Email tab */}
              {activeTab === "email" && (
                <div className="p-5 space-y-4">
                  {emailMsg && (
                    <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">{emailMsg}</div>
                  )}
                  {templates.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1">Load Template</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        onChange={e => {
                          const t = templates.find(t => t.id === Number(e.target.value));
                          if (t) { setEmailSubject(t.subject.replace("{{name}}", lead.name)); setEmailBody(t.body.replace("{{name}}", lead.name.split(" ")[0])); }
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
                      <Send className="w-3.5 h-3.5" />{sendingEmail?"Sending…":emailTestMode?"Log Email (Test)":"Send Email"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Lead management */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
              <h3 className="font-serif font-bold text-sm text-foreground">Lead Management</h3>

              {[
                { label:"Status", value:editStatus, onChange:setEditStatus, options:STATUSES },
                { label:"Priority", value:editPriority, onChange:setEditPriority, options:PRIORITIES },
                { label:"Assigned To", value:editAssigned, onChange:setEditAssigned, options:TEAM },
              ].map(({ label, value, onChange, options }) => (
                <div key={label}>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                    value={value}
                    onChange={e => onChange(e.target.value)}
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
                onClick={() => saveField({ status:editStatus, priority:editPriority, assignedTo:editAssigned!=="Unassigned"?editAssigned:null, nextFollowUpAt:editFollowUp||null, estimatedValue:editEstValue||null, packageType:editPackage||null })}
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
    </CrmLayout>
  );
}
