/**
 * Where keyboard focus goes when an in-app dialog opens, and where it goes back
 * to when the dialog closes.
 *
 * Radix returns focus to whatever is wrapped in its `Trigger`. Every dialog in
 * this CRM is opened imperatively from an event handler — a row's Delete
 * button, a menu item — so there is no Trigger, Radix's `triggerRef` is null,
 * and focus lands on `<body>`: the next Tab starts again from the top of the
 * page. This module remembers the control that opened the dialog and puts focus
 * back on it.
 *
 * It also answers the question Radix does not, and which is the NORMAL case
 * here rather than an edge case: where focus goes when the opener no longer
 * exists, because confirming deleted the row it lived in. The answer is the
 * nearest ancestor of the opener that is still in the document, and the first
 * thing inside it a person can Tab to — in practice the next row's controls, or
 * the control that replaced the one just used ("Reopen" where "Cancel" was).
 *
 * The walk is a pure function over a tiny environment interface so it can be
 * unit-tested without a DOM (this package has no jsdom on purpose); the DOM
 * implementation of that interface is at the bottom of the file.
 */

// ── The walk (pure) ──────────────────────────────────────────────────────────

export interface FocusOrigin<T> {
  /** The control that opened the dialog. */
  opener: T;
  /** Its ancestors, nearest first, stopping before `<body>`. */
  ancestors: readonly T[];
}

export interface FocusEnvironment<T> {
  isConnected(node: T): boolean;
  canFocus(node: T): boolean;
  firstFocusableWithin(node: T): T | null;
}

/**
 * Where focus should land, given where it came from.
 *
 * Returns null when nothing suitable is left, in which case the caller should
 * leave focus alone rather than moving it somewhere arbitrary.
 */
export function pickReturnFocus<T>(
  origin: FocusOrigin<T>,
  environment: FocusEnvironment<T>,
): T | null {
  if (environment.isConnected(origin.opener) && environment.canFocus(origin.opener)) {
    return origin.opener;
  }
  for (const ancestor of origin.ancestors) {
    if (!environment.isConnected(ancestor)) continue;
    const replacement = environment.firstFocusableWithin(ancestor);
    if (replacement) return replacement;
  }
  return null;
}

/**
 * How recently a pointer press still counts as "this is what opened it".
 *
 * Safari does not focus a button when it is clicked, so `document.activeElement`
 * is `<body>` for mouse users there and the opener would be lost. The last
 * pointer press fills that gap; the age limit keeps an unrelated earlier click
 * from being mistaken for the opener.
 */
export const POINTER_ORIGIN_TTL_MS = 1500;

export interface PointerOrigin<T> {
  element: T;
  at: number;
}

export function pickOpener<T>(args: {
  active: T | null;
  body: T | null;
  pointer: PointerOrigin<T> | null;
  now: number;
  isConnected: (node: T) => boolean;
}): T | null {
  const { active, body, pointer, now, isConnected } = args;
  if (active !== null && active !== body) return active;
  if (pointer && now - pointer.at <= POINTER_ORIGIN_TTL_MS && isConnected(pointer.element)) {
    return pointer.element;
  }
  return null;
}

// ── The DOM implementation ───────────────────────────────────────────────────

/** Everything a person can reach with Tab. */
export const TABBABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(", ");

let pointerOrigin: PointerOrigin<HTMLElement> | null = null;
let watching = false;

/** Starts remembering which control was last pressed. Safe to call repeatedly. */
export function watchPointerOrigins(): void {
  if (watching || typeof document === "undefined") return;
  watching = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        pointerOrigin = null;
        return;
      }
      const control = target.closest<HTMLElement>(TABBABLE_SELECTOR);
      pointerOrigin = control ? { element: control, at: Date.now() } : null;
    },
    { capture: true },
  );
}

const domEnvironment: FocusEnvironment<HTMLElement> = {
  isConnected: (node) => node.isConnected,
  canFocus: (node) => {
    if (node.hasAttribute("disabled")) return false;
    if (node.getAttribute("aria-hidden") === "true") return false;
    if (node.closest("[inert]") !== null) return false;
    // Rendered, rather than merely present: `hidden lg:flex` chrome is in the
    // document at every width and focusing it would scroll to nothing.
    return node.getClientRects().length > 0;
  },
  firstFocusableWithin: (node) => {
    for (const candidate of node.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)) {
      if (domEnvironment.canFocus(candidate)) return candidate;
    }
    return null;
  },
};

/** Call this as the dialog opens, while the opener still has focus. */
export function captureFocusOrigin(): FocusOrigin<HTMLElement> | null {
  if (typeof document === "undefined") return null;
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const opener = pickOpener({
    active,
    body: document.body,
    pointer: pointerOrigin,
    now: Date.now(),
    isConnected: (node) => node.isConnected,
  });
  if (!opener) return null;
  const ancestors: HTMLElement[] = [];
  for (let node = opener.parentElement; node && node !== document.body; node = node.parentElement) {
    ancestors.push(node);
  }
  return { opener, ancestors };
}

/** Call this from the dialog's close handler, after preventing Radix's own. */
export function restoreFocus(origin: FocusOrigin<HTMLElement> | null): void {
  if (!origin) return;
  pickReturnFocus(origin, domEnvironment)?.focus();
}

/**
 * The element a dialog should be portalled into.
 *
 * A portal to `<body>` would leave the themed subtree: the CRM's palette lives
 * on `.v2-dashboard-shell` (`[data-shell="dashboard"]`), so a dialog outside it
 * silently resolves `--primary`, `--border` and friends to the marketing site's
 * values instead of the CRM's.
 */
export function dialogContainer(origin: FocusOrigin<HTMLElement> | null): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return (
    origin?.opener.closest<HTMLElement>("[data-shell]")
    ?? document.querySelector<HTMLElement>('[data-shell="dashboard"]')
  );
}
