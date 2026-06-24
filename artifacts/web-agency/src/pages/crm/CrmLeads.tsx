import { useEffect, useState, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  Search, Plus, ChevronRight, RefreshCw, Download, Users, Phone, MessageSquare,
} from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

const STATUSES = ["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"];
const PRIORITIES = ["Low","Medium","High"];

const statusColor: Record<string, string> = {
  New: "bg-blue-100 text-blue-700",
  Contacted: "bg-indigo-100 text-indigo-700",
  "Follow-up": "bg-yellow-100 text-yellow-700",
  "Proposal Sent": "bg-purple-100 text-purple-700",
  Negotiating: "bg-orange-100 text-orange-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  Nurture: "bg-gray-100 text-gray-600",
};

const priorityDot: Record<string, string> = {
  High: "bg-red-500", Medium: "bg-yellow-500", Low: "bg-gray-400",
};

interface Lead {
  id: number; name: string; company?: string; email: string; phone?: string;
  status: string; priority: string; source: string; serviceInterest?: string;
  assignedTo?: string; nextFollowUpAt?: string; lastContactedAt?: string;
  createdAt: string; tags: string[];
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">Leads</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{leads.length} leads total</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {importMsg && (
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg self-center">
                {importMsg}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={importDiscovery} disabled={importingDiscovery} className="gap-1.5">
              <Download className="w-3.5 h-3.5" />
              {importingDiscovery ? "Importing…" : "Import from Discovery"}
            </Button>
            <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Add Lead
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 p-3 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Search by name, email, company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20 bg-white"
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p}>{p}</option>)}
          </select>
          <Button variant="ghost" size="sm" onClick={load} className="gap-1.5">
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
              <p className="text-sm text-muted-foreground/70 mt-1">Add a lead or import from your Discovery form submissions.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lead</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Follow-up</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leads.map(lead => (
                    <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{lead.name}</div>
                        {lead.company && <div className="text-xs text-muted-foreground">{lead.company}</div>}
                        {lead.tags?.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {lead.tags.slice(0, 2).map(t => (
                              <span key={t} className="px-1.5 py-0.5 text-xs bg-foreground/8 rounded text-muted-foreground">{t}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a href={`mailto:${lead.email}`} className="text-muted-foreground text-xs hover:text-primary transition-colors block">{lead.email}</a>
                        {lead.phone && (
                          <div className="flex items-center gap-2 mt-0.5">
                            <a href={`tel:${lead.phone}`} className="text-muted-foreground text-xs hover:text-primary transition-colors flex items-center gap-1" title="Call">
                              <Phone className="w-3 h-3" />{lead.phone}
                            </a>
                            <a href={`sms:${lead.phone}`} className="text-muted-foreground hover:text-emerald-600 transition-colors" title="Send text">
                              <MessageSquare className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor[lead.status] || "bg-gray-100 text-gray-600"}`}>
                          {lead.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className={`w-2 h-2 rounded-full ${priorityDot[lead.priority] || "bg-gray-400"}`} />
                          <span className="text-xs text-muted-foreground">{lead.priority}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{lead.source}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/crm/leads/${lead.id}`}>
                          <Button variant="ghost" size="sm" className="gap-1">
                            View <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </Link>
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
              <h2 className="font-serif font-bold text-lg text-foreground">Add New Lead</h2>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: "Name *", key: "name", type: "text", placeholder: "Full name" },
                { label: "Email *", key: "email", type: "email", placeholder: "email@example.com" },
                { label: "Company", key: "company", type: "text", placeholder: "Company name" },
                { label: "Phone", key: "phone", type: "tel", placeholder: "Phone number" },
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
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Status</label>
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
