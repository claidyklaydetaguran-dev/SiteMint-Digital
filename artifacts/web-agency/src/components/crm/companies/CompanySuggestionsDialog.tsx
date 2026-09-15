import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, RefreshCw, Users, XCircle } from "lucide-react";
import {
  CompanyError, applySuggestions, companyHref, getSuggestions,
  type ApplyGroupInput, type ApplyResult, type SuggestionGroup, type Suggestions,
} from "@/lib/crmCompanies";

/**
 * "Review suggestions from your contacts".
 *
 * Nothing here links anybody on its own. The server groups contacts that are
 * not linked to a company — by the company text they carry, and separately by
 * their work email domain — and a person chooses which groups to apply and
 * whether each one creates a company or joins an existing one. The summary
 * above the button says exactly what is about to happen, and the result
 * afterwards says what did, including the contacts that were skipped because
 * somebody had already linked them.
 */

type Choice = { action: "create" | "link"; companyId: number | null; name: string; domain: string | null; confirmDuplicate: boolean };

function defaultChoice(group: SuggestionGroup): Choice {
  const linkable = group.matches.find((m) => !m.archived);
  return {
    action: linkable ? "link" : "create",
    companyId: linkable?.id ?? null,
    name: group.proposedName,
    domain: group.proposedDomain,
    confirmDuplicate: false,
  };
}

export function CompanySuggestionsDialog({
  open, onClose, onApplied,
}: {
  open: boolean;
  onClose: () => void;
  /** Called once anything was actually applied, so the list behind can refresh. */
  onApplied: () => void;
}) {
  const [data, setData] = useState<Suggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<CompanyError | null>(null);
  const [applyMessage, setApplyMessage] = useState("");
  const [outcome, setOutcome] = useState<{ results: ApplyResult[]; totals: { companiesCreated: number; contactsLinked: number; contactsSkipped: number } } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(""); setApplyError(null); setApplyMessage("");
    try {
      const result = await getSuggestions();
      setData(result);
      const next: Record<string, Choice> = {};
      for (const g of [...result.byCompanyName, ...result.byEmailDomain]) next[g.key] = defaultChoice(g);
      setChoices(next);
      setSelected({});
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "The suggestions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const groups = data ? [...data.byCompanyName, ...data.byEmailDomain] : [];
  const chosen = groups.filter((g) => selected[g.key]);
  const willCreate = chosen.filter((g) => choices[g.key]?.action === "create").length;
  const willLink = chosen.reduce((n, g) => n + g.contacts.length, 0);

  const setChoice = (key: string, patch: Partial<Choice>) =>
    setChoices((c) => ({ ...c, [key]: { ...c[key], ...patch } }));

  async function apply(confirmDuplicates: boolean) {
    if (chosen.length === 0) return;
    setApplying(true); setApplyError(null); setApplyMessage("");
    const payload: ApplyGroupInput[] = chosen.map((g) => {
      const choice = choices[g.key];
      const contactIds = g.contacts.map((c) => c.id);
      return choice.action === "link" && choice.companyId
        ? { action: "link", contactIds, companyId: choice.companyId }
        : {
          action: "create",
          contactIds,
          company: { name: choice.name.trim() || g.proposedName, domain: choice.domain },
          confirmDuplicate: confirmDuplicates || choice.confirmDuplicate,
        };
    });
    try {
      const result = await applySuggestions(payload);
      setOutcome(result);
      onApplied();
      await load();
    } catch (e) {
      if (e instanceof CompanyError) setApplyError(e);
      else setApplyMessage(e instanceof Error ? e.message : "The suggestions could not be applied.");
    } finally {
      setApplying(false);
    }
  }

  function renderGroup(group: SuggestionGroup) {
    const choice = choices[group.key] ?? defaultChoice(group);
    const isSelected = !!selected[group.key];
    const linkable = group.matches.filter((m) => !m.archived);
    const archivedOnly = group.matches.length > 0 && linkable.length === 0;
    return (
      <div key={group.key} className={`rounded-lg border px-3 py-3 ${isSelected ? "border-teal-300 bg-teal-50/60" : "border-border bg-background"}`}>
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 w-4 h-4 accent-teal-600 shrink-0"
            checked={isSelected}
            onChange={(e) => setSelected((s) => ({ ...s, [group.key]: e.target.checked }))}
          />
          <span className="min-w-0 flex-1">
            <span className="font-semibold text-sm text-foreground break-words">{group.label}</span>
            <span className="text-xs text-muted-foreground block mt-0.5">
              {group.contacts.length} {group.contacts.length === 1 ? "contact" : "contacts"}
              {group.kind === "email_domain" ? " sharing this work email domain" : " with this company on file"}
              {group.companyExists ? " · a company already matches" : ""}
              {archivedOnly ? " · the only match is archived" : ""}
            </span>
          </span>
        </label>

        <p className="text-[11px] text-muted-foreground mt-1.5 ml-7 break-words">
          {group.contacts.slice(0, 4).map((c) => c.name).join(", ")}
          {group.contacts.length > 4 ? `, and ${group.contacts.length - 4} more` : ""}
        </p>

        {isSelected && (
          <div className="ml-7 mt-2.5 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setChoice(group.key, { action: "create" })}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  choice.action === "create" ? "bg-teal-600 text-white border-teal-600" : "bg-background text-foreground border-border hover:bg-accent"
                }`}
              >
                Create a new company
              </button>
              <button
                type="button"
                disabled={linkable.length === 0}
                onClick={() => setChoice(group.key, { action: "link", companyId: linkable[0]?.id ?? null })}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                  choice.action === "link" ? "bg-teal-600 text-white border-teal-600" : "bg-background text-foreground border-border hover:bg-accent"
                }`}
              >
                Link to an existing company
              </button>
            </div>

            {choice.action === "create" ? (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  aria-label={`Name for the company from ${group.label}`}
                  value={choice.name}
                  onChange={(e) => setChoice(group.key, { name: e.target.value })}
                  className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-lg text-xs bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
                {choice.domain && <span className="text-[11px] text-muted-foreground self-center">domain: {choice.domain}</span>}
              </div>
            ) : (
              <select
                aria-label={`Company to link ${group.label} to`}
                value={choice.companyId ?? ""}
                onChange={(e) => setChoice(group.key, { companyId: Number(e.target.value) })}
                className="w-full px-2.5 py-1.5 border border-input rounded-lg text-xs bg-background focus:outline-none"
              >
                {linkable.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.domain ? ` · ${m.domain}` : ""}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { setOutcome(null); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Companies your contacts suggest</DialogTitle>
          <DialogDescription>
            Contacts that are not linked to a company yet, grouped by the company written on them and by their work
            email domain. Nothing is linked until you apply it, and only the contacts in the groups you tick.
          </DialogDescription>
        </DialogHeader>

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" /> {loadError}</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>
          </div>
        )}

        {outcome && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 space-y-2">
            <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {outcome.totals.companiesCreated} created · {outcome.totals.contactsLinked} contacts linked
              {outcome.totals.contactsSkipped > 0 ? ` · ${outcome.totals.contactsSkipped} left as they were` : ""}
            </p>
            <ul className="space-y-1">
              {outcome.results.map((r) => (
                <li key={r.groupIndex} className="text-xs text-emerald-900 break-words">
                  {r.company ? (
                    <Link href={companyHref(r.company.id)}>
                      <button type="button" className="underline font-medium">{r.company.name}</button>
                    </Link>
                  ) : "No company"}
                  {" — "}
                  {r.linked.length} linked
                  {r.skipped.length > 0 ? `, ${r.skipped.length} already linked or merged` : ""}
                  {r.note ? ` (${r.note})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {applyMessage && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{applyMessage}</p>
        )}

        {applyError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-900 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {applyError.message}
            </p>
            <p className="text-xs text-amber-900">Nothing was applied — the whole selection was rolled back together.</p>
            {applyError.code === "possible_duplicate" && (
              <>
                {(applyError.candidates ?? []).map((c) => (
                  <p key={c.id} className="text-xs text-amber-900">
                    {c.name}{c.domain ? ` · ${c.domain}` : ""} · {c.peopleCount} {c.peopleCount === 1 ? "person" : "people"}
                  </p>
                ))}
                <Button size="sm" variant="outline" disabled={applying} onClick={() => void apply(true)}>
                  Create them anyway
                </Button>
              </>
            )}
          </div>
        )}

        {loading && !data && (
          <p className="text-sm text-muted-foreground py-8 text-center">Looking through your contacts…</p>
        )}

        {data && groups.length === 0 && !loading && (
          <div className="py-8 text-center">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="font-semibold text-foreground text-sm">Nothing to suggest</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Every contact either belongs to a company already, or carries no company name and no work email domain to go on.
            </p>
          </div>
        )}

        {data && groups.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {data.counts.unlinkedContacts} contacts are not linked to a company. {data.counts.freeMailExcluded} were
              left out of the email grouping because their address is a personal mailbox, and {data.counts.placeholderExcluded} because
              the address was made up by an import.
            </p>

            {data.byCompanyName.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">By the company on the contact</h3>
                {data.byCompanyName.map(renderGroup)}
              </section>
            )}

            {data.byEmailDomain.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">By work email domain</h3>
                {data.byEmailDomain.map(renderGroup)}
              </section>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:items-center">
          <p className="text-xs text-muted-foreground mr-auto">
            {chosen.length === 0
              ? "Tick the groups you want to apply."
              : `About to create ${willCreate} ${willCreate === 1 ? "company" : "companies"} and link ${willLink} ${willLink === 1 ? "contact" : "contacts"}.`}
          </p>
          <Button variant="outline" onClick={() => void load()} disabled={loading || applying} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Rescan
          </Button>
          <Button
            className="bg-teal-600 hover:bg-teal-700 text-white border-0"
            disabled={applying || chosen.length === 0}
            onClick={() => void apply(false)}
          >
            {applying ? "Applying…" : `Apply ${chosen.length || ""}`.trim()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
