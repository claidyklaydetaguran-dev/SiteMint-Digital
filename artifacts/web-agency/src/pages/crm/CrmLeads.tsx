import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { Search, Plus, RefreshCw, Download, Users, Phone, MessageSquare, SlidersHorizontal } from "lucide-react";

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

export default function CrmLeads() {
  const [, navigate] = useLocation();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<NewLeadForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [importingDiscovery, setImportingDiscovery] = useState(false);
  const [importMsg, setImportMsg] = useState("");

  const load = useCallback(async () => {
    if (!token()) { navigate("/admin"); return; }
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (filterStatus) params.set("status", filterStatus);
    if (filterPriority) params.set("priority", filterPriority);
    const r = await fetch(`/api/crm/leads?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 401) { navigate("/admin"); return; }
    const d = await r.json() as { leads: Lead[] };
    setLeads(d.leads || []);
    setLoading(false);
  }, [search, filterStatus, filterPriority, navigate]);

  useEffect(() => { load(); }, [load]);

  const createLead = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);
    const r = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (r.ok) { setShowCreate(false); setForm(emptyForm); load(); }
  };

  const importDiscovery = async () => {
    setImportingDiscovery(true);
    const r = await fetch("/api/crm/import-discovery", {
      method: "POST",
      headers: { Authorization: `Bearer ${token()}` },
    });
    const d = await r.json() as { imported: number; skipped: number };
    setImportMsg(`Imported ${d.imported} leads, skipped ${d.skipped} duplicates`);
    setImportingDiscovery(false);
    load();
    setTimeout(() => setImportMsg(""), 5000);
  };

  return (
    <CrmLayout>
      <div className="p-6 max-w-7xl mx-auto">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl font-bold text-foreground">People</h1>
            <p className="text-muted-foreground text-xs mt-0.5">{leads.length} leads</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {importMsg && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg">
                {importMsg}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={importDiscovery} disabled={importingDiscovery} className="gap-1.5 text-xs">
              <Download className="w-3.5 h-3.5" />
              {importingDiscovery ? "Importing…" : "Import from Discovery"}
            </Button>
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Lead
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 p-2.5 flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Search name, email, company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">All Stages</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none bg-white"
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
          <button className="flex items-center gap-1.5 text-xs border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors text-muted-foreground">
            <SlidersHorizontal className="w-3 h-3" /> More Filters
          </button>
          <Button variant="ghost" size="sm" onClick={load} className="px-2">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-7 h-7 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No leads found</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Add a lead or import from your Discovery form.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Last Activity</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Time</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Stage</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Priority</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-gray-50/70 transition-colors">
                      {/* Name + avatar */}
                      <td className="px-4 py-3">
                        <Link href={`/admin/crm/leads/${lead.id}`}>
                          <div className="flex items-center gap-2.5 cursor-pointer group">
                            <div className={`w-8 h-8 rounded-full ${avatarColor(lead.name)} flex items-center justify-center shrink-0`}>
                              <span className="text-white text-xs font-semibold">{initials(lead.name)}</span>
                            </div>
                            <div>
                              <span className="font-medium text-blue-600 group-hover:text-blue-800 transition-colors">
                                {lead.name}
                              </span>
                              {lead.company && (
                                <div className="text-xs text-muted-foreground">{lead.company}</div>
                              )}
                            </div>
                          </div>
                        </Link>
                      </td>
                      {/* Email */}
                      <td className="px-4 py-3">
                        <a href={`mailto:${lead.email}`} className="text-xs text-muted-foreground hover:text-primary transition-colors truncate block max-w-[180px]">
                          {lead.email}
                        </a>
                      </td>
                      {/* Phone — green circle buttons */}
                      <td className="px-4 py-3">
                        {lead.phone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground mr-0.5 whitespace-nowrap">{lead.phone}</span>
                            <a href={`tel:${lead.phone}`} title="Call"
                               className="w-6 h-6 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shrink-0">
                              <Phone className="w-3 h-3 text-white" />
                            </a>
                            <a href={`sms:${lead.phone}`} title="Text"
                               className="w-6 h-6 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shrink-0">
                              <MessageSquare className="w-3 h-3 text-white" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                      {/* Last Activity */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {lead.lastContactedAt
                            ? `Last contacted · ${lead.serviceInterest || lead.status}`
                            : lead.status === "New" ? "New lead added" : `Stage · ${lead.status}`}
                        </span>
                      </td>
                      {/* Time */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs text-muted-foreground">
                          {timeAgo(lead.lastContactedAt || lead.updatedAt)}
                        </span>
                      </td>
                      {/* Stage */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-foreground">{lead.status}</span>
                      </td>
                      {/* Priority */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityBadge[lead.priority] || "bg-gray-100 text-gray-600"}`}>
                          {lead.priority}
                        </span>
                      </td>
                      {/* Assigned */}
                      <td className="px-4 py-3">
                        {lead.assignedTo ? (
                          <div className="flex items-center gap-1.5">
                            <div className={`w-5 h-5 rounded-full ${avatarColor(lead.assignedTo)} flex items-center justify-center shrink-0`}>
                              <span className="text-white text-[9px] font-semibold">{initials(lead.assignedTo)}</span>
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[80px]">{lead.assignedTo.split(" ")[0]}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
                  <input
                    type={type}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                    value={(form as unknown as Record<string, string>)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
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
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                  placeholder="e.g. Website, CRM, SEO"
                  value={form.serviceInterest}
                  onChange={e => setForm(f => ({ ...f, serviceInterest: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none resize-none"
                  rows={3}
                  placeholder="Initial notes…"
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-gray-100">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button className="flex-1" onClick={createLead} disabled={saving || !form.name || !form.email}>
                {saving ? "Saving…" : "Create Lead"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}
