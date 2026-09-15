/**
 * Keeps unsent editor content alive across a transient connection loss.
 *
 * The online-first decision means a save that cannot reach the server does not
 * happen. What must not also happen is the operator losing what they typed —
 * half an email, a long internal note — because the network dropped for twenty
 * seconds. So the text is held locally until the server confirms it.
 *
 * ── The three rules that make this safe ─────────────────────────────────────
 *
 * 1. **It is a scratch copy, never a queue.** Nothing here is ever replayed to
 *    the server automatically. Recovery is always a person seeing their words
 *    and choosing to save them. An automatic replay after reconnect is exactly
 *    the "sending, deleting, approving or publishing after reconnect" the owner
 *    ruled out, and it is worse than losing the text: the operator never
 *    watched it go.
 *
 * 2. **It is scoped to an account.** Every key carries the signed-in staff id.
 *    A shared machine is normal in a small agency, and one person's unsent
 *    reply appearing in another person's editor would be both a privacy breach
 *    and a way to send the wrong words under the wrong name.
 *
 * 3. **It is cleared on sign-out and on account change.** Not "eventually" —
 *    at the moment identity changes, before the next person can see anything.
 *
 * `localStorage` can throw outright in a private window or with site data
 * blocked, so every access is guarded and a failure degrades to "no draft
 * preserved" rather than breaking the editor.
 */

const PREFIX = "sitemint:crm:draft:";
const OWNER_KEY = "sitemint:crm:draft-owner";

export interface PreservedDraft<T = unknown> {
  value: T;
  savedAt: number;
}

function safeLocal(): Storage | null {
  try {
    const s = window.localStorage;
    // Touch it: some browsers only throw on access, not on the property read.
    const probe = "__sitemint_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

function keyFor(staffId: number | string | null, id: string): string {
  return `${PREFIX}${staffId ?? "anon"}:${id}`;
}

/**
 * Record who the stored drafts belong to, and drop everything if that changed.
 *
 * Called when the signed-in identity is known. Switching accounts on a shared
 * machine clears the previous person's scratch content before the new person
 * can reach an editor.
 */
export function setDraftOwner(staffId: number | string | null): void {
  const store = safeLocal();
  if (!store) return;
  const next = String(staffId ?? "anon");
  try {
    const previous = store.getItem(OWNER_KEY);
    if (previous !== null && previous !== next) clearAllDrafts();
    store.setItem(OWNER_KEY, next);
  } catch {
    // Storage unavailable — nothing is preserved, which is the safe direction.
  }
}

/**
 * Whose drafts these are right now, as last bound by `setDraftOwner` — the id
 * every key is scoped to. Null when nobody is bound yet or storage is blocked,
 * which `saveDraft` and `readDraft` treat as the anonymous owner, consistently.
 */
export function currentDraftOwner(): string | null {
  const store = safeLocal();
  if (!store) return null;
  try {
    return store.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

export function saveDraft<T>(staffId: number | string | null, id: string, value: T): void {
  const store = safeLocal();
  if (!store) return;
  try {
    store.setItem(keyFor(staffId, id), JSON.stringify({ value, savedAt: Date.now() }));
  } catch {
    // Quota exceeded, or blocked. Losing the scratch copy is acceptable;
    // breaking the editor the person is typing into is not.
  }
}

export function readDraft<T>(staffId: number | string | null, id: string): PreservedDraft<T> | null {
  const store = safeLocal();
  if (!store) return null;
  try {
    const raw = store.getItem(keyFor(staffId, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreservedDraft<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Called once the server has the content. The scratch copy has done its job. */
export function discardDraft(staffId: number | string | null, id: string): void {
  const store = safeLocal();
  if (!store) return;
  try {
    store.removeItem(keyFor(staffId, id));
  } catch {
    /* nothing to do */
  }
}

/** Sign-out, and account change. Removes every preserved draft for everyone. */
export function clearAllDrafts(): void {
  const store = safeLocal();
  if (!store) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) doomed.push(k);
    }
    for (const k of doomed) store.removeItem(k);
    store.removeItem(OWNER_KEY);
  } catch {
    /* nothing to do */
  }
}

// ── Save status, as the operator sees it ────────────────────────────────────

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  /**
   * The server does NOT have this. The wording matters: "saved locally" would
   * imply a durability this does not have, and "saved" would be a lie.
   */
  | { kind: "unsaved"; reason: string; preservedAt: number | null };

export function describeSaveStatus(s: SaveStatus): string {
  switch (s.kind) {
    case "idle": return "";
    case "saving": return "Saving…";
    case "saved": return "Saved";
    case "unsaved":
      return s.preservedAt
        ? `Not saved — ${s.reason} Your text is kept in this browser until you save it.`
        : `Not saved — ${s.reason}`;
  }
}
