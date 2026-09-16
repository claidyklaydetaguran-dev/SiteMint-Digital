import { useEffect, useState, useCallback } from "react";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { Plus, Edit2, Trash2, Mail, X } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { type Load, failureReason, readAdminResource, responseFailureReason } from "@/lib/adminLoad";
import { Figure, LoadFailure } from "@/components/crm/LoadState";
import { useConfirmDialog } from "@/components/crm/ConfirmDialog";
import { refusalMessage } from "@/components/crm/confirmDialogModel";

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

// A body that is not the shape this page expects is a failure too — not a
// reason to report an empty library over templates that are really there.
function pickTemplates(body: unknown): Template[] | undefined {
  const list = body && typeof body === "object" ? (body as { templates?: unknown }).templates : undefined;
  return Array.isArray(list) ? list as Template[] : undefined;
}

export default function CrmEmailTemplates() {
  // The library is a `Load`. Before this there was no try/catch at all: a
  // refused or failed read left the array empty, so the page stated "0
  // templates" over "No email templates yet" and offered to seed six defaults
  // — against a backend that may hold them already. A 401 was worse still: the
  // early return left the loading flag set, so the spinner never stopped.
  const [templatesLoad, setTemplatesLoad] = useState<Load<Template[]>>({ status: "loading" });
  const [reloading, setReloading] = useState(false);
  /** A template action (save, delete, seed) the server refused. */
  const [actionNotice, setActionNotice] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template|null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const confirmation = useConfirmDialog();

  // What actually loaded, or null. Never an empty array standing in for a
  // request nobody managed to complete.
  const templates = templatesLoad.status === "ready" ? templatesLoad.data : null;

  const load = useCallback(async () => {
    setReloading(true);
    setTemplatesLoad(await readAdminResource("/api/crm/email-templates", pickTemplates));
    setReloading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(""); setShowForm(true); };
  const openEdit = (t: Template) => { setEditing(t); setForm({ name:t.name, type:t.type, subject:t.subject, body:t.body }); setFormError(""); setShowForm(true); };

  const save = async () => {
    if (!form.name || !form.subject || !form.body) return;
    setSaving(true);
    setFormError("");
    try {
      const res = editing
        ? await adminFetch(`/api/crm/email-templates/${editing.id}`, {
            method: "PUT",
            body: JSON.stringify(form),
          })
        : await adminFetch("/api/crm/email-templates", {
            method: "POST",
            body: JSON.stringify(form),
          });
      if (!res.ok) { setFormError(`Template not saved. ${await responseFailureReason(res)}`); return; }
      setShowForm(false);
      load();
    } catch {
      setFormError(`Template not saved. ${failureReason(null)}`);
    } finally {
      setSaving(false);
    }
  };

  // Both meanings kept: the dialog says what disappears, and `refusalMessage`
  // means a delete the server refused never looks like one that worked.
  const deleteTemplate = (template: Template) => {
    void confirmation.ask({
      title: `Delete the template "${template.name}"?`,
      description: "It is removed for everyone, and this cannot be undone.",
      consequences: [
        "It disappears from this list, and from the template picker used when composing an email.",
        "Emails already sent using it are not affected.",
      ],
      tone: "destructive",
      confirmLabel: "Delete template",
      busyLabel: "Deleting…",
      cancelLabel: "Keep template",
      action: async () => {
        const res = await adminFetch(`/api/crm/email-templates/${template.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await refusalMessage(res, "That template could not be deleted."));
        await load();
      },
    });
  };

  // Seeding is only ever offered when the library loaded AND came back empty.
  // Seeding against a read that merely failed would duplicate every default
  // template the backend already holds.
  const seedDefaults = async () => {
    if (templates === null) return;
    setSeeding(true);
    setActionNotice("");
    let added = 0;
    try {
      for (const t of DEFAULT_TEMPLATES) {
        const res = await adminFetch("/api/crm/email-templates", {
          method: "POST",
          body: JSON.stringify(t),
        });
        if (!res.ok) {
          setActionNotice(`${added} of ${DEFAULT_TEMPLATES.length} default templates were added, then the rest stopped. ${await responseFailureReason(res)}`);
          return;
        }
        added++;
      }
    } catch {
      setActionNotice(`${added} of ${DEFAULT_TEMPLATES.length} default templates were added, then the rest stopped. ${failureReason(null)}`);
    } finally {
      setSeeding(false);
      load();
    }
  };

  if (templatesLoad.status === "loading") return (
    <CrmLayout>
      <div className="flex items-center justify-center h-64" role="status" aria-live="polite">
        <span className="sr-only">Loading email templates…</span>
        <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
      </div>
    </CrmLayout>
  );

  return (
    <CrmLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-serif font-bold text-foreground">Email Templates</h1>
            {/* The count exists only when the library behind it loaded. */}
            <p className="text-muted-foreground text-sm mt-0.5 break-words">
              {templates
                ? <>{templates.length} template{templates.length !== 1 ? "s" : ""}</>
                : <><Figure value={null} /> templates</>}
              {" · Use "}{"{{name}}"}{" for personalization"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Offered only for a library that loaded and is genuinely empty. */}
            {templates !== null && templates.length === 0 && (
              <Button variant="outline" size="sm" onClick={seedDefaults} disabled={seeding}>
                {seeding ? "Loading…" : "Load Default Templates"}
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={openCreate}>
              <Plus className="w-3.5 h-3.5" /> New Template
            </Button>
          </div>
        </div>

        {/* A template action the server refused. */}
        {actionNotice && (
          <p role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground">
            <span className="min-w-0 break-words">{actionNotice}</span>
          </p>
        )}

        {templates === null ? (
          /*
            No library at all, rather than "0 templates · No email templates
            yet" over a shelf that may be full — and crucially, no offer to
            seed six defaults on top of them. A 401, 403, 404, 5xx or
            unreachable server each reads differently here, because the words
            come from the response.
          */
          <LoadFailure
            what="Email templates"
            reason={templatesLoad.status === "error" ? templatesLoad.reason : ""}
            onRetry={() => { void load(); }}
            retrying={reloading}
          >
            <p className="mt-2 text-sm text-muted-foreground">
              No template count is shown while this is unavailable, and the default set is not offered — adding it now could duplicate templates you already have.
            </p>
          </LoadFailure>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-xl border border-border py-16 text-center">
            <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">No email templates yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Click "Load Default Templates" to add 6 pre-built ones.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {templates.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-border shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-sm text-foreground">{t.name}</h3>
                    <span className="text-xs text-muted-foreground">{t.type.replace(/_/g," ")}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => openEdit(t)} className="p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors rounded">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteTemplate(t)} aria-label={`Delete ${t.name}`} className="p-1.5 text-muted-foreground/60 hover:text-red-500 transition-colors rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground mb-2 border-b border-border/60 pb-2">{t.subject}</p>
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
            <div className="flex items-center justify-between p-5 border-b border-border/60">
              <h2 className="font-serif font-bold text-lg">{editing ? "Edit Template" : "New Template"}</h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground/60 hover:text-foreground"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-5 space-y-4">
              {formError && (
                <p role="alert" className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 break-words">{formError}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Template Name</label>
                  <input className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none" placeholder="e.g. Initial Outreach" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1">Type</label>
                  <select className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                    {["initial_outreach","follow_up","discovery_reminder","proposal_sent","checking_in","thank_you","Other"].map(t=><option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Subject</label>
                <input className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none" placeholder="Email subject" value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1">Body <span className="text-muted-foreground/60 font-normal">(use {"{{name}}"} for personalization)</span></label>
                <textarea className="w-full px-3 py-2 border border-input rounded-lg text-sm focus:outline-none resize-none" rows={10} placeholder="Email body…" value={form.body} onChange={e=>setForm(f=>({...f,body:e.target.value}))} />
              </div>
            </div>
            <div className="flex gap-2 p-5 border-t border-border/60">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button className="flex-1" onClick={save} disabled={saving||!form.name||!form.subject||!form.body}>
                {saving ? "Saving…" : editing ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmation.element}
    </CrmLayout>
  );
}
