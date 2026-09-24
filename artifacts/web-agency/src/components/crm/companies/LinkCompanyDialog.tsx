import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Search, Unlink, XCircle } from "lucide-react";
import { useCrmAssignees } from "@/lib/crmAssignees";
import { CompanyFormDialog } from "@/components/crm/companies/CompanyFormDialog";
import { listCompanies, setContactCompany, type Company } from "@/lib/crmCompanies";

/**
 * "Change company" on a contact record.
 *
 * Three doors, because a contact arrives in three states: linked to a company,
 * carrying only the company text somebody typed, or with neither. So this can
 * search the companies that exist, create one from the text already on the
 * contact, or unlink — and it never guesses which of those was meant.
 */
export function LinkCompanyDialog({
  open, contact, currentCompany, onClose, onChanged,
}: {
  open: boolean;
  contact: { id: number; name: string; companyText: string | null };
  currentCompany: { id: number; name: string } | null;
  onClose: () => void;
  /** Called after the contact's company actually changed. */
  onChanged: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Company[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const people = useCrmAssignees();

  useEffect(() => {
    if (!open) return;
    setQuery((contact.companyText ?? "").trim());
    setError(""); setResults(null);
  }, [open, contact.companyText]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true); setError("");
      try {
        const result = await listCompanies({ search: query.trim() || undefined, limit: 10 });
        if (!cancelled) setResults(result.companies);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't search companies.");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, query]);

  async function link(company: { id: number; name: string } | null) {
    setBusy(true); setError("");
    try {
      await setContactCompany(contact.id, company ? company.id : null);
      onChanged(company
        ? `${contact.name} is now linked to ${company.name}.`
        : `${contact.name} is no longer linked to a company.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open && !showCreate} onOpenChange={(next) => { if (!next) onClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{currentCompany ? "Change company" : "Link to a company"}</DialogTitle>
            <DialogDescription>
              {currentCompany
                ? `${contact.name} is linked to ${currentCompany.name}. Pick another company, or unlink.`
                : contact.companyText
                  ? `${contact.name} has “${contact.companyText}” written on the record. Link them to that company, or to any other.`
                  : `Search for the company ${contact.name} works at.`}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              aria-label="Search companies"
              autoFocus
              className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Search a company by name or domain…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
            {results && results.length === 0 && !searching && (
              <p className="text-sm text-muted-foreground">
                No company matches that yet.
              </p>
            )}
            {(results ?? []).map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border border-border rounded-lg px-3 py-2">
                <div className="min-w-0 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-foreground break-words">{c.name}</p>
                    <p className="text-xs text-muted-foreground break-all">
                      {c.domain ?? "no domain"} · {c.peopleCount} {c.peopleCount === 1 ? "person" : "people"}
                    </p>
                  </div>
                </div>
                <Button size="sm" variant={currentCompany?.id === c.id ? "ghost" : "outline"}
                  disabled={busy || currentCompany?.id === c.id}
                  onClick={() => void link({ id: c.id, name: c.name })}>
                  {currentCompany?.id === c.id ? "Linked" : "Link"}
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" disabled={busy} onClick={() => setShowCreate(true)}>
                <Plus className="w-3.5 h-3.5" />
                {contact.companyText ? `Create “${contact.companyText}”` : "Create a new company"}
              </Button>
              {currentCompany && (
                <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" disabled={busy}
                  onClick={() => void link(null)}>
                  <Unlink className="w-3.5 h-3.5" /> Unlink
                </Button>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompanyFormDialog
        open={showCreate}
        mode="create"
        defaults={{ name: (contact.companyText ?? query).trim() }}
        assignees={people.assignees}
        assigneesLoading={people.loading}
        assigneesError={people.error}
        onReloadAssignees={people.reload}
        onClose={() => setShowCreate(false)}
        onSaved={(company) => { setShowCreate(false); void link({ id: company.id, name: company.name }); }}
      />
    </>
  );
}
