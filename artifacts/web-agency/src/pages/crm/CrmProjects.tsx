import { useEffect, useState, useCallback, useRef } from "react";
import { CrmLayout } from "./CrmLayout";
import { Plus, X, Trash2, Edit2, Check, Calendar, User, ClipboardList, ExternalLink, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROJECT_STAGES, PROJECT_STAGE_STYLES, PROJECT_TYPES, type ProjectStage } from "@/lib/crmTaxonomy";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, readAdminResource, responseFailureReason, failureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure, PageLoadFailures, countOf, dataOf, failedParts } from "@/components/crm/LoadState";

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

/** One project and its tasks, as the detail route returns them together. */
interface ProjectDetail { project: Project; tasks: Task[]; }

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

function pickProjects(body: unknown): Project[] | undefined {
  const list = body && typeof body === "object" ? (body as { projects?: unknown }).projects : undefined;
  return Array.isArray(list) ? list as Project[] : undefined;
}

function pickLeads(body: unknown): Lead[] | undefined {
  const list = body && typeof body === "object" ? (body as { leads?: unknown }).leads : undefined;
  return Array.isArray(list) ? list as Lead[] : undefined;
}

function pickDetail(body: unknown): ProjectDetail | undefined {
  if (!body || typeof body !== "object") return undefined;
  const { project, tasks } = body as { project?: unknown; tasks?: unknown };
  if (!project || typeof project !== "object") return undefined;
  // The route always answers with both. A body missing the task list is not an
  // empty checklist — it is an answer we did not understand.
  if (!Array.isArray(tasks)) return undefined;
  return { project: project as Project, tasks: tasks as Task[] };
}

function ProjectCard({ project, onDragStart, onOpen }: {
  project: Project;
  onDragStart: (id: number) => void;
  onOpen: (project: Project) => void;
}) {
  const col = PROJECT_STAGE_STYLES[project.stage as ProjectStage] || PROJECT_STAGE_STYLES["New Lead"];
  const budget = fmt(project.budget);
  // The bar only fills for a done count the server actually sent.
  const done = typeof project.taskDone === "number" ? project.taskDone : null;
  const pct = project.taskTotal && done !== null ? Math.round((done / project.taskTotal) * 100) : 0;
  return (
    <div
      draggable
      onDragStart={() => onDragStart(project.id)}
      onClick={() => onOpen(project)}
      className="bg-white rounded-xl border border-border shadow-sm p-3.5 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group select-none"
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="font-semibold text-sm text-foreground leading-snug flex-1 min-w-0 break-words">{project.name}</p>
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
            <span><Figure value={done} />/{project.taskTotal}</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: col.accent }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrmProjectsPage() {
  const [projects, setProjects] = useState<Load<Project[]>>({ status: "loading" });
  const [leads, setLeads] = useState<Load<Lead[]>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverStage, setDragOverStage] = useState<ProjectStage | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const savingRef = useRef(false);

  // Each part keeps what it last showed until its own new answer arrives, so a
  // retry never flashes the board back to empty — and a part that failed stays
  // a stated failure instead of becoming a zero.
  const load = useCallback(async () => {
    setReloading(true);
    const [nextProjects, nextLeads] = await Promise.all([
      readAdminResource("/api/crm/projects", pickProjects),
      readAdminResource("/api/crm/leads", pickLeads),
    ]);
    setProjects(nextProjects);
    setLeads(nextLeads);
    setReloading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateProjects = (fn: (list: Project[]) => Project[]) =>
    setProjects(prev => prev.status === "ready" ? { status: "ready", data: fn(prev.data) } : prev);

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
      const res = await adminFetch("/api/crm/projects", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setFormError(`The project was not created. ${await responseFailureReason(res)}`);
      } else {
        setShowCreate(false);
        setForm(emptyForm);
        void load();
      }
    } catch {
      setFormError(`The project was not created. ${failureReason(null)}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const projectList = dataOf(projects) ?? [];
  const leadList = dataOf(leads) ?? [];
  const projectCount = countOf(projects);

  const handleDrop = async (targetStage: ProjectStage) => {
    if (dragId === null) return;
    const project = projectList.find(p => p.id === dragId);
    if (!project || project.stage === targetStage) { setDragId(null); setDragOverStage(null); return; }
    updateProjects(list => list.map(p => p.id === dragId ? { ...p, stage: targetStage } : p));
    const id = dragId;
    setDragId(null);
    setDragOverStage(null);
    // A move the server refused must not keep sitting in its new column as
    // though it had been saved — re-read and show where the project really is.
    try {
      const res = await adminFetch(`/api/crm/projects/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) void load();
    } catch {
      void load();
    }
  };

  const columnProjects = (stage: ProjectStage) => projectList.filter(p => p.stage === stage);

  // Prefill project type from linked lead's service interest
  const onPickLead = (leadId: string) => {
    const lead = leadList.find(l => String(l.id) === leadId);
    setForm(f => ({
      ...f,
      leadId,
      name: f.name || (lead ? `${lead.serviceInterest || "Project"} — ${lead.name}` : f.name),
      projectType: f.projectType || (lead?.serviceInterest && (PROJECT_TYPES as readonly string[]).includes(lead.serviceInterest) ? lead.serviceInterest : f.projectType),
    }));
  };

  const failures = failedParts([
    ["Projects", projects],
    ["Contacts", leads],
  ]);

  return (
    <CrmLayout>
      <div className="flex flex-col h-[calc(100vh-48px)]">
        <div className="bg-white border-b border-border px-6 py-3.5 flex flex-wrap items-center gap-3 shrink-0">
          <div className="min-w-0">
            <h1 className="font-bold text-foreground">Project Pipeline</h1>
            <p className="text-xs text-muted-foreground">Track delivery from kickoff to launch and maintenance.</p>
            {/* The count is the list's own length or nothing at all. A failed
                request used to read here as "0 projects across 14 stages". */}
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              <Figure value={projectCount} loading={projects.status === "loading"} />
              {" "}project{projectCount === 1 ? "" : "s"} across {PROJECT_STAGES.length} stages
            </p>
          </div>
          <div className="ml-auto">
            <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={() => openCreate()}>
              <Plus className="w-3.5 h-3.5" /> New Project
            </Button>
          </div>
        </div>

        {failures.length > 0 && (
          <div className="px-5 pt-4 shrink-0">
            <PageLoadFailures failures={failures} onRetry={() => { void load(); }} retrying={reloading} />
          </div>
        )}

        {projects.status === "loading" ? (
          <div className="flex-1 flex gap-4 p-5 overflow-x-auto" role="status" aria-live="polite">
            <span className="sr-only">Loading projects…</span>
            {PROJECT_STAGES.slice(0, 6).map(s => (
              <div key={s} className="w-64 shrink-0 bg-muted rounded-xl animate-pulse h-48" />
            ))}
          </div>
        ) : projects.status === "error" ? (
          /* No board at all rather than fourteen columns of zeros. The reason
             and the Try again control are stated in the banner above. */
          <div className="flex-1 flex flex-col items-center justify-center gap-1 px-6 py-16 text-center">
            <p className="font-medium text-foreground">Projects could not be loaded, so none are listed here.</p>
            <p className="max-w-md break-words text-sm text-muted-foreground">
              The pipeline board is hidden rather than shown as empty. Use Try again above.
            </p>
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: col.accent }} />
                        <span className={`text-xs font-bold ${col.text} min-w-0 break-words`}>{stage}</span>
                        {/* Only ever rendered from a list that loaded. */}
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-white/60 ${col.text} shrink-0`}>
                          {stageProjects.length}
                        </span>
                      </div>
                      <button
                        onClick={() => openCreate(stage)}
                        aria-label={`Add a project in ${stage}`}
                        className={`w-5 h-5 flex items-center justify-center rounded shrink-0 ${col.text} hover:bg-white/50 transition-colors opacity-60 hover:opacity-100`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`flex-1 overflow-y-auto p-2 space-y-2 rounded-b-xl border border-t-0 ${col.border} transition-colors ${
                      isDragOver ? `${col.bg} opacity-80` : "bg-muted/80"
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 sticky top-0 bg-white">
              <h2 className="font-semibold text-foreground">New Project</h2>
              <button onClick={() => setShowCreate(false)} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {formError && (
                <p role="alert" className="min-w-0 break-words text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Project Name *</label>
                <input
                  autoFocus value={form.name}
                  onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setFormError(""); }}
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                    formError && !form.name ? "border-destructive/50 focus:ring-destructive/20 bg-destructive/5" : "border-input focus:ring-foreground/20"
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
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none bg-white"
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
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none bg-white"
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
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    placeholder="0" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Target Launch</label>
                  <input type="date" value={form.targetLaunchDate}
                    onChange={e => setForm(f => ({ ...f, targetLaunchDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Link to Lead / Client (optional)</label>
                {/* An empty contact list would say "you have no contacts". When
                    the request failed, say that instead. */}
                {leads.status === "error" ? (
                  <LoadFailure
                    variant="inline"
                    what="Contacts"
                    reason={leads.reason}
                    onRetry={() => { void load(); }}
                    retrying={reloading}
                  >
                    <p className="mt-1 min-w-0 break-words text-xs text-muted-foreground">
                      You can still create the project and link a contact later.
                    </p>
                  </LoadFailure>
                ) : (
                  <select value={form.leadId} onChange={e => onPickLead(e.target.value)}
                    disabled={leads.status === "loading"}
                    className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none bg-white disabled:opacity-60">
                    <option value="">{leads.status === "loading" ? "Loading contacts…" : "— No contact linked —"}</option>
                    {leadList.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Assigned To</label>
                <input value={form.assignedTo}
                  onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  placeholder="Team member" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
                <textarea rows={2} value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                  placeholder="Optional notes…" />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={form.generateTasks}
                  onChange={e => setForm(f => ({ ...f, generateTasks: e.target.checked }))} />
                Auto-generate delivery tasks for this project type
              </label>
            </div>
            <div className="flex flex-wrap gap-2 px-5 pb-5">
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
  const [detail, setDetail] = useState<Load<ProjectDetail>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [maintEdit, setMaintEdit] = useState(false);
  const [maintText, setMaintText] = useState("");

  const load = useCallback(async () => {
    setReloading(true);
    setDetail(await readAdminResource(`/api/crm/projects/${projectId}`, pickDetail));
    setReloading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const updateDetail = (fn: (d: ProjectDetail) => ProjectDetail) =>
    setDetail(prev => prev.status === "ready" ? { status: "ready", data: fn(prev.data) } : prev);

  /** Sends one change. A refusal re-reads, so nothing stays on screen as saved that was not. */
  const patchProject = async (body: Record<string, unknown>) => {
    let ok = false;
    try {
      const res = await adminFetch(`/api/crm/projects/${projectId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      ok = res.ok;
    } catch { ok = false; }
    onChanged();
    if (!ok) await load();
  };

  const toggleTask = async (t: Task) => {
    const status = t.status === "completed" ? "pending" : "completed";
    updateDetail(d => ({ ...d, tasks: d.tasks.map(x => x.id === t.id ? { ...x, status } : x) }));
    let ok = false;
    try {
      const res = await adminFetch(`/api/crm/projects/${projectId}/tasks/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      ok = res.ok;
    } catch { ok = false; }
    onChanged();
    if (!ok) await load();
  };

  const addTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    let ok = false;
    let added: Task | null = null;
    try {
      const res = await adminFetch(`/api/crm/projects/${projectId}/tasks`, {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      ok = res.ok;
      if (ok) {
        const body = await res.json().catch(() => null) as { task?: Task } | null;
        added = body?.task && typeof body.task.id === "number" ? body.task : null;
      }
    } catch { ok = false; }
    // Only a task the server actually returned joins the list; a refusal keeps
    // what was typed, and an answer we could not read re-reads the real list.
    if (added) {
      const task = added;
      updateDetail(d => ({ ...d, tasks: [...d.tasks, task] }));
      setNewTask("");
    } else {
      if (ok) setNewTask("");
      await load();
    }
    onChanged();
  };

  const deleteTask = async (id: number) => {
    updateDetail(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) }));
    let ok = false;
    try {
      ok = (await adminFetch(`/api/crm/projects/${projectId}/tasks/${id}`, { method: "DELETE" })).ok;
    } catch { ok = false; }
    onChanged();
    if (!ok) await load();
  };

  const toggleChecklist = async (idx: number, current: ChecklistItem[]) => {
    const list = current.map((c, i) => i === idx ? { ...c, done: !c.done } : c);
    updateDetail(d => ({ ...d, project: { ...d.project, launchChecklist: list } }));
    await patchProject({ launchChecklist: list });
  };

  const deleteProject = async () => {
    if (!confirm("Delete this project and its tasks?")) return;
    let ok = false;
    try {
      ok = (await adminFetch(`/api/crm/projects/${projectId}`, { method: "DELETE" })).ok;
    } catch { ok = false; }
    onChanged();
    // Closing on a refused delete would say it is gone. It is not.
    if (ok) onClose();
    else await load();
  };

  const project = detail.status === "ready" ? detail.data.project : null;
  const tasks = detail.status === "ready" ? detail.data.tasks : [];
  const col = project
    ? (PROJECT_STAGE_STYLES[project.stage as ProjectStage] || PROJECT_STAGE_STYLES["New Lead"])
    : PROJECT_STAGE_STYLES["New Lead"];
  const checklist = project?.launchChecklist || [];
  const checklistDone = checklist.filter(c => c.done).length;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        {detail.status === "loading" ? (
          <div className="flex items-center justify-center h-64" role="status">
            <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            <span className="sr-only">Loading this project…</span>
          </div>
        ) : detail.status === "error" || !project ? (
          /* This used to spin forever: the body was read without checking the
             answer, so a refusal left the drawer "loading" for good, and the
             task and checklist tallies behind it would have read 0/0. */
          <div className="p-5">
            <div className="flex justify-end">
              <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <LoadFailure
              what="This project"
              reason={detail.status === "error" ? detail.reason : failureReason(null)}
              onRetry={() => { void load(); }}
              retrying={reloading}
            />
          </div>
        ) : (
          <>
            <div className={`px-5 py-4 border-b border-border/60 ${col.bg}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-bold text-foreground min-w-0 break-words">{project.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/70 ${col.text}`}>{project.stage}</span>
                    {project.projectType && <span className="text-xs text-muted-foreground">{project.projectType}</span>}
                  </div>
                </div>
                <button onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-4 h-4" /></button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Stage">
                  <select value={project.stage}
                    onChange={e => {
                      const stage = e.target.value;
                      updateDetail(d => ({ ...d, project: { ...d.project, stage } }));
                      void patchProject({ stage });
                    }}
                    className="w-full px-2 py-1.5 border border-input rounded-lg text-sm bg-white focus:outline-none">
                    {PROJECT_STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Budget"><Figure value={fmt(project.budget)} /></Field>
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
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{project.notes}</p>
                </div>
              )}

              {/* Tasks */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ClipboardList className="w-3.5 h-3.5" /> Tasks
                  </h3>
                  {/* Counted from a list that loaded, never from an empty one
                      standing in for a failed request. */}
                  <span className="text-xs text-muted-foreground shrink-0">{tasks.filter(t => t.status === "completed").length}/{tasks.length}</span>
                </div>
                <div className="space-y-1.5">
                  {tasks.map(t => (
                    <div key={t.id} className="flex items-center gap-2 group">
                      <button onClick={() => { void toggleTask(t); }}
                        aria-label={t.status === "completed" ? `Mark ${t.title} not done` : `Mark ${t.title} done`}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          t.status === "completed" ? "bg-emerald-500 border-emerald-500 text-white" : "border-card-border hover:border-emerald-400"
                        }`}>
                        {t.status === "completed" && <Check className="w-3 h-3" />}
                      </button>
                      <span className={`text-sm flex-1 min-w-0 break-words ${t.status === "completed" ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.title}</span>
                      <button onClick={() => { void deleteTask(t.id); }} aria-label={`Delete ${t.title}`}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={newTask} onChange={e => setNewTask(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void addTask(); }}
                    placeholder="Add a task…"
                    aria-label="Add a task"
                    className="flex-1 min-w-0 px-3 py-1.5 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20" />
                  <Button size="sm" variant="outline" onClick={() => { void addTask(); }} aria-label="Add task" className="gap-1 shrink-0"><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              </div>

              {/* Launch checklist */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Launch Checklist</h3>
                  <span className="text-xs text-muted-foreground shrink-0">{checklistDone}/{checklist.length}</span>
                </div>
                <div className="space-y-1.5">
                  {checklist.map((c, i) => (
                    <button key={i} onClick={() => { void toggleChecklist(i, checklist); }} className="flex items-center gap-2 w-full text-left">
                      <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        c.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-card-border hover:border-emerald-400"
                      }`}>
                        {c.done && <Check className="w-3 h-3" />}
                      </span>
                      <span className={`text-sm min-w-0 break-words ${c.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Maintenance plan */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" /> Maintenance Plan
                  </h3>
                  {!maintEdit && (
                    <button onClick={() => { setMaintText(project.maintenancePlan || ""); setMaintEdit(true); }}
                      aria-label="Edit maintenance plan"
                      className="text-muted-foreground hover:text-foreground shrink-0"><Edit2 className="w-3 h-3" /></button>
                  )}
                </div>
                {maintEdit ? (
                  <div className="space-y-2">
                    <textarea rows={3} value={maintText} onChange={e => setMaintText(e.target.value)}
                      aria-label="Maintenance plan"
                      className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 resize-none"
                      placeholder="e.g. Monthly backups, plugin updates, 2h support/month…" />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        onClick={() => {
                          const text = maintText;
                          updateDetail(d => ({ ...d, project: { ...d.project, maintenancePlan: text } }));
                          setMaintEdit(false);
                          void patchProject({ maintenancePlan: text });
                        }}>
                        Save
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setMaintText(project.maintenancePlan || ""); setMaintEdit(false); }}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{project.maintenancePlan || <span className="text-muted-foreground/60">No maintenance plan yet.</span>}</p>
                )}
              </div>

              <div className="pt-2 border-t border-border/60">
                <button onClick={() => { void deleteProject(); }} className="text-xs text-destructive hover:opacity-80 flex items-center gap-1.5">
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
    <div className="min-w-0">
      <dt className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm font-medium text-foreground min-w-0 break-words">{children}</dd>
    </div>
  );
}

function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-border text-foreground hover:bg-accent transition">
      <ExternalLink className="w-3 h-3" /> {label}
    </a>
  );
}
