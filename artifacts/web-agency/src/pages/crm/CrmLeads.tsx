import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { Search, Plus, RefreshCw, Download, Users, Phone, MessageSquare, SlidersHorizontal, List, Mail } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

const STATUSES = ["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"];
const PRIORITIES = ["Low","Medium","High"];

const AVATAR_COLORS = [
  "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
  "bg-red-400","bg-orange-400","bg-yellow-500","bg-teal-500","bg-cyan-500","bg-emerald-500",
];
function initials(name: string) {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(name: string) {
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "a day ago";
  if (days < 30) return `${days} days ago`;
  return new Date(d).toLocaleDateString();
}

interface Lead {
  id: number; name: string; company?: string; email: string; phone?: string;
  status: string; priority: string; source: string; serviceInterest?: string;
  assignedTo?: string; nextFollowUpAt?: string; lastContactedAt?: string;
  createdAt: string; updatedAt: string; tags: string[];
}

interface NewLeadForm {
  name: string; email: string; company: string; phone: string; website: string;
  source: string; serviceInterest: string; status: string; priority: string;
  assignedTo: string; notes: string;
}

const emptyForm: NewLeadForm = {
  name:"", email:"", company:"", phone:"", website:"",
  source:"Manual Entry", serviceInterest:"", status:"New", priority:"Medium",
  assignedTo:"", notes:"",
};

const priorityBadge: Record<string, string> = {
  High: "bg-red-100 text-red-700",
  Medium: "bg-yellow-100 text-yellow-700",
  Low: "bg-gray-100 text-gray-600",
};

interface SmartList { label: string; filterStatus?: string; filterPriority?: string; emoji: string; }

const SMART_LISTS: SmartList[] = [
  { label: "All People", emoji: "👥" },
  { label: "New Lead - Needs Contact", filterStatus: "New", emoji: "🟢" },
  { label: "Contacted", filterStatus: "Contacted", emoji: "📞" },
  { label: "Follow-up", filterStatus: "Follow-up", emoji: "🔔" },
  { label: "Proposal Sent", filterStatus: "Proposal Sent", emoji: "📄" },
  { label: "Active / Negotiating", filterStatus: "Negotiating", emoji: "🤝" },
  { label: "Won Clients", filterStatus: "Won", emoji: "🏆" },
  { label: "Nurture", filterStatus: "Nurture", emoji: "🌱" },
  { label: "Lost", filterStatus: "Lost", emoji: "❌" },
];

const PRIORITY_LISTS: SmartList[] = [
  { label: "Hot Leads", filterPriority: "High", emoji: "🔥" },
  { label: "Warm Leads", filterPriority: "Medium", emoji: "🌡️" },
  { label: "Cold Leads", filterPriority: "Low", emoji: "🧊" },
];

export default function CrmLeads() {
  const [, navigate] = useLocation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [activeList, setActiveList] = useState<SmartList>(SMART_LISTS[0]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewLeadForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<{ name?: string; email?: string }>({});
  const [importingDiscovery, setImportingDiscovery] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const load = useCallback(async () => {
    if (!token()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    setLoading(true);
    const r = await fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 401) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    const d = await r.json() as { leads: Lead[] };
    setAllLeads(d.leads || []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  // Apply filters client-side for smart lists (instant, no extra API calls)
  useEffect(() => {
    let filtered = allLeads;
    const fs = activeList.filterStatus || filterStatus;
    const fp = activeList.filterPriority || filterPriority;
    if (fs) filtered = filtered.filter(l => l.status === fs);
    if (fp) filtered = filtered.filter(l => l.priority === fp);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        (l.company || "").toLowerCase().includes(q) ||
        (l.phone || "").includes(q)
      );
    }
    setLeads(filtered);
  }, [allLeads, activeList, filterStatus, filterPriority, search]);

  const countFor = (list: SmartList) => {
    return allLeads.filter(l =>
      (!list.filterStatus || l.status === list.filterStatus) &&
      (!list.filterPriority || l.priority === list.filterPriority)
    ).length;
  };

  const selectList = (list: SmartList) => {
    setActiveList(list);
    setFilterStatus("");
    setFilterPriority("");
  };

  const createLead = async () => {
    const errors: { name?: string; email?: string } = {};
    if (!form.name.trim()) errors.name = "Full name is required.";
    if (!form.email.trim()) errors.email = "Email address is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = "Enter a valid email address.";
    if (Object.keys(errors).length) { setFormErrors(errors); return; }
    setFormErrors({});
    setSaving(true);
    const r = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (r.ok) { setShowCreate(false); setForm(emptyForm); load(); }
    else {
      const d = await r.json().catch(() => ({})) as { error?: string };
      setFormErrors({ name: d.error || "Failed to create lead. Please try again." });
    }
  };

  const importDiscovery = async () => {
    setImportingDiscovery(true);
    const r = await fetch("/api/crm/import-discovery", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });
    const d = await r.json() as { imported: number; skipped: number };
    setImportMsg(`Imported ${d.imported}, skipped ${d.skipped} duplicates`);
    setImportingDiscovery(false);
    load();
    setTimeout(() => setImportMsg(""), 5000);
  };

  return (
    <CrmLayout>
      <div className="flex h-[calc(100vh-48px)]">

        {/* LEFT — Smart list sidebar */}
        {sidebarOpen && (
          <aside className="w-52 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-y-auto">
            <div className="p-3 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">All People</span>
                <button onClick={() => setSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <List className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="relative mt-2">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  className="w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-foreground/20"
                  placeholder="Search lists…"
                />
              </div>
            </div>

            <div className="flex-1 p-2 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5">Smart Lists</p>
              {SMART_LISTS.map(list => {
                const count = countFor(list);
                const isActive = activeList.label === list.label;
                return (
                  <button key={list.label} onClick={() => selectList(list)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                      isActive ? "bg-blue-50 text-blue-700 font-semibold" : "text-foreground hover:bg-gray-50"
                    }`}>
                    <span className="text-sm shrink-0">{list.emoji}</span>
                    <span className="flex-1 truncate">{list.label}</span>
                    {count > 0 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                        isActive ? "bg-blue-200 text-blue-800" : "bg-gray-100 text-gray-600"
                      }`}>{count}</span>
                    )}
                  </button>
                );
              })}

              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-1.5 mt-3">By Priority</p>
              {PRIORITY_LISTS.map(list => {
                const count = countFor(list);
                const isActive = activeList.label === list.label;
                return (
                  <button key={list.label} onClick={() => selectList(list)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                      isActive ? "bg-blue-50 text-blue-700 font-semibold" : "text-foreground hover:bg-gray-50"
                    }`}>
                    <span className="text-sm shrink-0">{list.emoji}</span>
                    <span className="flex-1 truncate">{list.label}</span>
                    {count > 0 && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                        isActive ? "bg-blue-200 text-blue-800" : "bg-gray-100 text-gray-600"
                      }`}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        {/* MAIN content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-5 py-3 flex items-center gap-3 flex-wrap">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground mr-1">
                <List className="w-4 h-4" />
              </button>
            )}
            <h1 className="text-base font-bold text-foreground">
              {activeList.emoji} {activeList.label}
            </h1>
            <span className="text-xs text-muted-foreground">— {leads.length} people</span>

            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {importMsg && (
                <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                  {importMsg}
                </span>
              )}
              <Button variant="outline" size="sm" onClick={importDiscovery} disabled={importingDiscovery} className="gap-1.5 text-xs h-8">
                <Download className="w-3.5 h-3.5" />
                {importingDiscovery ? "Importing…" : "Import"}
              </Button>
              <Button size="sm" className="gap-1.5 text-xs h-8" onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5" /> + New Lead
              </Button>
            </div>
          </div>

          {/* Filter bar */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap gap-2 items-center">
            <div className="relative min-w-44 flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
                placeholder="Search name, email, phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none bg-white"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setActiveList(SMART_LISTS[0]); }}
            >
              <option value="">All Stages</option>
              {STATUSES.map(s => <option key={s}>{s}</option>)}
            </select>
            <select
              className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none bg-white"
              value={filterPriority}
              onChange={e => { setFilterPriority(e.target.value); setActiveList(SMART_LISTS[0]); }}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select>
            <button className="flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors text-muted-foreground">
              <SlidersHorizontal className="w-3 h-3" /> Columns
            </button>
            <button className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors text-muted-foreground">Me ▾</button>
            <Button variant="ghost" size="sm" onClick={load} className="px-2 h-8">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Bulk action strip (visible when leads exist) */}
          {leads.length > 0 && (
            <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Showing {leads.length} of {allLeads.length}</span>
              <div className="flex items-center gap-2 ml-auto">
                {[{icon: Mail, label:"Email"},{icon: Phone, label:"Call"},{icon: MessageSquare, label:"Text"},{icon: Tag, label:"Tag"},{icon: Users, label:"Assign"}].map(({icon: Icon, label}) => (
                  <button key={label} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-gray-100 transition-colors">
                    <Icon className="w-3 h-3" /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Table */}
          <div className="flex-1 overflow-auto bg-white">
            {loading ? (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                  <tr>
                    {["Name","Last Communication","Last Email","Updated","Last Activity","Stage","Assigned","Phone"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-gray-200 shrink-0" />
                          <div className="space-y-1">
                            <div className="h-3 w-24 bg-gray-200 rounded" />
                            <div className="h-2 w-16 bg-gray-100 rounded" />
                          </div>
                        </div>
                      </td>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-100 rounded w-16" /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : leads.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No leads found</p>
                <p className="text-sm text-muted-foreground/70 mt-1">Add a lead or import from your Discovery form.</p>
                <button onClick={() => setShowCreate(true)} className="mt-4 text-sm text-blue-600 hover:text-blue-800">
                  + Add first lead
                </button>
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-48">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Last Communication</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Last Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Updated</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Last Activity</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Stage</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Assigned</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Phone</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-gray-50/70 transition-colors group">
                      {/* Name + avatar */}
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/crm/leads/${lead.id}`}>
                          <div className="flex items-center gap-2.5 cursor-pointer">
                            <div className={`w-7 h-7 rounded-full ${avatarColor(lead.name)} flex items-center justify-center shrink-0`}>
                              <span className="text-white text-[10px] font-bold">{initials(lead.name)}</span>
                            </div>
                            <div className="min-w-0">
                              <span className="font-medium text-xs text-blue-600 hover:text-blue-800 transition-colors block truncate">{lead.name}</span>
                              {lead.company && <span className="text-[10px] text-muted-foreground truncate block">{lead.company}</span>}
                            </div>
                          </div>
                        </Link>
                      </td>
                      {/* Last communication */}
                      <td className="px-4 py-2.5">
                        <div className="text-xs">
                          {lead.lastContactedAt ? (
                            <div>
                              <p className="text-muted-foreground">{timeAgo(lead.lastContactedAt)}</p>
                              <p className="text-[10px] text-muted-foreground/60">{lead.status === "Contacted" ? "Outgoing call" : "Email"}</p>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">Never</span>
                          )}
                        </div>
                      </td>
                      {/* Last email */}
                      <td className="px-4 py-2.5">
                        <a href={`mailto:${lead.email}`} className="text-[10px] text-muted-foreground hover:text-primary truncate block max-w-[140px]">
                          {lead.email}
                        </a>
                      </td>
                      {/* Updated */}
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(lead.updatedAt)}</span>
                      </td>
                      {/* Last activity */}
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-muted-foreground">
                          {lead.lastContactedAt ? "Contacted · " + lead.status : "New lead"}
                        </span>
                      </td>
                      {/* Stage */}
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                          lead.status === "Won" ? "bg-green-100 text-green-700" :
                          lead.status === "Lost" ? "bg-red-100 text-red-600" :
                          lead.status === "Proposal Sent" ? "bg-purple-100 text-purple-700" :
                          lead.status === "Negotiating" ? "bg-orange-100 text-orange-700" :
                          lead.status === "New" ? "bg-blue-100 text-blue-700" :
                          lead.status === "Contacted" ? "bg-indigo-100 text-indigo-700" :
                          lead.status === "Follow-up" ? "bg-yellow-100 text-yellow-700" :
                          "bg-gray-100 text-gray-600"
                        }`}>{lead.status}</span>
                      </td>
                      {/* Assigned */}
                      <td className="px-4 py-2.5">
                        {lead.assignedTo ? (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full ${avatarColor(lead.assignedTo)} flex items-center justify-center shrink-0`}>
                              <span className="text-white text-[8px] font-bold">{initials(lead.assignedTo)}</span>
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[70px]">{lead.assignedTo.split(" ")[0]}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      {/* Phone with call/text */}
                      <td className="px-4 py-2.5">
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground">{lead.phone}</span>
                            <a href={`tel:${lead.phone}`} title="Call"
                               className="w-5 h-5 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shrink-0">
                              <Phone className="w-2.5 h-2.5 text-white" />
                            </a>
                            <a href={`sms:${lead.phone}`} title="Text"
                               className="w-5 h-5 bg-sky-500 hover:bg-sky-600 rounded-full flex items-center justify-center transition-colors shrink-0">
                              <MessageSquare className="w-2.5 h-2.5 text-white" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Create Lead Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-lg text-foreground">Add New Lead</h2>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: "Name *", key: "name", type: "text", placeholder: "Full name" },
                { label: "Email *", key: "email", type: "email", placeholder: "email@example.com" },
                { label: "Company", key: "company", type: "text", placeholder: "Company name" },
                { label: "Phone", key: "phone", type: "tel", placeholder: "(555) 000-0000" },
                { label: "Website", key: "website", type: "url", placeholder: "https://..." },
              ].map(({ label, key, type, placeholder }) => {
                const err = formErrors[key as keyof typeof formErrors];
                return (
                  <div key={key}>
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
                    <input type={type} placeholder={placeholder}
                      className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 transition-colors ${
                        err ? "border-red-300 focus:ring-red-200 bg-red-50" : "border-gray-200 focus:ring-foreground/20"
                      }`}
                      value={(form as unknown as Record<string, string>)[key]}
                      onChange={e => {
                        setForm(f => ({ ...f, [key]: e.target.value }));
                        if (err) setFormErrors(fe => ({ ...fe, [key]: undefined }));
                      }} />
                    {err && <p className="text-xs text-red-500 mt-1">{err}</p>}
                  </div>
                );
              })}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Source</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                    {["Website Form","Discovery Form","Referral","Cold Outreach","Social Media","Manual Entry","Other"].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Stage</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    {STATUSES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Priority</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                    {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Assigned To</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                    <option value="">Unassigned</option>
                    <option>Claidy Taguran</option>
                    <option>Shasta Greene</option>
                    <option>Saisa Lorraigne</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Service Interest</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                  placeholder="e.g. Website, CRM, SEO"
                  value={form.serviceInterest}
                  onChange={e => setForm(f => ({ ...f, serviceInterest: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
                <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none resize-none"
                  rows={3} placeholder="Initial notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-gray-100">
              <Button variant="outline" className="flex-1" onClick={() => { setShowCreate(false); setFormErrors({}); setForm(emptyForm); }}>Cancel</Button>
              <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0" onClick={createLead} disabled={saving}>
                {saving ? "Saving…" : "Create Lead"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}

// Need Tag icon
function Tag({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  );
}
