import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Plus, X, Trash2, Edit2, Check, Calendar, User, ClipboardList, ExternalLink, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROJECT_STAGES, PROJECT_STAGE_STYLES, PROJECT_TYPES, type ProjectStage } from "@/lib/crmTaxonomy";

const token = () => localStorage.getItem("adminToken") || "";

function fmt(n: number | string | null | undefined) {
  if (n == null || n === "") return null;
  const v = Number(n);
  if (isNaN(v)) return null;
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v.toLocaleString()}`;
}

interface ChecklistItem { label: string; done: boolean; }
interface ProjectLink { label: string; url: string; }

interface Project {
  id: number;
  name: string;
  projectType?: string | null;
  stage: string;
  budget?: string | null;
  startDate?: string | null;
  targetLaunchDate?: string | null;
  assignedTo?: string | null;
  notes?: string | null;
  proposalLink?: string | null;
  discoveryFormLink?: string | null;
  maintenancePlan?: string | null;
  launchChecklist?: ChecklistItem[];
  links?: ProjectLink[];
  leadId?: number | null;
  leadName?: string | null;
  dealId?: number | null;
  taskTotal?: number;
  taskDone?: number;
  createdAt: string;
}

interface Task {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  type: string;
}

interface Lead { id: number; name: string; serviceInterest?: string | null; }

interface CreateForm {
  name: string; projectType: string; stage: ProjectStage; budget: string;
  startDate: string; targetLaunchDate: string; assignedTo: string;
  leadId: string; notes: string; generateTasks: boolean;
}

const emptyForm: CreateForm = {
  name: "", projectType: "", stage: "New Lead", budget: "",
  startDate: "", targetLaunchDate: "", assignedTo: "",
  leadId: "", notes: "", generateTasks: true,
};

function ProjectCard({ project, onDragStart, onOpen }: {
  project: Project;
  onDragStart: (id: number) => void;
  onOpen: (project: Project) => void;
}) {
  const col = PROJECT_STAGE_STYLES[project.stage as ProjectStage] || PROJECT_STAGE_STYLES["New Lead"];
  const budget = fmt(project.budget);
  const pct = project.taskTotal ? Math.round(((project.taskDone || 0) / project.taskTotal) * 100) : 0;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(project.id)}
      onClick={() => onOpen(project)}
      className="bg-white rounded-xl border border-gray-200 shadow-sm p-3.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-semibold text-sm text-foreground leading-snug flex-1">{project.name}</p>
      </div>
      {project.projectType && (
        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${col.bg} ${col.text} mb-2`}>
          {project.projectType}
        </span>
      )}
      {budget && <p className="text-base font-bold text-foreground mb-2">{budget}</p>}

      <div className="space-y-1">
        {project.leadName && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <User className="w-3 h-3 shrink-0" />
            <span className="truncate">{project.leadName}</span>
          </div>
        )}
        {project.targetLaunchDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3 shrink-0" />
            <span>Launch {new Date(project.targetLaunchDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          </div>
        )}
      </div>

      {!!project.taskTotal && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
            <span className="flex items-center gap-1"><ClipboardList className="w-3 h-3" /> Tasks</span>
            <span>{project.taskDone}/{project.taskTotal}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: col.accent }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrmProjectsPage() {
  const [, navigate] = useLocation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ProjectStage | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setLoading(true);
    const [pRes, lRes] = await Promise.all([
      fetch("/api/crm/projects", { headers: { Authorization: `Bearer ${token()}` } }),
      fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } }),
    ]);
    if (pRes.status === 401) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    const pData = await pRes.json() as { projects: Project[] };
    const lData = await lRes.json() as { leads: Lead[] };
    setProjects(pData.projects || []);
    setLeads(lData.leads || []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const openCreate = (stage: ProjectStage = "New Lead") => {
    setForm({ ...emptyForm, stage });
    setFormError("");
    setShowCreate(true);
  };

  const saveProject = async () => {
    if (!form.name.trim()) { setFormError("Project name is required."); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError("");
    try {
      const body = {
        name: form.name.trim(),
        projectType: form.projectType || null,
        stage: form.stage,
        budget: form.budget || null,
        startDate: form.startDate || null,
        targetLaunchDate: form.targetLaunchDate || null,
        assignedTo: form.assignedTo || null,
        leadId: form.leadId ? Number(form.leadId) : null,
        notes: form.notes || null,
        generateTasks: form.generateTasks,
      };
      const res = await fetch("/api/crm/projects", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string };
        setFormError(d.error || "Failed to create project.");
      } else {
        setShowCreate(false);
        setForm(emptyForm);
        load();
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDrop = async (targetStage: ProjectStage) => {
    if (dragId === null) return;
    const project = projects.find(p => p.id === dragId);
    if (!project || project.stage === targetStage) { setDragId(null); setDragOverStage(null); return; }
    setProjects(prev => prev.map(p => p.id === dragId ? { ...p, stage: targetStage } : p));
    const id = dragId;
    setDragId(null);
    setDragOverStage(null);
    await fetch(`/api/crm/projects/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ stage: targetStage }),
    }).catch(() => load());
  };

  const columnProjects = (stage: ProjectStage) => projects.filter(p => p.stage === stage);

  // Prefill project type from linked lead's service interest
  const onPickLead = (leadId: string) => {
    const lead = leads.find(l => String(l.id) === leadId);
    setForm(f => ({
      ...f,
      leadId,
      name: f.name || (lead ? `${lead.serviceInterest || "Project"} — ${lead.name}` : f.name),
      projectType: f.projectType || (lead?.serviceInterest && (PROJECT_TYPES as readonly string[]).includes(lead.serviceInterest) ? lead.serviceInterest : f.projectType),
    }));
  };

  return (
    <CrmLayout>
      <div className="flex flex-col h-[calc(100vh-48px)]">
        <div className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center gap-3 shrink-0">
          <div>
            <h1 className="font-bold text-foreground">Project Pipeline</h1>
            <p className="text-xs text-muted-foreground">Track delivery from kickoff to launch and maintenance.</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {projects.length} project{projects.length !== 1 ? "s" : ""} across {PROJECT_STAGES.length} stages
            </p>
          </div>
          <div className="ml-auto">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => openCreate()}>
              <Plus className="w-3.5 h-3.5" /> New Project
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex gap-4 p-5 overflow-x-auto">
            {PROJECT_STAGES.slice(0, 6).map(s => (
              <div key={s} className="w-64 shrink-0 bg-gray-100 rounded-xl animate-pulse h-48" />
            ))}
          </div>
        ) : (
          <div className="flex-1 flex gap-4 p-5 overflow-x-auto overflow-y-hidden">
            {PROJECT_STAGES.map(stage => {
              const col = PROJECT_STAGE_STYLES[stage];
              const stageProjects = columnProjects(stage);
              const isDragOver = dragOverStage === stage;
              return (
                <div
                  key={stage}
                  className="w-64 shrink-0 rounded-xl flex flex-col transition-all"
                  onDragOver={e => { e.preventDefault(); setDragOverStage(stage); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverStage(null); }}
                  onDrop={() => handleDrop(stage)}
                >
                  <div className={`rounded-t-xl px-3 py-2.5 border ${col.border} ${col.bg} border-b-0`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.accent }} />
                        <span className={`text-xs font-bold ${col.text}`}>{stage}</span>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/60 ${col.text}`}>
                          {stageProjects.length}
                        </span>
                      </div>
                      <button
                        onClick={() => openCreate(stage)}
                        className={`w-5 h-5 flex items-center justify-center rounded ${col.text} hover:bg-white/50 transition-colors opacity-60 hover:opacity-100`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`flex-1 overflow-y-auto p-2 space-y-2 rounded-b-xl border border-t-0 ${col.border} transition-colors ${
                      isDragOver ? `${col.bg} opacity-80` : "bg-gray-50/80"
                    }`}
                    style={{ minHeight: "120px" }}
                  >
                    {stageProjects.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-20 text-center">
                        <p className="text-xs text-muted-foreground/50">No projects</p>
                        <button onClick={() => openCreate(stage)} className={`text-xs ${col.text} hover:opacity-80 mt-1`}>
                          + Add project
                        </button>
                      </div>
                    ) : (
                      stageProjects.map(project => (
                        <ProjectCard key={project.id} project={project} onDragStart={setDragId} onOpen={p => setDetailId(p.id)} />
                      ))
                    )}
                    {isDragOver && dragId !== null && (
                      <div className={`rounded-xl border-2 border-dashed ${col.border} h-16 flex items-center justify-center`}>
                        <p className={`text-xs ${col.text} opacity-60`}>Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <h2 className="font-semibold text-foreground">New Project</h2>
              <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {formError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Project Name *</label>
                <input
                  autoFocus value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormError(""); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                    formError && !form.name ? "border-red-300 focus:ring-red-200 bg-red-50" : "border-gray-200 focus:ring-foreground/20"
                  }`}
                  placeholder="e.g. Website Redesign — Acme Corp"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Project Type</label>
                  <select
                    value={form.projectType}
                    onChange={e => setForm(f => ({ ...f, projectType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                  >
                    <option value="">— Select type —</option>
                    {PROJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Stage</label>
                  <select
                    value={form.stage}
                    onChange={e => setForm(f => ({ ...f, stage: e.target.value as ProjectStage }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                  >
                    {PROJECT_STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Budget ($)</label>
                  <input type="number" min="0" value={form.budget}
                    onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Target Launch</label>
                  <input type="date" value={form.targetLaunchDate}
                    onChange={e => setForm(f => ({ ...f, targetLaunchDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Link to Lead / Client (optional)</label>
                <select value={form.leadId} onChange={e => onPickLead(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white">
                  <option value="">— No contact linked —</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Assigned To</label>
                <input value={form.assignedTo}
                  onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  placeholder="Team member" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
                <textarea rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                  placeholder="Optional notes…" />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={form.generateTasks}
                  onChange={e => setForm(f => ({ ...f, generateTasks: e.target.checked }))} />
                Auto-generate delivery tasks for this project type
              </label>
            </div>
            <div className="flex gap-2 px-5 pb-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1.5" onClick={saveProject} disabled={saving}>
                <Check className="w-3.5 h-3.5" />
                {saving ? "Creating…" : "Create Project"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {detailId !== null && (
        <ProjectDetailDrawer projectId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
      )}
    </CrmLayout>
  );
}

function ProjectDetailDrawer({ projectId, onClose, onChanged }: {
  projectId: number; onClose: () => void; onChanged: () => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState("");
  const [maintEdit, setMaintEdit] = useState(false);
  const [maintText, setMaintText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/crm/projects/${projectId}`, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await res.json() as { project: Project; tasks: Task[] };
    setProject(data.project);
    setTasks(data.tasks || []);
    setMaintText(data.project?.maintenancePlan || "");
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const patchProject = async (body: Record<string, unknown>) => {
    await fetch(`/api/crm/projects/${projectId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged();
  };

  const toggleTask = async (t: Task) => {
    const status = t.status === "completed" ? "pending" : "completed";
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status } : x));
    await fetch(`/api/crm/projects/${projectId}/tasks/${t.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onChanged();
  };

  const addTask = async () => {
    if (!newTask.trim()) return;
    const res = await fetch(`/api/crm/projects/${projectId}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTask.trim() }),
    });
    const data = await res.json() as { task: Task };
    setTasks(prev => [...prev, data.task]);
    setNewTask("");
    onChanged();
  };

  const deleteTask = async (id: number) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await fetch(`/api/crm/projects/${projectId}/tasks/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    onChanged();
  };

  const toggleChecklist = async (idx: number) => {
    if (!project) return;
    const list = (project.launchChecklist || []).map((c, i) => i === idx ? { ...c, done: !c.done } : c);
    setProject({ ...project, launchChecklist: list });
    await patchProject({ launchChecklist: list });
  };

  const deleteProject = async () => {
    if (!confirm("Delete this project and its tasks?")) return;
    await fetch(`/api/crm/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    onChanged();
    onClose();
  };

  const col = project ? (PROJECT_STAGE_STYLES[project.stage as ProjectStage] || PROJECT_STAGE_STYLES["New Lead"]) : PROJECT_STAGE_STYLES["New Lead"];
  const checklist = project?.launchChecklist || [];
  const checklistDone = checklist.filter(c => c.done).length;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {loading || !project ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className={`px-5 py-4 border-b border-gray-100 ${col.bg}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-foreground">{project.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/70 ${col.text}`}>{project.stage}</span>
                    {project.projectType && <span className="text-xs text-muted-foreground">{project.projectType}</span>}
                  </div>
                </div>
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Stage">
                  <select value={project.stage}
                    onChange={e => { setProject({ ...project, stage: e.target.value }); patchProject({ stage: e.target.value }); }}
                    className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none">
                    {PROJECT_STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Budget">{fmt(project.budget) || "—"}</Field>
                <Field label="Lead / Client">{project.leadName || "—"}</Field>
                <Field label="Assigned To">{project.assignedTo || "—"}</Field>
                <Field label="Start">{project.startDate || "—"}</Field>
                <Field label="Target Launch">{project.targetLaunchDate || "—"}</Field>
              </div>

              {(project.proposalLink || project.discoveryFormLink) && (
                <div className="flex flex-wrap gap-2">
                  {project.proposalLink && <LinkChip href={project.proposalLink} label="Proposal" />}
                  {project.discoveryFormLink && <LinkChip href={project.discoveryFormLink} label="Discovery" />}
                </div>
              )}

              {project.notes && (
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Notes</h3>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{project.notes}</p>
                </div>
              )}

              {/* Tasks */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" /> Tasks
                  </h3>
                  <span className="text-xs text-muted-foreground">{tasks.filter(t => t.status === "completed").length}/{tasks.length}</span>
                </div>
                <div className="space-y-1.5">
                  {tasks.map(t => (
                    <div key={t.id} className="flex items-center gap-2 group">
                      <button onClick={() => toggleTask(t)}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          t.status === "completed" ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 hover:border-emerald-400"
                        }`}>
                        {t.status === "completed" && <Check className="w-3 h-3" />}
                      </button>
                      <span className={`text-sm flex-1 ${t.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.title}</span>
                      <button onClick={() => deleteTask(t.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={newTask} onChange={e => setNewTask(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addTask(); }}
                    placeholder="Add a task…"
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                  <Button size="sm" variant="outline" onClick={addTask} className="gap-1"><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              </div>

              {/* Launch checklist */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Launch Checklist</h3>
                  <span className="text-xs text-muted-foreground">{checklistDone}/{checklist.length}</span>
                </div>
                <div className="space-y-1.5">
                  {checklist.map((c, i) => (
                    <button key={i} onClick={() => toggleChecklist(i)} className="flex items-center gap-2 w-full text-left">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        c.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-300 hover:border-emerald-400"
                      }`}>
                        {c.done && <Check className="w-3 h-3" />}
                      </span>
                      <span className={`text-sm ${c.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Maintenance plan */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" /> Maintenance Plan
                  </h3>
                  {!maintEdit && (
                    <button onClick={() => setMaintEdit(true)} className="text-muted-foreground hover:text-foreground"><Edit2 className="w-3 h-3" /></button>
                  )}
                </div>
                {maintEdit ? (
                  <div className="space-y-2">
                    <textarea rows={3} value={maintText} onChange={e => setMaintText(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                      placeholder="e.g. Monthly backups, plugin updates, 2h support/month…" />
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        onClick={async () => { await patchProject({ maintenancePlan: maintText }); setProject({ ...project, maintenancePlan: maintText }); setMaintEdit(false); }}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setMaintText(project.maintenancePlan || ""); setMaintEdit(false); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{project.maintenancePlan || <span className="text-muted-foreground/60">No maintenance plan yet.</span>}</p>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <button onClick={deleteProject} className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Delete project
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-gray-200 text-foreground hover:bg-gray-50 transition">
      <ExternalLink className="w-3 h-3" /> {label}
    </a>
  );
}
