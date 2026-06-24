import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Mail, X } from "lucide-react";

const token = () => localStorage.getItem("adminToken") || "";

interface Template { id:number; name:string; type:string; subject:string; body:string; }

const DEFAULT_TEMPLATES = [
  { name:"Initial Outreach", type:"initial_outreach", subject:"Hi {{name}}, let's talk about your website", body:"Hi {{name}},\n\nI came across your business and wanted to reach out about how SiteMint Digital can help you grow your online presence.\n\nWe specialize in building custom websites, CRM systems, and automation tools that help businesses like yours get more customers.\n\nWould you be open to a quick 15-minute call this week?\n\nBest,\nThe SiteMint Digital Team" },
  { name:"Follow-Up", type:"follow_up", subject:"Following up — SiteMint Digital", body:"Hi {{name}},\n\nI wanted to follow up on my previous message. I'd love to learn more about your business goals and see if we might be a good fit.\n\nIf you have any questions or would like to schedule a call, just reply to this email.\n\nLooking forward to hearing from you!\n\nBest,\nThe SiteMint Digital Team" },
  { name:"Discovery Call Reminder", type:"discovery_reminder", subject:"Your discovery call with SiteMint Digital — tomorrow", body:"Hi {{name}},\n\nJust a quick reminder that we have a discovery call scheduled for tomorrow. We're looking forward to learning more about your project.\n\nPlease feel free to prepare any questions you have about our process, pricing, or timeline.\n\nSee you then!\n\nBest,\nClaidy Taguran\nTechnical Director, SiteMint Digital" },
  { name:"Proposal Sent", type:"proposal_sent", subject:"Your SiteMint Digital Proposal is Ready", body:"Hi {{name}},\n\nThank you for meeting with us! I've prepared a custom proposal based on our conversation.\n\nPlease review it at your convenience. I'm happy to walk you through it on a call or answer any questions via email.\n\nWe're excited about the opportunity to work with you.\n\nBest,\nThe SiteMint Digital Team" },
  { name:"Checking In", type:"checking_in", subject:"Checking in — SiteMint Digital", body:"Hi {{name}},\n\nI wanted to check in and see how things are going. We're still here if you're ready to move forward with your project.\n\nFeel free to reach out whenever you're ready — no pressure at all.\n\nBest,\nThe SiteMint Digital Team" },
  { name:"Thank You", type:"thank_you", subject:"Thank you for choosing SiteMint Digital!", body:"Hi {{name}},\n\nThank you for trusting SiteMint Digital with your project. We're thrilled to get started and will be in touch shortly to kick things off.\n\nExpect a welcome email from our team within the next 24 hours with next steps.\n\nWe can't wait to build something great together!\n\nBest,\nThe SiteMint Digital Team" },
];

const emptyForm = { name:"", type:"Other", subject:"", body:"" };

export default function CrmEmailTemplates() {
  const [, navigate] = useLocation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template|null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    if (!token()) { navigate("/admin"); return; }
    const r = await fetch("/api/crm/email-templates", { headers: { Authorization: `Bearer ${token()}` } });
    if (r.status === 401) { navigate("/admin"); return; }
    const d = await r.json() as { templates: Template[] };
    setTemplates(d.templates || []);
    setLoading(false);
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (t: Template) => { setEditing(t); setForm({ name:t.name, type:t.type, subject:t.subject, body:t.body }); setShowForm(true); };

  const save = async () => {
    if (!form.name || !form.subject || !form.body) return;
    setSaving(true);
    if (editing) {
      await fetch(`/api/crm/email-templates/${editing.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/crm/email-templates", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setSaving(false); setShowForm(false); load();
  };

  const deleteTemplate = async (id: number) => {
    if (!confirm("Delete this template?")) return;
    await fetch(`/api/crm/email-templates/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token()}` } });
    load();
  };

  const seedDefaults = async () => {
    setSeeding(true);
    for (const t of DEFAULT_TEMPLATES) {
      await fetch("/api/crm/email-templates", {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
    }
    setSeeding(false); load();
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
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-serif font-bold text-foreground">Email Templates</h1>
            <p className="text-muted-foreground text-sm mt-0.5">{templates.length} templates · Use {"{{name}}"} for personalization</p>
          </div>
          <div className="flex gap-2">
            {templates.length === 0 && (
              <Button variant="outline" size="sm" onClick={seedDefaults} disabled={seeding}>
                {seeding ? "Loading…" : "Load Default Templates"}
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5" /> New Template
            </Button>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
            <Mail className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No email templates yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Click "Load Default Templates" to add 6 pre-built ones.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">{t.name}</h3>
                    <span className="text-xs text-muted-foreground">{t.type.replace(/_/g," ")}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 text-gray-400 hover:text-foreground transition-colors rounded">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteTemplate(t.id)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-2 border-b border-gray-100 pb-2">{t.subject}</p>
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{t.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-serif font-bold text-lg">{editing ? "Edit Template" : "New Template"}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-foreground"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Template Name</label>
                  <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" placeholder="e.g. Initial Outreach" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Type</label>
                  <select className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {["initial_outreach","follow_up","discovery_reminder","proposal_sent","checking_in","thank_you","Other"].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Subject</label>
                <input className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none" placeholder="Email subject" value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Body <span className="text-muted-foreground/60 font-normal">(use {"{{name}}"} for personalization)</span></label>
                <textarea className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none resize-none" rows={10} placeholder="Email body…" value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-gray-100">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={saving||!form.name||!form.subject||!form.body}>
                {saving ? "Saving…" : editing ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </CrmLayout>
  );
}
