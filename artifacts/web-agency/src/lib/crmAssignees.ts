import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

/**
 * M6: the people a contact can be handed to.
 *
 * Three screens used to carry the same three names as string literals —
 * CrmLeads' create modal, CrmLeadDetail's Lead Management card, and
 * CrmLayout's global "New Contact" quick-add. Renaming somebody in People
 * changed none of them, and a fourth member of staff was unassignable without
 * a code change. They all read this instead.
 *
 * `GET /api/crm/operations/assignees` is the canonical list (active staff, no
 * roles, no grants, no security state, no `staff.read` needed) and is already
 * what My Day, Operations and Support use for the same question. A second
 * endpoint that could disagree with it about who exists would be a bug waiting
 * to happen.
 */
export interface CrmAssignee {
  id: number;
  displayName: string;
  email: string;
}

export function useCrmAssignees(): {
  assignees: CrmAssignee[];
  /** True until the first attempt settles, so a picker can say "Loading…". */
  loading: boolean;
  /** Set when the list could not be fetched — never silently empty. */
  error: string;
  reload: () => void;
} {
  const [assignees, setAssignees] = useState<CrmAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch("/api/crm/operations/assignees");
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json() as { assignees?: CrmAssignee[] };
      setAssignees(d.assignees ?? []);
      setError("");
    } catch {
      // An empty picker that says nothing looks like "nobody works here".
      setError("Couldn't load the list of people.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { assignees, loading, error, reload };
}

/**
 * What to show in an "Assigned" cell, and whether it is a real person.
 *
 * A contact assigned through the picker carries a staff id; one carrying only
 * a legacy string carries a name nobody has identified. Presenting the second
 * as though it were the first is precisely the confusion this milestone
 * removes, so the two are returned as different things and every caller has to
 * decide how to render an unmapped value rather than defaulting into a lie.
 */
export function ownerLabel(
  lead: { assignedTo?: string | null; assignedToStaffId?: number | null },
  assignees: CrmAssignee[],
): { label: string | null; resolved: boolean } {
  if (lead.assignedToStaffId != null) {
    const who = assignees.find(a => a.id === lead.assignedToStaffId);
    // The id is authoritative even when this browser's list does not contain
    // the person (a disabled account keeps the contacts it owned). The text
    // column holds the name recorded at assignment time, so it is the right
    // fallback here — and `resolved` stays true, because a person IS recorded.
    return { label: who?.displayName ?? lead.assignedTo ?? null, resolved: true };
  }
  const text = (lead.assignedTo ?? "").trim();
  return { label: text || null, resolved: false };
}
