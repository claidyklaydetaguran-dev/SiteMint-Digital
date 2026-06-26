import { Link, useLocation } from "wouter";
import { CrmErrorBoundary } from "@/components/CrmErrorBoundary";
import { useState, useRef, useEffect, useCallback } from "react";
import { SiteMintLogo } from "@/components/SiteMintLogo";
import {
  Search, Mail, Phone, MessageSquare, Bell, LogOut,
  ChevronDown, LayoutDashboard, X, UserPlus, Send,
  AlertCircle, ChevronRight, Check, Plus, Clock, AlertTriangle, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const tok = () => localStorage.getItem("adminToken") || "";

const NAV_ITEMS = [
  { href: "/admin/crm/dashboard", label: "Dashboard" },
  { href: "/admin/crm/leads", label: "People" },
  { href: "/admin/crm/pipeline", label: "Lead Pipeline" },
  { href: "/admin/crm/inbox", label: "Inbox" },
  { href: "/admin/crm/tasks", label: "Tasks" },
  { href: "/admin/crm/calendar", label: "Calendar" },
  { href: "/admin/crm/deals", label: "Deals Kanban" },
  { href: "/admin/crm/campaigns", label: "Campaigns" },
  { href: "/admin/crm/reporting", label: "Reporting" },
  { href: "/admin/crm/admin", label: "Admin" },
];

interface CrmLead {
  id: number; name: string; email: string; phone?: string; company?: string;
  status?: string; priority?: string; source?: string;
  createdAt?: string; nextFollowUpAt?: string;
}
interface Template { id: number; name: string; subject: string; body: string; }
interface NavTask {
  id: number; title: string; type: string; dueDate?: string;
  status: string; leadId?: number; leadName?: string;
}
interface Notification {
  id: string; type: "overdue_task" | "due_today" | "new_lead" | "followup_due";
  title: string; sub: string; href: string; urgent: boolean;
}

const AVATAR_COLORS = [
  "bg-blue-500","bg-indigo-500","bg-purple-500","bg-pink-500",
  "bg-orange-400","bg-teal-500","bg-cyan-500","bg-emerald-500","bg-red-400","bg-yellow-500",
];
function av(name: string) {
  const i = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[i];
}
function ini(name: string) {
  return name.trim().split(/\s+/).map(n => n[0]).slice(0, 2).join("").toUpperCase();
}

/* ─── Email Compose Modal ─── */
function EmailComposeModal({ leads, templates, onClose }: {
  leads: CrmLead[]; templates: Template[]; onClose: () => void;
}) {
  const [toSearch, setToSearch] = useState("");
  const [toLead, setToLead] = useState<CrmLead | null>(null);
  const [ccOpen, setCcOpen] = useState(false);
  const [bccOpen, setBccOpen] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [tplOpen, setTplOpen] = useState(false);

  const toResults = toSearch.length > 0 && !toLead
    ? leads.filter(l =>
        l.name.toLowerCase().includes(toSearch.toLowerCase()) ||
        l.email.toLowerCase().includes(toSearch.toLowerCase()) ||
        (l.phone || "").includes(toSearch)
      ).slice(0, 6)
    : [];

  const applyTemplate = (t: Template) => {
    setSubject(t.subject);
    setBody(t.body.replace(/\{\{name\}\}/g, toLead?.name.split(" ")[0] || "there"));
    setTplOpen(false);
  };

  const send = async () => {
    if (!toLead) { setError("Please select a recipient."); return; }
    if (!subject.trim()) { setError("Subject is required."); return; }
    if (!body.trim()) { setError("Body is required."); return; }
    setError("");
    setSending(true);
    const r = await fetch(`/api/crm/leads/${toLead.id}/email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ subject, body, cc, bcc }),
    });
    setSending(false);
    if (r.ok) { setSent(true); setTimeout(onClose, 1800); }
    else { const d = await r.json().catch(() => ({})); setError((d as {error?: string}).error || "Failed to send email."); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-semibold text-foreground">New Email</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-foreground">Email sent!</p>
            <p className="text-xs text-muted-foreground">Logged to {toLead?.name}'s activity timeline.</p>
          </div>
        ) : (
          <>
            {/* Fields */}
            <div className="divide-y divide-gray-100 flex-1 overflow-y-auto">
              {/* To */}
              <div className="px-5 py-2.5 relative">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-12 shrink-0">To:</span>
                  {toLead ? (
                    <div className="flex items-center gap-2 bg-blue-50 rounded-full px-2 py-0.5">
                      <div className={`w-5 h-5 rounded-full ${av(toLead.name)} flex items-center justify-center`}>
                        <span className="text-white text-[9px] font-bold">{ini(toLead.name)}</span>
                      </div>
                      <span className="text-xs text-blue-700 font-medium">{toLead.name}</span>
                      <button onClick={() => { setToLead(null); setToSearch(""); }} className="text-blue-400 hover:text-blue-600">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <input
                      autoFocus
                      className="flex-1 text-sm focus:outline-none placeholder-gray-400"
                      placeholder="Enter name or phone number"
                      value={toSearch}
                      onChange={e => setToSearch(e.target.value)}
                    />
                  )}
                  <div className="ml-auto flex gap-2 text-xs text-blue-500">
                    <button onClick={() => setCcOpen(o => !o)}>CC</button>
                    <button onClick={() => setBccOpen(o => !o)}>BCC</button>
                  </div>
                </div>
                {/* To dropdown */}
                {toResults.length > 0 && (
                  <div className="absolute left-5 right-5 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-10 overflow-hidden">
                    {toResults.map(l => (
                      <button key={l.id} onClick={() => { setToLead(l); setToSearch(""); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className={`w-8 h-8 rounded-full ${av(l.name)} flex items-center justify-center shrink-0`}>
                          <span className="text-white text-xs font-bold">{ini(l.name)}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">{l.name}</p>
                          {l.phone && <p className="text-xs text-muted-foreground">{l.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {ccOpen && (
                <div className="px-5 py-2.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-12 shrink-0">CC:</span>
                  <input className="flex-1 text-sm focus:outline-none placeholder-gray-400" placeholder="CC email addresses"
                    value={cc} onChange={e => setCc(e.target.value)} />
                </div>
              )}
              {bccOpen && (
                <div className="px-5 py-2.5 flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-12 shrink-0">BCC:</span>
                  <input className="flex-1 text-sm focus:outline-none placeholder-gray-400" placeholder="BCC email addresses"
                    value={bcc} onChange={e => setBcc(e.target.value)} />
                </div>
              )}

              {/* Subject */}
              <div className="px-5 py-2.5 flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground w-12 shrink-0">Subject:</span>
                <input className="flex-1 text-sm focus:outline-none placeholder-gray-400" placeholder="Subject"
                  value={subject} onChange={e => setSubject(e.target.value)} />
              </div>

              {/* Body */}
              <div className="px-5 py-2.5">
                <textarea className="w-full text-sm focus:outline-none resize-none placeholder-gray-400 min-h-[180px]"
                  placeholder="Write your message…"
                  value={body} onChange={e => setBody(e.target.value)} />
                {/* Signature */}
                <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-muted-foreground">
                  <p>Best,</p>
                  <p className="font-medium text-foreground">SiteMint Digital Solutions</p>
                  <p className="text-muted-foreground/70">sitemintdigital.com</p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mx-5 mb-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
              {/* Attachments */}
              <button className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
                📎 Attachments
              </button>

              {/* Templates */}
              <div className="relative">
                <button onClick={() => setTplOpen(o => !o)}
                  className="text-xs text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors">
                  📋 Templates
                </button>
                {tplOpen && templates.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-10 overflow-hidden">
                    {templates.map(t => (
                      <button key={t.id} onClick={() => applyTemplate(t)}
                        className="w-full text-left px-4 py-2.5 text-xs hover:bg-gray-50 transition-colors">
                        <p className="font-medium text-foreground">{t.name}</p>
                        <p className="text-muted-foreground truncate">{t.subject}</p>
                      </button>
                    ))}
                  </div>
                )}
                {tplOpen && templates.length === 0 && (
                  <div className="absolute bottom-full mb-1 left-0 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-10 p-3 text-xs text-muted-foreground">
                    No templates yet. Create them in Admin → Email Templates.
                  </div>
                )}
              </div>

              <div className="ml-auto flex items-center gap-2">
                <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                <Button size="sm" onClick={send} disabled={sending || !toLead}
                  className="gap-1.5 bg-blue-600 hover:bg-blue-700">
                  <Send className="w-3.5 h-3.5" />
                  {sending ? "Sending…" : "Send Email"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Phone Call Dropdown ─── */
function PhoneDropdown({ leads, onClose }: { leads: CrmLead[]; onClose: () => void; }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const results = q.length > 0
    ? leads.filter(l => l.name.toLowerCase().includes(q.toLowerCase()) || (l.phone || "").includes(q)).slice(0, 8)
    : leads.filter(l => l.phone).slice(0, 6);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 w-72 bg-white rounded-xl border border-gray-200 shadow-2xl z-[200]">
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input autoFocus className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-foreground/20"
            placeholder="Search name or phone…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
        {results.length === 0 ? (
          <p className="p-4 text-xs text-muted-foreground text-center">No leads with phone found</p>
        ) : results.map(l => (
          <a key={l.id} href={`tel:${l.phone}`} onClick={onClose}
            className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
            <div className={`w-7 h-7 rounded-full ${av(l.name)} flex items-center justify-center shrink-0`}>
              <span className="text-white text-[10px] font-bold">{ini(l.name)}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{l.name}</p>
              <p className="text-xs text-muted-foreground">{l.phone || "No phone"}</p>
            </div>
            <div className="ml-auto w-7 h-7 bg-green-500 rounded-full flex items-center justify-center shrink-0">
              <Phone className="w-3.5 h-3.5 text-white" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ─── SMS Compose Modal ─── */
function SmsModal({ leads, onClose }: { leads: CrmLead[]; onClose: () => void; }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [toSearch, setToSearch] = useState("");
  const [toLead, setToLead] = useState<CrmLead | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/crm/phone/status", { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json())
      .then(d => setConfigured((d as { configured: boolean }).configured))
      .catch(() => setConfigured(false));
  }, []);

  const toResults = toSearch.length > 0 && !toLead
    ? leads.filter(l => l.name.toLowerCase().includes(toSearch.toLowerCase()) || (l.phone || "").includes(toSearch)).slice(0, 6)
    : [];

  const send = async () => {
    if (!toLead) { setError("Please select a recipient."); return; }
    if (!body.trim()) { setError("Message body is required."); return; }
    setError("");
    setSending(true);
    const r = await fetch(`/api/crm/leads/${toLead.id}/sms`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ body: body.trim() }),
    });
    setSending(false);
    if (r.ok) { setSent(true); setTimeout(onClose, 1800); }
    else { const d = await r.json().catch(() => ({})); setError((d as { error?: string }).error || "Failed to send SMS."); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-500" /> New SMS
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {sent ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-foreground">SMS sent!</p>
            <p className="text-xs text-muted-foreground">Logged to {toLead?.name}'s timeline.</p>
          </div>
        ) : configured === null ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
          </div>
        ) : !configured ? (
          <div className="p-6 text-center space-y-4">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
              <MessageSquare className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="font-semibold text-foreground">SMS not configured yet</h3>
            <p className="text-sm text-muted-foreground">Add Twilio credentials to your environment secrets to enable two-way texting.</p>
            <div className="bg-gray-50 rounded-xl p-4 text-left text-xs space-y-1 text-muted-foreground">
              <p className="font-semibold text-foreground">Required env vars:</p>
              {["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"].map(k => (
                <p key={k}><code className="bg-gray-200 px-1 rounded">{k}</code></p>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Dismiss</button>
              <Link href="/admin/crm/settings">
                <button onClick={onClose} className="flex-1 text-sm bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 transition-colors">Go to Settings</button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="divide-y divide-gray-100 flex-1 overflow-y-auto">
              {/* To */}
              <div className="px-5 py-2.5 relative">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground w-8 shrink-0">To:</span>
                  {toLead ? (
                    <div className="flex items-center gap-2 bg-sky-50 rounded-full px-2 py-0.5">
                      <div className={`w-5 h-5 rounded-full ${av(toLead.name)} flex items-center justify-center`}>
                        <span className="text-white text-[9px] font-bold">{ini(toLead.name)}</span>
                      </div>
                      <span className="text-xs text-sky-700 font-medium">{toLead.name}</span>
                      {toLead.phone && <span className="text-xs text-sky-500 font-mono">{toLead.phone}</span>}
                      <button onClick={() => { setToLead(null); setToSearch(""); }} className="text-sky-400 hover:text-sky-600"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <input
                      autoFocus
                      className="flex-1 text-sm focus:outline-none placeholder-gray-400"
                      placeholder="Search lead by name or phone…"
                      value={toSearch}
                      onChange={e => setToSearch(e.target.value)}
                    />
                  )}
                </div>
                {toResults.length > 0 && (
                  <div className="absolute left-5 right-5 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-10 overflow-hidden">
                    {toResults.map(l => (
                      <button key={l.id} onClick={() => { setToLead(l); setToSearch(""); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors">
                        <div className={`w-7 h-7 rounded-full ${av(l.name)} flex items-center justify-center shrink-0`}>
                          <span className="text-white text-[10px] font-bold">{ini(l.name)}</span>
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-medium text-foreground">{l.name}</p>
                          <p className="text-xs text-muted-foreground">{l.phone || "No phone"}</p>
                        </div>
                        {!l.phone && <span className="ml-auto text-xs text-red-400">No phone</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Message body */}
              <div className="px-5 py-3">
                <textarea
                  className="w-full text-sm focus:outline-none resize-none placeholder-gray-400 min-h-[160px]"
                  placeholder="Write your SMS message… (160 chars per segment)"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                />
                <p className="text-xs text-muted-foreground text-right mt-1">{body.length} chars · {Math.ceil(body.length / 160) || 1} segment{Math.ceil(body.length / 160) !== 1 ? "s" : ""}</p>
              </div>
            </div>

            {error && (
              <div className="mx-5 mb-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
              </div>
            )}

            <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-2">
              <p className="text-xs text-muted-foreground">⌘+Enter to send</p>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                <Button size="sm" onClick={send} disabled={sending || !toLead || !body.trim()} className="gap-1.5 bg-sky-600 hover:bg-sky-700">
                  <Send className="w-3.5 h-3.5" />
                  {sending ? "Sending…" : "Send SMS"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── New Person Modal ─── */
function NewPersonModal({ leads, onClose, onCreated }: {
  leads: CrmLead[]; onClose: () => void; onCreated: () => void;
}) {
  const [step, setStep] = useState<"search" | "form">("search");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name:"", email:"", phone:"", company:"", source:"Manual Entry", status:"New", priority:"Medium", assignedTo:"", notes:"" });
  const [saving, setSaving] = useState(false);
  const [dupWarning, setDupWarning] = useState("");

  const searchResults = q.length > 1
    ? leads.filter(l => l.name.toLowerCase().includes(q.toLowerCase()) || l.email.toLowerCase().includes(q.toLowerCase()) || (l.phone || "").includes(q)).slice(0, 5)
    : [];

  const checkDup = (email: string, phone: string) => {
    const byEmail = email && leads.find(l => l.email.toLowerCase() === email.toLowerCase());
    const byPhone = phone && leads.find(l => l.phone === phone);
    if (byEmail) setDupWarning(`Duplicate: ${byEmail.name} has this email.`);
    else if (byPhone) setDupWarning(`Duplicate: ${byPhone.name} has this phone.`);
    else setDupWarning("");
  };

  const save = async () => {
    if (!form.name || !form.email) return;
    setSaving(true);
    const r = await fetch("/api/crm/leads", {
      method: "POST",
      headers: { Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (r.ok) { onCreated(); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="font-semibold text-foreground">New Person</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>

        {step === "search" ? (
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-3">Search for an existing contact first to avoid duplicates.</p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input autoFocus className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-foreground/20"
                placeholder="Enter name or phone number" value={q} onChange={e => setQ(e.target.value)} />
            </div>

            {searchResults.length > 0 && (
              <div className="border border-gray-200 rounded-xl overflow-hidden mb-3 divide-y divide-gray-50">
                {searchResults.map(l => (
                  <Link key={l.id} href={`/admin/crm/leads/${l.id}`}>
                    <div onClick={onClose} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                      <div className={`w-8 h-8 rounded-full ${av(l.name)} flex items-center justify-center shrink-0`}>
                        <span className="text-white text-xs font-bold">{ini(l.name)}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{l.name}</p>
                        <p className="text-xs text-muted-foreground">{l.phone || l.email}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto" />
                    </div>
                  </Link>
                ))}
              </div>
            )}

            <button onClick={() => { setForm(f => ({ ...f, name: q })); setStep("form"); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-muted-foreground hover:border-blue-300 hover:text-blue-600 transition-colors">
              <Plus className="w-4 h-4" /> Create new person
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {dupWarning && (
              <div className="flex items-center gap-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {dupWarning}
              </div>
            )}
            {[
              { label: "Name *", key: "name", type: "text", ph: "Full name" },
              { label: "Email *", key: "email", type: "email", ph: "email@example.com" },
              { label: "Phone", key: "phone", type: "tel", ph: "(555) 000-0000" },
              { label: "Company", key: "company", type: "text", ph: "Company name" },
            ].map(({ label, key, type, ph }) => (
              <div key={key}>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">{label}</label>
                <input type={type} placeholder={ph}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  value={(form as Record<string, string>)[key]}
                  onChange={e => {
                    const v = e.target.value;
                    setForm(f => ({ ...f, [key]: v }));
                    if (key === "email") checkDup(v, form.phone);
                    if (key === "phone") checkDup(form.email, v);
                  }} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Stage</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                  value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                  {["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Priority</label>
                <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                  value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                  {["High","Medium","Low"].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Assigned To</label>
              <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
                value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}>
                <option value="">Unassigned</option>
                <option>Claidy Taguran</option>
                <option>Shasta Greene</option>
                <option>Saisa Lorraigne</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
              <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none resize-none" rows={2}
                value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep("search")} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Back</button>
              <Button className="flex-1" onClick={save} disabled={saving || !form.name || !form.email}>
                {saving ? "Saving…" : "Create Person"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Bell / Notifications ─── */
const NOTIF_BG: Record<string, string> = {
  overdue_task: "bg-red-50",
  due_today:    "bg-yellow-50",
  new_lead:     "bg-blue-50",
  followup_due: "bg-orange-50",
};

function NotifIcon({ type }: { type: string }) {
  if (type === "overdue_task") return <AlertTriangle className="w-4 h-4 text-red-500" />;
  if (type === "due_today")    return <Clock className="w-4 h-4 text-yellow-500" />;
  if (type === "new_lead")     return <UserCheck className="w-4 h-4 text-blue-500" />;
  return <Bell className="w-4 h-4 text-orange-500" />;
}

function BellDropdown({ notifications, onClose }: { notifications: Notification[]; onClose: () => void }) {
  const [, navigate] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const urgent = notifications.filter(n => n.urgent);
  const normal = notifications.filter(n => !n.urgent);

  return (
    <div ref={ref} className="absolute right-0 top-full mt-1 w-80 bg-white rounded-xl border border-gray-200 shadow-2xl z-[200] overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">Notifications</span>
          {notifications.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-500 text-white leading-tight">
              {notifications.length}
            </span>
          )}
        </div>
        <Link href="/admin/crm/tasks">
          <button onClick={onClose} className="text-xs text-primary hover:underline">View Tasks →</button>
        </Link>
      </div>

      {notifications.length === 0 ? (
        <div className="p-8 text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Bell className="w-5 h-5 text-gray-300" />
          </div>
          <p className="text-sm font-medium text-foreground">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-1">No overdue tasks or pending follow-ups.</p>
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
          {[...urgent, ...normal].map(n => (
            <button key={n.id} onClick={() => { navigate(n.href); onClose(); }}
              className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${n.urgent ? "border-l-2 border-red-400" : ""}`}>
              <div className={`w-8 h-8 rounded-full ${NOTIF_BG[n.type] ?? "bg-gray-50"} flex items-center justify-center shrink-0 mt-0.5`}>
                <NotifIcon type={n.type} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${n.urgent ? "text-red-700" : "text-foreground"}`}>{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.sub}</p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
            </button>
          ))}
        </div>
      )}

      {notifications.length > 0 && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
          <Link href="/admin/crm/tasks">
            <button onClick={onClose} className="text-xs text-primary font-medium hover:underline w-full text-center">
              Go to Tasks page
            </button>
          </Link>
        </div>
      )}
    </div>
  );
}

/* ─── Global Search Results ─── */
const STATUS_BADGE: Record<string, string> = {
  New:             "bg-blue-100 text-blue-700",
  Contacted:       "bg-sky-100 text-sky-700",
  "Follow-up":     "bg-yellow-100 text-yellow-700",
  "Proposal Sent": "bg-orange-100 text-orange-700",
  Negotiating:     "bg-purple-100 text-purple-700",
  Won:             "bg-green-100 text-green-700",
  Lost:            "bg-red-100 text-red-700",
  Nurture:         "bg-gray-100 text-gray-600",
};
const PRIORITY_BADGE: Record<string, string> = {
  High:   "bg-red-50 text-red-600",
  Low:    "bg-gray-100 text-gray-500",
};

function GlobalSearchDropdown({ q, onClose, onNavigate }: {
  q: string; onClose: () => void; onNavigate: (href: string) => void;
}) {
  const [results, setResults] = useState<CrmLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [selIdx, setSelIdx] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  useEffect(() => {
    if (q.length < 2) { setResults([]); setLoading(false); setFetchError(false); return; }
    setLoading(true);
    setFetchError(false);
    setSelIdx(0);
    const ctrl = new AbortController();
    fetch(`/api/crm/leads?search=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${tok()}` },
      signal: ctrl.signal,
    })
      .then(r => { if (!r.ok) throw new Error("api"); return r.json() as Promise<{ leads: CrmLead[] }>; })
      .then(d => { setResults((d.leads || []).slice(0, 8)); setLoading(false); })
      .catch(err => {
        if ((err as Error).name !== "AbortError") { setFetchError(true); setLoading(false); }
      });
    return () => ctrl.abort();
  }, [q]);

  const go = useCallback((lead: CrmLead) => {
    onNavigate(`/admin/crm/leads/${lead.id}`);
    onClose();
  }, [onNavigate, onClose]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx(i => Math.min(i + 1, results.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && results.length > 0) { go(results[selIdx] ?? results[0]); }
      else if (e.key === "Escape") { onClose(); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [results, selIdx, go, onClose]);

  return (
    <div ref={ref} className="absolute left-0 right-0 top-full mt-1 bg-white rounded-xl border border-gray-200 shadow-2xl z-[200] overflow-hidden">
      {loading ? (
        <div className="flex items-center gap-2.5 px-4 py-3.5 text-xs text-muted-foreground">
          <div className="w-3 h-3 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin shrink-0" />
          Searching…
        </div>
      ) : fetchError ? (
        <div className="flex items-center gap-2 px-4 py-3.5 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Search unavailable — please try again.
        </div>
      ) : results.length === 0 ? (
        <div className="px-4 py-3.5 text-xs text-muted-foreground text-center">
          No results for <span className="font-medium text-foreground">"{q}"</span>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {results.map((l, idx) => (
            <button
              key={l.id}
              onClick={() => go(l)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left ${idx === selIdx ? "bg-blue-50" : "hover:bg-gray-50"}`}
            >
              <div className={`w-7 h-7 rounded-full ${av(l.name)} flex items-center justify-center shrink-0`}>
                <span className="text-white text-[10px] font-bold">{ini(l.name)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{l.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {l.company ? `${l.company} · ` : ""}{l.email || l.phone || ""}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {l.status && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${STATUS_BADGE[l.status] ?? "bg-gray-100 text-gray-600"}`}>
                    {l.status}
                  </span>
                )}
                {l.priority && l.priority !== "Medium" && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${PRIORITY_BADGE[l.priority] ?? "bg-gray-100 text-gray-500"}`}>
                    {l.priority}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main CrmLayout ─── */
export function CrmLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [modal, setModal] = useState<"email" | "phone" | "sms" | "person" | "bell" | "profile" | null>(null);
  const [allLeads, setAllLeads] = useState<CrmLead[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const profileRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);

  const buildNotifications = useCallback((leads: CrmLead[], tasks: NavTask[]) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const yesterday = new Date(now.getTime() - 86400000);
    const notifs: Notification[] = [];

    tasks.filter(t => t.status !== "completed").forEach(t => {
      if (!t.dueDate) return;
      const due = new Date(t.dueDate);
      if (due < todayStart) {
        notifs.push({
          id: `task-overdue-${t.id}`,
          type: "overdue_task",
          title: t.title,
          sub: t.leadName ? `Overdue task for ${t.leadName}` : `Overdue ${t.type} task`,
          href: t.leadId ? `/admin/crm/leads/${t.leadId}` : "/admin/crm/tasks",
          urgent: true,
        });
      } else if (due >= todayStart && due < todayEnd) {
        notifs.push({
          id: `task-today-${t.id}`,
          type: "due_today",
          title: t.title,
          sub: t.leadName ? `Due today — ${t.leadName}` : `Due today · ${t.type}`,
          href: t.leadId ? `/admin/crm/leads/${t.leadId}` : "/admin/crm/tasks",
          urgent: false,
        });
      }
    });

    leads.forEach(l => {
      if (l.nextFollowUpAt) {
        const fu = new Date(l.nextFollowUpAt);
        if (fu < todayStart) {
          notifs.push({
            id: `followup-overdue-${l.id}`,
            type: "followup_due",
            title: `Follow-up overdue: ${l.name}`,
            sub: `${l.status || "Lead"} · was due ${fu.toLocaleDateString()}`,
            href: `/admin/crm/leads/${l.id}`,
            urgent: true,
          });
        } else if (fu >= todayStart && fu < todayEnd) {
          notifs.push({
            id: `followup-today-${l.id}`,
            type: "followup_due",
            title: `Follow-up today: ${l.name}`,
            sub: `${l.status || "Lead"}${l.company ? ` · ${l.company}` : ""}`,
            href: `/admin/crm/leads/${l.id}`,
            urgent: false,
          });
        }
      }
      if (l.status === "New" && l.createdAt && new Date(l.createdAt) > yesterday) {
        notifs.push({
          id: `new-lead-${l.id}`,
          type: "new_lead",
          title: `New lead: ${l.name}`,
          sub: `${l.source || "Uncontacted"}${l.company ? ` · ${l.company}` : ""}`,
          href: `/admin/crm/leads/${l.id}`,
          urgent: false,
        });
      }
    });

    setNotifications(notifs);
  }, []);

  const loadLeads = useCallback(() => {
    const t = tok();
    if (!t) return;
    Promise.all([
      fetch("/api/crm/leads", { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
      fetch("/api/crm/tasks", { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
      fetch("/api/crm/email-templates", { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
    ]).then(([ld, td, tmpl]) => {
      const leads: CrmLead[] = ld.leads || [];
      const tasks: NavTask[] = td.tasks || [];
      setAllLeads(leads);
      setTemplates(tmpl.templates || []);
      buildNotifications(leads, tasks);
    }).catch(() => {});
  }, [buildNotifications]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  useEffect(() => {
    if (search.length < 2) { setDebouncedSearch(""); return; }
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        if (modal === "profile") setModal(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [modal]);

  const logout = () => { localStorage.removeItem("adminToken"); navigate("/admin"); };

  const isActive = (href: string, exact?: boolean) => {
    if (exact || href === "/admin/crm") return location === href;
    return location.startsWith(href);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f1f3f5" }}>
      {/* Modals */}
      {modal === "email" && (
        <EmailComposeModal leads={allLeads} templates={templates} onClose={() => setModal(null)} />
      )}
      {modal === "sms" && <SmsModal leads={allLeads} onClose={() => setModal(null)} />}
      {modal === "person" && (
        <NewPersonModal leads={allLeads} onClose={() => setModal(null)} onCreated={loadLeads} />
      )}

      {/* Dark top nav */}
      <nav className="bg-[#1e293b] h-12 flex items-center px-3 shrink-0 z-50 relative gap-1">
        {/* Logo */}
        <div className="flex items-center shrink-0 mr-2">
          <Link href="/admin/crm">
            <div className="cursor-pointer"><SiteMintLogo variant="light" iconSize={20} /></div>
          </Link>
        </div>

        {/* Nav items */}
        <div className="flex items-center h-full overflow-x-auto no-scrollbar">
          {NAV_ITEMS.map(({ href, label }) => (
            <Link key={href} href={href}>
              <button className={`h-12 px-3 text-[13px] font-medium whitespace-nowrap transition-colors relative shrink-0 ${
                isActive(href)
                  ? "text-white after:absolute after:bottom-0 after:left-2 after:right-2 after:h-0.5 after:bg-blue-400 after:rounded-full"
                  : "text-white/55 hover:text-white/90"
              }`}>
                {label}
              </button>
            </Link>
          ))}
        </div>

        {/* Global Search */}
        <div className="flex-1 max-w-xs mx-3 relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/35 z-10" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
            onKeyDown={e => { if (e.key === "Escape") { setSearch(""); setSearchFocused(false); setDebouncedSearch(""); } }}
            placeholder="Search people…"
            className="w-full bg-white/10 text-white text-xs placeholder-white/35 pl-8 pr-3 py-1.5 rounded-md border border-white/10 focus:outline-none focus:border-white/30 focus:bg-white/15"
          />
          {searchFocused && debouncedSearch.length > 1 && (
            <GlobalSearchDropdown
              q={debouncedSearch}
              onNavigate={navigate}
              onClose={() => { setSearch(""); setSearchFocused(false); setDebouncedSearch(""); }}
            />
          )}
        </div>

        {/* Right action icons */}
        <div className="flex items-center gap-1.5 ml-auto shrink-0">
          {/* Email compose */}
          <button onClick={() => setModal("email")} title="Compose email"
            className="w-7 h-7 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center transition-colors">
            <Mail className="w-3.5 h-3.5 text-white" />
          </button>

          {/* Call */}
          <div className="relative" ref={phoneRef}>
            <button onClick={() => setModal(m => m === "phone" ? null : "phone")} title="Call a contact"
              className="w-7 h-7 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors">
              <Phone className="w-3.5 h-3.5 text-white" />
            </button>
            {modal === "phone" && (
              <PhoneDropdown leads={allLeads} onClose={() => setModal(null)} />
            )}
          </div>

          {/* SMS */}
          <button onClick={() => setModal("sms")} title="SMS — Connect provider in Admin > Settings"
            className="w-7 h-7 bg-sky-600 hover:bg-sky-700 rounded-full flex items-center justify-center transition-colors">
            <MessageSquare className="w-3.5 h-3.5 text-white" />
          </button>

          {/* New Person */}
          <button onClick={() => setModal("person")} title="Add new person"
            className="w-7 h-7 bg-indigo-500 hover:bg-indigo-600 rounded-full flex items-center justify-center transition-colors">
            <UserPlus className="w-3.5 h-3.5 text-white" />
          </button>

          {/* Bell */}
          <div className="relative" ref={bellRef}>
            <button onClick={() => setModal(m => m === "bell" ? null : "bell")} title="Notifications"
              className="w-7 h-7 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors">
              <Bell className="w-3.5 h-3.5 text-white/70" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none pointer-events-none">
                  {notifications.length > 9 ? "9+" : notifications.length}
                </span>
              )}
            </button>
            {modal === "bell" && <BellDropdown notifications={notifications} onClose={() => setModal(null)} />}
          </div>

          {/* Avatar/Profile */}
          <div className="relative ml-1" ref={profileRef}>
            <button onClick={() => setModal(m => m === "profile" ? null : "profile")}
              className="flex items-center gap-1 focus:outline-none">
              <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center">
                <span className="text-white text-[11px] font-bold">SM</span>
              </div>
              <ChevronDown className={`w-3 h-3 text-white/50 transition-transform ${modal === "profile" ? "rotate-180" : ""}`} />
            </button>
            {modal === "profile" && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl shadow-2xl border border-gray-200 z-[200] overflow-hidden py-1">
                <div className="px-4 py-2.5 border-b border-gray-100">
                  <p className="text-xs font-semibold text-foreground">SiteMint Digital</p>
                  <p className="text-xs text-muted-foreground">Admin</p>
                </div>
                <Link href="/admin/crm/settings">
                  <button onClick={() => setModal(null)} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-gray-50 transition-colors">Settings</button>
                </Link>
                <Link href="/admin/dashboard">
                  <button onClick={() => setModal(null)} className="w-full text-left px-4 py-2 text-sm text-foreground hover:bg-gray-50 transition-colors flex items-center gap-2">
                    <LayoutDashboard className="w-3.5 h-3.5 text-muted-foreground" /> Submissions
                  </button>
                </Link>
                <button onClick={logout}
                  className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2">
                  <LogOut className="w-3.5 h-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 overflow-auto">
        <CrmErrorBoundary>
          {children}
        </CrmErrorBoundary>
      </main>
    </div>
  );
}
