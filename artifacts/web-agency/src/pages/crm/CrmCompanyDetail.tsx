import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Archive, ArchiveRestore, Building2, ExternalLink, Globe, Mail, Phone,
  Pencil, Plus, Search, Trash2, Unlink, Users, XCircle,
} from "lucide-react";
import { useCrmAssignees } from "@/lib/crmAssignees";
import { CompanyFormDialog } from "@/components/crm/companies/CompanyFormDialog";
import {
  archiveCompany, deleteCompany, getCompany, money, restoreCompany, searchContacts,
  setContactCompany, websiteHref, websiteLabel,
  type Company, type CompanyPerson, type CompanySummaries, type ContactSearchResult,
} from "@/lib/crmCompanies";

/**
 * One company: who we know there, and everything that reaches it through them.
 *
 * Each summary prints the server's own `basis` sentence, because "3 deals" on a
 * company is a derivation — deals belong to contacts — and a number whose
 * derivation is invisible is a number nobody can check.
 */

function Section({ title, basis, count, children }: {
  title: string; basis: string; count: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-background">
      <header className="px-4 py-3 border-b border-border/60 flex items-baseline justify-between gap-3">
        <h2 className="font-semibold text-sm text-foreground">{title}</h2>
        <span className="text-xs text-muted-foreground shrink-0">{count}</span>
      </header>
      <div className="px-4 py-3 space-y-2">
        {children}
        <p className="text-[11px] text-muted-foreground pt-1">{basis}</p>
      </div>
    </section>
  );
}

function Row({ href, primary, secondary, trailing }: {
  href?: string; primary: string; secondary?: string | null; trailing?: string | null;
}) {
  const body = (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-sm text-foreground break-words">{primary}</p>
        {secondary && <p className="text-xs text-muted-foreground break-words">{secondary}</p>}
      </div>
      {trailing && <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">{trailing}</span>}
    </div>
  );
  return href ? <Link href={href}><div className="cursor-pointer hover:bg-accent rounded-lg px-2 -mx-2">{body}</div></Link> : body;
}

export default function CrmCompanyDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const id = Number(params.id);

  const [company, setCompany] = useState<Company | null>(null);
  const [people, setPeople] = useState<CompanyPerson[]>([]);
  const [summaries, setSummaries] = useState<CompanySummaries | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [missing, setMissing] = useState(false);
  const [actionError, setActionError] = useState("");
  const [actionNote, setActionNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Every hook runs before the early returns below — the picker's list included.
  const assignees = useCrmAssignees();
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<ContactSearchResult[] | null>(null);
  const [linkSearching, setLinkSearching] = useState(false);
  const [showLinkPanel, setShowLinkPanel] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(""); setMissing(false);
    try {
      const result = await getCompany(id);
      setCompany(result.company);
      setPeople(result.people);
      setSummaries(result.summaries);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) setMissing(true);
      else setError(e instanceof Error ? e.message : "Couldn't load this company.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (Number.isFinite(id)) void load(); }, [id, load]);

  async function run(work: () => Promise<string | void>) {
    setBusy(true); setActionError(""); setActionNote("");
    try {
      const note = await work();
      if (typeof note === "string") setActionNote(note);
      await load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That could not be done.");
    } finally {
      setBusy(false);
    }
  }

  // Contact search for "link an existing contact", debounced like the list.
  useEffect(() => {
    if (!showLinkPanel || linkQuery.trim().length < 2) { setLinkResults(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLinkSearching(true);
      try {
        const result = await searchContacts(linkQuery.trim());
        if (!cancelled) setLinkResults(result.leads.filter((c) => c.companyId !== id));
      } catch {
        if (!cancelled) setLinkResults([]);
      } finally {
        if (!cancelled) setLinkSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [linkQuery, showLinkPanel, id]);

  if (loading && !company) {
    return (
      <CrmLayout>
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4" aria-hidden="true">
          <div className="h-6 w-48 bg-muted rounded animate-pulse" />
          <div className="h-24 rounded-xl border border-border bg-background animate-pulse" />
          <div className="h-40 rounded-xl border border-border bg-background animate-pulse" />
        </div>
      </CrmLayout>
    );
  }

  if (missing) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-2xl mx-auto text-center space-y-3">
          <Building2 className="w-9 h-9 text-muted-foreground/40 mx-auto" />
          <p className="font-semibold text-foreground">That company is not here</p>
          <p className="text-sm text-muted-foreground">It may have been deleted. The contacts that were linked to it keep all their own records.</p>
          <Link href="/admin/crm/companies"><Button variant="outline" size="sm">Back to companies</Button></Link>
        </div>
      </CrmLayout>
    );
  }

  if (error && !company) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-2xl mx-auto text-center space-y-3">
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
        </div>
      </CrmLayout>
    );
  }

  if (!company || !summaries) return <CrmLayout><div className="p-6" /></CrmLayout>;

  const website = websiteHref(company.website);
  const archived = !!company.archivedAt;

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
        <Link href="/admin/crm/companies">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Companies
          </button>
        </Link>

        {/* Header */}
        <div className="rounded-xl border border-border bg-background px-4 py-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
                <Building2 className="w-5 h-5 text-teal-700" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-foreground break-words">
                  {company.name}
                  {archived && (
                    <span className="ml-2 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">Archived</span>
                  )}
                </h1>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                  {company.domain && <span className="break-all">{company.domain}</span>}
                  {website && (
                    <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground break-all">
                      <Globe className="w-3 h-3 shrink-0" /> {websiteLabel(company.website)}
                    </a>
                  )}
                  {company.phone && (
                    <a href={`tel:${company.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                      <Phone className="w-3 h-3 shrink-0" /> {company.phone}
                    </a>
                  )}
                  {company.industry && <span>{company.industry}</span>}
                  <span>{company.owner?.displayName ? `Looked after by ${company.owner.displayName}` : "Nobody looks after it yet"}</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 shrink-0">
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowEdit(true)} disabled={busy}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Button>
              {archived ? (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={busy}
                  onClick={() => void run(async () => { await restoreCompany(company.id); return "Restored — people can be linked to it again."; })}>
                  <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" disabled={busy}
                  onClick={() => void run(async () => { await archiveCompany(company.id); return "Archived. The people linked to it stay linked; no new contact can be linked until it is restored."; })}>
                  <Archive className="w-3.5 h-3.5" /> Archive
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5 text-red-700" disabled={busy}
                onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </Button>
            </div>
          </div>

          {(company.addressLine1 || company.city || company.country) && (
            <p className="text-xs text-muted-foreground mt-3">
              {[company.addressLine1, company.addressLine2, company.city, company.region, company.postalCode, company.country]
                .filter(Boolean).join(", ")}
            </p>
          )}

          {actionError && (
            <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" /> {actionError}
            </p>
          )}
          {actionNote && (
            <p className="mt-3 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{actionNote}</p>
          )}

          {confirmDelete && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-2">
              <p className="text-sm text-red-800">
                Delete {company.name}? The contacts keep every record they have — this removes the company itself, and it
                cannot be undone. Archiving is the reversible option.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white border-0" disabled={busy}
                  onClick={() => void run(async () => {
                    await deleteCompany(company.id);
                    navigate("/admin/crm/companies");
                  })}>
                  Delete the company
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* People */}
        <section className="rounded-xl border border-border bg-background">
          <header className="px-4 py-3 border-b border-border/60 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-sm text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" /> People ({people.length})
            </h2>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={archived}
              title={archived ? "Restore the company before linking people to it" : undefined}
              onClick={() => setShowLinkPanel((v) => !v)}>
              <Plus className="w-3.5 h-3.5" /> Link a contact
            </Button>
          </header>

          {showLinkPanel && !archived && (
            <div className="px-4 py-3 border-b border-border/60 space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  aria-label="Search contacts to link"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  placeholder="Search a contact by name, email or phone…"
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                />
              </div>
              {linkSearching && <p className="text-xs text-muted-foreground">Searching…</p>}
              {linkResults && linkResults.length === 0 && !linkSearching && (
                <p className="text-xs text-muted-foreground">No contact matches that. A contact already here is not offered.</p>
              )}
              {(linkResults ?? []).slice(0, 8).map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground break-words">{c.name}</p>
                    <p className="text-xs text-muted-foreground break-all">
                      {c.email}
                      {c.companyName ? ` · currently linked to ${c.companyName}` : c.company ? ` · company on file: ${c.company}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => void run(async () => {
                      await setContactCompany(c.id, company.id);
                      setLinkQuery(""); setLinkResults(null);
                      return `${c.name} is now linked to ${company.name}.`;
                    })}>
                    Link
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-3">
            {people.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Nobody is linked to this company yet. Link a contact, or apply a suggestion from the Companies page.
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {people.map((p) => (
                  <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/admin/crm/leads/${p.id}`}>
                        <span className="text-sm font-medium text-foreground hover:underline cursor-pointer break-words">{p.name}</span>
                      </Link>
                      <p className="text-xs text-muted-foreground break-all flex flex-wrap items-center gap-x-2">
                        <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" />{p.email}</span>
                        {p.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" />{p.phone}</span>}
                        <span>{p.status}</span>
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground" disabled={busy}
                      onClick={() => void run(async () => {
                        await setContactCompany(p.id, null);
                        return `${p.name} is no longer linked to ${company.name}. The contact keeps everything else.`;
                      })}>
                      <Unlink className="w-3.5 h-3.5" /> Unlink
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* What is going on with them */}
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Deals" basis={summaries.deals.basis} count={summaries.deals.count}>
            {summaries.deals.items.length === 0
              ? <p className="text-sm text-muted-foreground">None.</p>
              : summaries.deals.items.slice(0, 8).map((d) => (
                <Row key={d.id} href={d.leadId ? `/admin/crm/leads/${d.leadId}` : undefined}
                  primary={d.name} secondary={`${d.stage}${d.leadName ? ` · ${d.leadName}` : ""}`} trailing={money(d.value)} />
              ))}
            {summaries.deals.count > 0 && (
              <p className="text-xs text-muted-foreground">
                {summaries.deals.totals.open} open · {money(summaries.deals.totals.openValue)} in play · {money(summaries.deals.totals.wonValue)} won
              </p>
            )}
          </Section>

          <Section title="Projects" basis={summaries.projects.basis} count={summaries.projects.count}>
            {summaries.projects.items.length === 0
              ? <p className="text-sm text-muted-foreground">None.</p>
              : summaries.projects.items.slice(0, 8).map((p) => (
                <Row key={p.id} href="/admin/crm/projects" primary={p.name}
                  secondary={`${p.stage}${p.leadName ? ` · ${p.leadName}` : ""}`}
                  trailing={p.targetLaunchDate ? `launch ${p.targetLaunchDate}` : null} />
              ))}
          </Section>

          <Section title="Open support tickets" basis={summaries.supportTickets.basis} count={summaries.supportTickets.count}>
            {summaries.supportTickets.items.length === 0
              ? <p className="text-sm text-muted-foreground">None open. {summaries.supportTickets.all} in total.</p>
              : summaries.supportTickets.items.slice(0, 8).map((t) => (
                <Row key={t.id} href="/admin/crm/support" primary={t.subject}
                  secondary={`${t.reference} · ${t.status}${t.leadName ? ` · ${t.leadName}` : ""}`} trailing={t.priority} />
              ))}
          </Section>

          <Section title="Quotes" basis={summaries.quotes.basis} count={summaries.quotes.count}>
            {summaries.quotes.items.length === 0
              ? <p className="text-sm text-muted-foreground">None.</p>
              : summaries.quotes.items.slice(0, 8).map((q) => (
                <Row key={q.id} href={q.leadId ? `/admin/crm/leads/${q.leadId}` : undefined} primary={q.title}
                  secondary={`${q.reference} · ${q.status}${q.leadName ? ` · ${q.leadName}` : ""}`} trailing={money(q.total, q.currency)} />
              ))}
          </Section>

          <Section title="Invoices" basis={summaries.invoices.basis} count={summaries.invoices.count}>
            {summaries.invoices.items.length === 0
              ? <p className="text-sm text-muted-foreground">None.</p>
              : summaries.invoices.items.slice(0, 8).map((i) => (
                <Row key={i.id} href={i.leadId ? `/admin/crm/leads/${i.leadId}` : undefined} primary={i.title}
                  secondary={`${i.reference} · ${i.status}${i.leadName ? ` · ${i.leadName}` : ""}`} trailing={money(i.total, i.currency)} />
              ))}
            {summaries.invoices.outstandingByCurrency.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Outstanding: {summaries.invoices.outstandingByCurrency.map((o) => money(o.amount, o.currency)).join(" · ")}
              </p>
            )}
          </Section>

          <Section title="Recent activity" basis={summaries.activities.basis} count={summaries.activities.count}>
            {summaries.activities.items.length === 0
              ? <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
              : summaries.activities.items.slice(0, 10).map((a) => (
                <Row key={a.id} href={a.leadId ? `/admin/crm/leads/${a.leadId}` : undefined} primary={a.title}
                  secondary={`${a.leadName ?? ""}${a.createdBy ? ` · ${a.createdBy}` : ""}`}
                  trailing={new Date(a.createdAt).toLocaleDateString()} />
              ))}
          </Section>
        </div>

        {company.notes && (
          <section className="rounded-xl border border-border bg-background px-4 py-3">
            <h2 className="font-semibold text-sm text-foreground mb-1.5">Notes</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{company.notes}</p>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          Added {new Date(company.createdAt).toLocaleDateString()}
          {company.createdBy?.displayName ? ` by ${company.createdBy.displayName}` : ""} ·
          {" "}last changed {new Date(company.updatedAt).toLocaleDateString()}
          {" · "}
          <Link href={`/admin/crm/leads?companyId=${company.id}`}>
            <span className="underline cursor-pointer inline-flex items-center gap-1">
              See its people in Contacts <ExternalLink className="w-3 h-3" />
            </span>
          </Link>
        </p>
      </div>

      <CompanyFormDialog
        open={showEdit}
        mode="edit"
        company={company}
        assignees={assignees.assignees}
        assigneesLoading={assignees.loading}
        assigneesError={assignees.error}
        onReloadAssignees={assignees.reload}
        onClose={() => setShowEdit(false)}
        onSaved={() => { setShowEdit(false); void load(); }}
      />
    </CrmLayout>
  );
}
