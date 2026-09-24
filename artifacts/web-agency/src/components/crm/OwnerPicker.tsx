import type { CrmAssignee } from "@/lib/crmAssignees";

/**
 * M6: choosing who a contact belongs to.
 *
 * A picker over real staff accounts — never free text. The value is a staff
 * id; the server copies that person's display name into the recorded name, so
 * the two owner columns are always written together.
 *
 * `"keep"` exists for one case: a contact whose recorded owner name does not
 * match a person. Showing that contact as "Unassigned" would misstate it, and
 * saving it as unassigned would erase the only record of the name — so keeping
 * what is recorded is its own choice, distinct from choosing nobody.
 */
export type OwnerChoice = number | null | "keep";

export function OwnerPicker({
  id, value, onChange, assignees, loading = false, error = "", onRetry,
  currentOwner = null, unmatchedName = null, disabled = false, className,
}: {
  id?: string;
  value: OwnerChoice;
  onChange: (next: OwnerChoice) => void;
  /** Active staff, from `useCrmAssignees`. */
  assignees: CrmAssignee[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  /**
   * The person the contact already belongs to. Listed even when they are no
   * longer active, so the picker never pretends a contact has no owner.
   */
  currentOwner?: { id: number; label: string } | null;
  /** The recorded owner name when it matches nobody — offered as "keep". */
  unmatchedName?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const inList = (staffId: number) => assignees.some(a => a.id === staffId);
  const showCurrent = currentOwner != null && !inList(currentOwner.id);
  const orphanValue = typeof value === "number" && !inList(value) && !(showCurrent && currentOwner?.id === value);

  return (
    <div className="min-w-0">
      <select
        id={id}
        value={value === null ? "" : String(value)}
        disabled={disabled}
        onChange={e => {
          const raw = e.target.value;
          onChange(raw === "" ? null : raw === "keep" ? "keep" : Number(raw));
        }}
        className={className ?? "w-full min-w-0 px-3 py-2 border border-input rounded-lg text-sm bg-background focus:outline-none"}
      >
        {unmatchedName && (
          <option value="keep">“{unmatchedName}”, as recorded (not matched to a person)</option>
        )}
        <option value="">Unassigned</option>
        {showCurrent && currentOwner && (
          <option value={String(currentOwner.id)}>
            {currentOwner.label}{loading ? "" : " (can't take new work)"}
          </option>
        )}
        {assignees.map(a => <option key={a.id} value={String(a.id)}>{a.displayName}</option>)}
        {orphanValue && (
          <option value={String(value)}>{loading ? "Loading…" : "A person who can't take new work"}</option>
        )}
      </select>
      {loading && <p className="text-[11px] text-muted-foreground mt-1">Loading people…</p>}
      {error && (
        <p className="text-[11px] text-red-600 mt-1">
          {error}{" "}
          {onRetry && (
            <button type="button" onClick={onRetry} className="underline font-medium">Try again</button>
          )}
        </p>
      )}
    </div>
  );
}
