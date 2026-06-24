import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { ChevronLeft, ChevronRight, Plus, Clock } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Task {
  id: number; leadId: number; type: string; title: string;
  description?: string; dueDate?: string; status: string; leadName?: string;
}
interface Lead {
  id: number; name: string; nextFollowUpAt?: string; status: string;
}

const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const TYPE_COLORS: Record<string, string> = {
  Call: "bg-green-100 text-green-800 border-green-200",
  Email: "bg-blue-100 text-blue-800 border-blue-200",
  "Follow Up": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Send Proposal": "bg-purple-100 text-purple-800 border-purple-200",
  default: "bg-gray-100 text-gray-700 border-gray-200",
};

interface CalEvent { id: string; date: string; title: string; type: string; leadId?: number; leadName?: string; }

export default function CrmCalendar() {
  const [, navigate] = useLocation();
  const [today] = useState(new Date());
  const [current, setCurrent] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!token()) { navigate("/admin"); return; }
    Promise.all([
      fetch("/api/crm/tasks", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
    ]).then(([td, ld]) => {
      const evts: CalEvent[] = [];
      (td.tasks || []).forEach((t: Task) => {
        if (t.dueDate && t.status !== "completed") {
          evts.push({
            id: `task-${t.id}`,
            date: t.dueDate.slice(0, 10),
            title: t.title,
            type: t.type || "Follow Up",
            leadId: t.leadId,
            leadName: t.leadName,
          });
        }
      });
      (ld.leads || []).forEach((l: Lead) => {
        if (l.nextFollowUpAt) {
          evts.push({
            id: `followup-${l.id}`,
            date: l.nextFollowUpAt.slice(0, 10),
            title: `Follow-up: ${l.name}`,
            type: "Follow Up",
            leadId: l.id,
            leadName: l.name,
          });
        }
      });
      setEvents(evts);
    }).finally(() => setLoading(false));
  }, [navigate]);

  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevMonthDays - i), isCurrentMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), isCurrentMonth: true });
  }
  const remaining = 42 - cells.length;
  for (let d = 1; d <= remaining; d++) {
    cells.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
  }

  const dateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const todayKey = dateKey(today);

  const eventsOnDate = (d: Date) => events.filter(e => e.date === dateKey(d));

  const upcoming = events
    .filter(e => e.date >= todayKey)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);

  const prevMonth = () => setCurrent(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrent(new Date(year, month + 1, 1));
  const goToday = () => { setCurrent(new Date()); setSelected(todayKey); };

  if (loading) return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="flex h-[calc(100vh-48px)]">

        {/* Left mini panel */}
        <div className="w-56 bg-white border-r border-gray-200 flex flex-col p-4 shrink-0 overflow-y-auto">
          {/* Mini nav calendar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">{MONTHS[month].slice(0,3)} {year}</span>
              <div className="flex gap-1">
                <button onClick={prevMonth} className="w-5 h-5 flex items-center justify-center hover:bg-gray-100 rounded transition-colors">
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <button onClick={nextMonth} className="w-5 h-5 flex items-center justify-center hover:bg-gray-100 rounded transition-colors">
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-0">
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i} className="text-center text-[9px] text-muted-foreground font-semibold py-1">{d}</div>
              ))}
              {cells.map((cell, i) => {
                const k = dateKey(cell.date);
                const isToday = k === todayKey;
                const isSel = k === selected;
                const hasEvt = eventsOnDate(cell.date).length > 0;
                return (
                  <button key={i} onClick={() => setSelected(k)}
                    className={`text-center text-[10px] py-1 rounded transition-colors relative ${
                      !cell.isCurrentMonth ? "text-gray-300" :
                      isToday ? "bg-blue-600 text-white font-bold" :
                      isSel ? "bg-blue-100 text-blue-700 font-semibold" :
                      "hover:bg-gray-100 text-foreground"
                    }`}>
                    {cell.date.getDate()}
                    {hasEvt && !isToday && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-blue-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={goToday}
            className="w-full text-xs text-center py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-foreground mb-4">
            Today
          </button>

          {/* Filters label */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Schedule</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />Tasks due
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />Follow-ups
            </div>
          </div>
        </div>

        {/* Main calendar */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">{MONTHS[month]} {year}</h2>
            <div className="flex items-center gap-1 ml-4">
              <button onClick={prevMonth} className="w-7 h-7 border border-gray-200 rounded flex items-center justify-center hover:bg-gray-50 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={nextMonth} className="w-7 h-7 border border-gray-200 rounded flex items-center justify-center hover:bg-gray-50 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="ml-auto flex items-center gap-2">
              {(["day","week","month"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg capitalize transition-colors ${
                    view === v ? "bg-blue-600 text-white" : "border border-gray-200 text-foreground hover:bg-gray-50"
                  }`}>
                  {v}
                </button>
              ))}
              <button onClick={goToday}
                className="px-3 py-1 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-foreground">
                Today
              </button>
              <Link href="/admin/crm/tasks">
                <button className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Plus className="w-3 h-3" /> Add
                </button>
              </Link>
            </div>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Month grid */}
            <div className="flex-1 overflow-auto">
              <div className="grid grid-cols-7 border-b border-gray-200 bg-white sticky top-0">
                {DAYS.map(d => (
                  <div key={d} className="text-center py-2 text-xs font-semibold text-muted-foreground border-r border-gray-100 last:border-r-0">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 flex-1">
                {cells.map((cell, i) => {
                  const k = dateKey(cell.date);
                  const isToday = k === todayKey;
                  const isSel = k === selected;
                  const dayEvts = eventsOnDate(cell.date);
                  return (
                    <div key={i} onClick={() => setSelected(k)}
                      className={`min-h-[90px] border-r border-b border-gray-100 p-1.5 cursor-pointer transition-colors hover:bg-blue-50/30 ${
                        !cell.isCurrentMonth ? "bg-gray-50/50" : "bg-white"
                      } ${isSel ? "ring-1 ring-inset ring-blue-400" : ""}`}>
                      <div className={`w-6 h-6 flex items-center justify-center text-xs font-semibold rounded-full mb-1 ${
                        isToday ? "bg-blue-600 text-white" :
                        cell.isCurrentMonth ? "text-foreground" : "text-gray-300"
                      }`}>
                        {cell.date.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {dayEvts.slice(0, 3).map(evt => (
                          <Link key={evt.id} href={evt.leadId ? `/admin/crm/leads/${evt.leadId}` : "/admin/crm/tasks"}>
                            <div className={`text-[10px] px-1.5 py-0.5 rounded border truncate ${TYPE_COLORS[evt.type] || TYPE_COLORS.default}`} title={evt.title}>
                              {evt.title}
                            </div>
                          </Link>
                        ))}
                        {dayEvts.length > 3 && (
                          <div className="text-[10px] text-muted-foreground pl-1">+{dayEvts.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Upcoming list */}
            <div className="w-56 bg-white border-l border-gray-200 flex flex-col shrink-0">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Upcoming</p>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {upcoming.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">No upcoming events</div>
                ) : upcoming.map(evt => (
                  <Link key={evt.id} href={evt.leadId ? `/admin/crm/leads/${evt.leadId}` : "/admin/crm/tasks"}>
                    <div className="px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer">
                      <p className="text-xs font-medium text-foreground truncate">{evt.title}</p>
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{new Date(evt.date + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                      </div>
                      <span className={`mt-1 inline-block text-[10px] px-1.5 py-0.5 rounded border ${TYPE_COLORS[evt.type] || TYPE_COLORS.default}`}>{evt.type}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </CrmLayout>
  );
}
