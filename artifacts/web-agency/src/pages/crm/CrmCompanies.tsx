import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import { Button } from "@/components/ui/button";
import { Building2, Plus, RefreshCw, Search, Sparkles, XCircle } from "lucide-react";
import { useCrmAssignees } from "@/lib/crmAssignees";
import { CompanyFormDialog } from "@/components/crm/companies/CompanyFormDialog";
import { CompanySuggestionsDialog } from "@/components/crm/companies/CompanySuggestionsDialog";
import { companyHref, listCompanies, websiteLabel, type Company } from "@/lib/crmCompanies";

/**
 * Companies — the businesses, as distinct from the people who work there.
 *
 * The page is deliberately plain: who they are, how many people we know there,
 * who looks after them, and when they last changed. Everything else lives on
 * the record. The empty state is the important screen, because on the day this
 * ships every install has zero companies and a contact book full of typed
 * company names — so it offers both doors: add one, or review what the contacts
 * already suggest.
 */

const PAGE_SIZE = 50;

function updatedAgo(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(value).toLocaleDateString();
}

export default function CrmCompanies() {
  const [, navigate] = useLocation();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [archivedCount, setArchivedCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const people = useCrmAssignees();

  const load = useCallback(async (opts?: { offset?: number }) => {
    const nextOffset = opts?.offset ?? 0;
    setLoading(true); setError("");
    try {
      const result = await listCompanies({
        search: search.trim() || undefined,
        ownerStaffId: ownerFilter === "" ? null : ownerFilter === "none" ? "none" : Number(ownerFilter),
        includeArchived,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setCompanies(result.companies);
      setTotal(result.total);
      setArchivedCount(result.archivedCount);
      setOffset(result.offset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load companies.");
    } finally {
      setLoading(false);
    }
  }, [search, ownerFilter, includeArchived]);

  // Searching is debounced so typing does not queue a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => { void load({ offset: 0 }); }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const hasFilters = search.trim() !== "" || ownerFilter !== "" || includeArchived;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + companies.length, total);

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Companies</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              The businesses you work with. Each person you know there stays a contact, linked to the company.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-11 [@media(hover:hover)]:h-9"
              onClick={() => setShowSuggestions(true)}>
              <Sparkles className="w-3.5 h-3.5" /> Review suggestions
            </Button>
            <Button size="sm" className="gap-1.5 h-11 [@media(hover:hover)]:h-9 bg-teal-600 hover:bg-teal-700 text-white border-0"
              onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Add a company
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              aria-label="Search companies by name or domain"
              className="w-full pl-9 pr-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20"
              placeholder="Search name or domain…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Filter by who looks after the company"
            className="px-3 py-2 text-sm border border-input rounded-lg bg-background focus:outline-none"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
          >
            <option value="">Anyone</option>
            <option value="none">Nobody yet</option>
            {people.assignees.map((a) => <option key={a.id} value={String(a.id)}>{a.displayName}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground px-2 py-2">
            <input
              type="checkbox"
              className="w-4 h-4 accent-teal-600"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            Show archived{archivedCount > 0 ? ` (${archivedCount})` : ""}
          </label>
          <Button variant="ghost" size="sm" className="h-11 [@media(hover:hover)]:h-9" onClick={() => void load({ offset })}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2"><XCircle className="w-4 h-4 shrink-0" /> {error}</span>
            <Button size="sm" variant="outline" onClick={() => void load({ offset })}>Try again</Button>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && companies.length === 0 && !error && (
          <div className="space-y-2" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border bg-background px-4 py-4 animate-pulse flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 bg-muted rounded" />
                  <div className="h-2 w-24 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && companies.length === 0 && (
          <div className="rounded-xl border border-border bg-background px-5 py-12 text-center">
            <Building2 className="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-semibold text-foreground">
              {hasFilters ? "No companies match that" : "No companies yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              {hasFilters
                ? "Clear the search or the filters to see the whole list."
                : "A company is the business itself — so one record holds its people, its deals, its projects and what it owes, instead of that living on one contact."}
            </p>
            {!hasFilters && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                <Button size="sm" className="gap-1.5 bg-teal-600 hover:bg-teal-700 text-white border-0" onClick={() => setShowCreate(true)}>
                  <Plus className="w-3.5 h-3.5" /> Add a company
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowSuggestions(true)}>
                  <Sparkles className="w-3.5 h-3.5" /> Review suggestions from your contacts
                </Button>
              </div>
            )}
          </div>
        )}

        {/* The list — stacked cards on a phone, a table from md up */}
        {companies.length > 0 && (
          <>
            <div className="md:hidden space-y-2">
              {companies.map((c) => (
                <Link key={c.id} href={companyHref(c.id)}>
                  <div className="rounded-xl border border-border bg-background px-4 py-3 active:bg-accent cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground break-words">{c.name}</p>
                        {(c.domain || c.website) && (
                          <p className="text-xs text-muted-foreground break-all">{c.domain ?? websiteLabel(c.website)}</p>
                        )}
                      </div>
                      {c.archivedAt && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">Archived</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      {c.peopleCount} {c.peopleCount === 1 ? "person" : "people"}
                      {c.owner?.displayName ? ` · ${c.owner.displayName}` : " · nobody looks after it yet"}
                      {` · updated ${updatedAgo(c.updatedAt)}`}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="hidden md:block rounded-xl border border-border bg-background overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border/60">
                  <tr>
                    {["Company", "People", "Looked after by", "Updated"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {companies.map((c) => (
                    <tr key={c.id} className="hover:bg-accent/70 transition-colors cursor-pointer"
                      onClick={() => navigate(companyHref(c.id))}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4 text-teal-700" />
                          </div>
                          <div className="min-w-0">
                            <Link href={companyHref(c.id)}>
                              <span className="font-medium text-foreground hover:underline break-words">{c.name}</span>
                            </Link>
                            {(c.domain || c.website) && (
                              <span className="block text-xs text-muted-foreground break-all">{c.domain ?? websiteLabel(c.website)}</span>
                            )}
                          </div>
                          {c.archivedAt && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">Archived</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{c.peopleCount}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {c.owner?.displayName ?? <span className="text-muted-foreground/60">Nobody yet</span>}
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{updatedAgo(c.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                Showing {showingFrom}–{showingTo} of {total}
              </p>
              {total > PAGE_SIZE && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={offset === 0 || loading}
                    onClick={() => void load({ offset: Math.max(0, offset - PAGE_SIZE) })}>
                    Previous
                  </Button>
                  <Button size="sm" variant="outline" disabled={showingTo >= total || loading}
                    onClick={() => void load({ offset: offset + PAGE_SIZE })}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <CompanyFormDialog
        open={showCreate}
        mode="create"
        assignees={people.assignees}
        assigneesLoading={people.loading}
        assigneesError={people.error}
        onReloadAssignees={people.reload}
        onClose={() => setShowCreate(false)}
        onSaved={(company) => { setShowCreate(false); navigate(companyHref(company.id)); }}
      />

      <CompanySuggestionsDialog
        open={showSuggestions}
        onClose={() => setShowSuggestions(false)}
        onApplied={() => { void load({ offset: 0 }); }}
      />
    </CrmLayout>
  );
}
