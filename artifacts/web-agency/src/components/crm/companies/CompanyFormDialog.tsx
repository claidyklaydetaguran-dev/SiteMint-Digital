import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { OwnerPicker } from "@/components/crm/OwnerPicker";
import type { CrmAssignee } from "@/lib/crmAssignees";
import {
  CompanyError, companyHref, createCompany, updateCompany,
  type Company, type DuplicateCandidate,
} from "@/lib/crmCompanies";

/**
 * Add or edit a company.
 *
 * The duplicate warning is the interesting part. The server answers 409 with
 * the companies that already match the name or the domain, and this shows them
 * with what they matched on and how many people they have — so the choice is
 * "open that one" or "create this one anyway", made on the evidence, rather
 * than a refusal or a silent second copy.
 */

const TEXT_FIELDS: Array<{ key: keyof FormState; label: string; placeholder?: string; type?: string }> = [
  { key: "name", label: "Company name", placeholder: "Acme Widgets Ltd" },
  { key: "domain", label: "Web domain", placeholder: "acme.com" },
  { key: "website", label: "Website", placeholder: "https://acme.com", type: "url" },
  { key: "phone", label: "Phone", placeholder: "+1 555 010 0100", type: "tel" },
  { key: "industry", label: "Industry", placeholder: "Manufacturing" },
  { key: "addressLine1", label: "Address", placeholder: "Unit 4, Trellis Park" },
  { key: "addressLine2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "region", label: "State or region" },
  { key: "postalCode", label: "Postal code" },
  { key: "country", label: "Country" },
];

interface FormState {
  name: string;
  domain: string;
  website: string;
  phone: string;
  industry: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  notes: string;
  ownerStaffId: number | null;
}

const EMPTY: FormState = {
  name: "", domain: "", website: "", phone: "", industry: "",
  addressLine1: "", addressLine2: "", city: "", region: "", postalCode: "",
  country: "", notes: "", ownerStaffId: null,
};

function fromCompany(company: Company): FormState {
  return {
    name: company.name ?? "",
    domain: company.domain ?? "",
    website: company.website ?? "",
    phone: company.phone ?? "",
    industry: company.industry ?? "",
    addressLine1: company.addressLine1 ?? "",
    addressLine2: company.addressLine2 ?? "",
    city: company.city ?? "",
    region: company.region ?? "",
    postalCode: company.postalCode ?? "",
    country: company.country ?? "",
    notes: company.notes ?? "",
    ownerStaffId: company.ownerStaffId ?? null,
  };
}

export function CompanyFormDialog({
  open, mode, company = null, defaults, assignees, assigneesLoading = false, assigneesError = "",
  onReloadAssignees, onClose, onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  company?: Company | null;
  /** Pre-filled values — used when a company is created from a contact's typed text. */
  defaults?: { name?: string; domain?: string | null };
  assignees: CrmAssignee[];
  assigneesLoading?: boolean;
  assigneesError?: string;
  onReloadAssignees?: () => void;
  onClose: () => void;
  onSaved: (company: Company) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(""); setFieldError(null); setDuplicates(null);
    setForm(mode === "edit" && company
      ? fromCompany(company)
      : { ...EMPTY, name: defaults?.name ?? "", domain: defaults?.domain ?? "" });
  }, [open, mode, company, defaults?.name, defaults?.domain]);

  const set = (key: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldError?.field === key) setFieldError(null);
  };

  async function save(confirmDuplicate: boolean) {
    if (!form.name.trim()) {
      setFieldError({ field: "name", message: "A company needs a name." });
      return;
    }
    setSaving(true); setError("");
    const body: Record<string, unknown> = { ...form, confirmDuplicate };
    try {
      const result = mode === "create"
        ? await createCompany(body)
        : await updateCompany(company!.id, body);
      setDuplicates(null);
      onSaved(result.company);
    } catch (e) {
      if (e instanceof CompanyError && e.code === "possible_duplicate" && e.candidates) {
        setDuplicates(e.candidates);
      } else if (e instanceof CompanyError && e.field) {
        setFieldError({ field: e.field, message: e.message });
      } else {
        setError(e instanceof Error ? e.message : "The company could not be saved.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add a company" : `Edit ${company?.name ?? "company"}`}</DialogTitle>
          <DialogDescription>
            A company is the business itself. The people who work there stay contacts, and each one links to it.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        {duplicates && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
            <p className="text-sm font-semibold text-amber-900 flex items-start gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              {duplicates.length === 1 ? "A company already matches this one" : `${duplicates.length} companies already match this one`}
            </p>
            <ul className="space-y-1.5">
              {duplicates.map((c) => (
                <li key={c.id} className="text-xs text-amber-900 flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                  {c.domain && <span>· {c.domain}</span>}
                  <span>· {c.peopleCount} {c.peopleCount === 1 ? "person" : "people"}</span>
                  <span>· same {c.matchedOn.join(" and ")}</span>
                  <Link href={companyHref(c.id)}>
                    <button type="button" className="inline-flex items-center gap-1 underline font-medium">
                      Open existing <ExternalLink className="w-3 h-3" />
                    </button>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-amber-900">
              Two businesses can share a name, and a group and its subsidiary can share a domain — so this is your call.
            </p>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => void save(true)}>
              {saving ? "Saving…" : mode === "create" ? "Create anyway" : "Save anyway"}
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {TEXT_FIELDS.map(({ key, label, placeholder, type }) => (
            <div key={key} className={key === "name" || key === "addressLine1" ? "sm:col-span-2" : ""}>
              <label htmlFor={`company-${key}`} className="text-xs font-semibold text-muted-foreground block mb-1">
                {label}{key === "name" ? " *" : ""}
              </label>
              <input
                id={`company-${key}`}
                type={type ?? "text"}
                placeholder={placeholder}
                value={String(form[key] ?? "")}
                onChange={(e) => set(key, e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg text-sm bg-background focus:outline-none focus:ring-2 focus:ring-foreground/20 ${
                  fieldError?.field === key ? "border-red-300 bg-red-50" : "border-input"
                }`}
              />
              {fieldError?.field === key && <p className="text-xs text-red-600 mt-1">{fieldError.message}</p>}
            </div>
          ))}

          <div className="sm:col-span-2">
            <label htmlFor="company-owner" className="text-xs font-semibold text-muted-foreground block mb-1">
              Who looks after this company
            </label>
            <OwnerPicker
              id="company-owner"
              value={form.ownerStaffId}
              onChange={(next) => setForm((f) => ({ ...f, ownerStaffId: typeof next === "number" ? next : null }))}
              assignees={assignees}
              loading={assigneesLoading}
              error={assigneesError}
              onRetry={onReloadAssignees}
            />
            {fieldError?.field === "ownerStaffId" && <p className="text-xs text-red-600 mt-1">{fieldError.message}</p>}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="company-notes" className="text-xs font-semibold text-muted-foreground block mb-1">Notes</label>
            <textarea
              id="company-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-lg text-sm bg-background resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="bg-teal-600 hover:bg-teal-700 text-white border-0" disabled={saving} onClick={() => void save(false)}>
            {saving ? "Saving…" : mode === "create" ? "Add company" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
