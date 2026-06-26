import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { Check, Clock, AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Task {
  id:number; leadId:number; type:string; title:string; description?:string;
  dueDate?:string; status:string; completedAt?:string; createdAt:string;
  leadName?:string; leadCompany?:string;
}

const tabFilters = ["due-today","overdue","upcoming","completed"] as const;
type TabFilter = typeof tabFilters[number];

const tabLabels: Record<TabFilter, string> = {
  "due-today": "Today's Tasks",
  "overdue": "Overdue",
  "upcoming": "Future",
  "completed": "Completed",
};

const taskTypeIcon: Record<string,string> = {
  Call:"📞",Email:"📧","Send Proposal":"📄","Follow Up":"🔔",
  "Check Website":"🌐","Ask for Decision":"🤝","Send Contract":"📋",Other:"📌",
};

export default function CrmTasks() {
  const [, navigate] = useLocation();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>("due-today");

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setLoading(true);
    const r = await fetch("/api/crm/tasks", { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 401) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    const d = await r.json() as { tasks: Task[] };
    setTasks(d.tasks || []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const completeTask = async (id: number) => {
    await fetch(`/api/crm/tasks/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    load();
  };

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const filtered = tasks.filter(t => {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    if (tab === "due-today") return t.status !== "completed" && due && due >= todayStart && due < todayEnd;
    if (tab === "upcoming") return t.status !== "completed" && due && due >= todayEnd;
    if (tab === "overdue") return t.status === "overdue" || (t.status !== "completed" && due && due < todayStart);
    if (tab === "completed") return t.status === "completed";
    return true;
  });

  const counts = {
    all: tasks.length,
    "due-today": tasks.filter(t => { const d = t.dueDate ? new Date(t.dueDate) : null; return t.status !== "completed" && d && d >= todayStart && d < todayEnd; }).length,
    upcoming: tasks.filter(t => { const d = t.dueDate ? new Date(t.dueDate) : null; return t.status !== "completed" && d && d >= todayEnd; }).length,
    overdue: tasks.filter(t => { const d = t.dueDate ? new Date(t.dueDate) : null; return t.status === "overdue" || (t.status !== "completed" && d && d < todayStart); }).length,
    completed: tasks.filter(t => t.status === "completed").length,
  };

  if (loading) return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">Tasks</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{tasks.filter(t=>t.status!=="completed").length} active tasks</p>
          </div>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
          {tabFilters.map(f => (
            <button
              key={f}
              onClick={() => setTab(f)}
              className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === f ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabLabels[f]}
              {counts[f] > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs ${
                  f === "overdue" ? "bg-red-100 text-red-700" : f === "due-today" ? "bg-yellow-100 text-yellow-700" : "bg-gray-200 text-gray-600"
                }`}>
                  {counts[f]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <Check className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No tasks in this category</p>
            </div>
          ) : (
            filtered.map(task => {
              const due = task.dueDate ? new Date(task.dueDate) : null;
              const isOverdue = task.status !== "completed" && due && due < todayStart;
              return (
                <div key={task.id} className={`bg-white rounded-xl border shadow-sm flex items-start gap-3 p-4 ${
                  task.status==="completed"?"border-gray-100 opacity-60":isOverdue?"border-red-200":"border-gray-200"
                }`}>
                  <button
                    onClick={() => task.status !== "completed" && completeTask(task.id)}
                    disabled={task.status === "completed"}
                    className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                      task.status==="completed"?"bg-green-500 border-green-500":"border-gray-300 hover:border-green-500"
                    }`}
                  >
                    {task.status==="completed"&&<Check className="w-3 h-3 text-white"/>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <span className="text-base">{taskTypeIcon[task.type] || "📌"}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.status==="completed"?"line-through text-muted-foreground":"text-foreground"}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {task.leadName && (
                            <Link href={`/admin/crm/leads/${task.leadId}`}>
                              <button className="text-xs text-primary hover:underline flex items-center gap-1">
                                {task.leadName}{task.leadCompany && ` — ${task.leadCompany}`}
                                <ChevronRight className="w-3 h-3"/>
                              </button>
                            </Link>
                          )}
                          <span className="text-xs text-muted-foreground">{task.type}</span>
                          {due && (
                            <span className={`flex items-center gap-1 text-xs font-medium ${isOverdue?"text-red-600":"text-muted-foreground"}`}>
                              {isOverdue ? <AlertTriangle className="w-3 h-3"/> : <Clock className="w-3 h-3"/>}
                              {due.toLocaleDateString()}
                              {isOverdue && " · Overdue"}
                            </span>
                          )}
                        </div>
                        {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                      </div>
                    </div>
                  </div>

                  {task.status !== "completed" && (
                    <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={() => completeTask(task.id)}>
                      Done
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </CrmLayout>
  );
}
