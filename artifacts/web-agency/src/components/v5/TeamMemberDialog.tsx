/**
 * TeamMemberDialog — the accessible bio dialog opened from a team card
 * (HomeV5 `TeamSection` and AboutV3's "people doing the work" pillars).
 * Shared by both call sites so the two pages never diverge on behavior or
 * copy; its styles are duplicated verbatim into `v5-home.css` and
 * `v5-pages.css` (the two pages each load only their own stylesheet).
 *
 * Built on the native <dialog> element rather than a hand-rolled overlay:
 * `showModal()` gives a real top-layer modal with a browser-native focus
 * trap (Tab/Shift+Tab cannot leave the dialog while it is modal) and a
 * native Escape-to-close (fires `cancel` then `close`). We still manage
 * focus-restore and scroll-lock explicitly because their timing needs to
 * match React's render cycle, and we still need our own visible close
 * control and backdrop-click handling.
 *
 * Accessibility contract (all verified against this implementation):
 *  - Every trigger focuses itself on click (`e.currentTarget.focus()`)
 *    before opening, so focus-restore is deterministic even in browsers
 *    that do not focus a <button> on mouse click by default.
 *  - `aria-modal="true"` + `aria-labelledby` pointing at the member's name.
 *  - Tab cycles inside the dialog only (native modal behavior).
 *  - Escape closes (native `cancel` → `close`); backdrop click closes
 *    (click target === the <dialog> element itself, never a descendant).
 *  - Focus returns to the control that opened it once `close` fires.
 *  - Background scroll is locked (`document.body.style.overflow`) for the
 *    lifetime of the open dialog.
 *  - No slide/fade entrance animation under `prefers-reduced-motion:
 *    reduce` (see the CSS); closing is always instant regardless of
 *    motion preference — there is no exit animation to disable.
 */

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import type { TeamMemberV5 } from "@/components/v5/teamV5";

export interface TeamMemberDialogProps {
  /** The member whose bio is showing, or null when the dialog is closed. */
  member: TeamMemberV5 | null;
  /** Called once the dialog has finished closing (any path: close button,
   *  backdrop click, or Escape). */
  onClose: () => void;
}

export function TeamMemberDialog({ member, onClose }: TeamMemberDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Keep rendering the last member's content while the (instant) native
  // close plays out, so the panel is never briefly empty.
  const [displayMember, setDisplayMember] = useState<TeamMemberV5 | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (member) {
      setDisplayMember(member);
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      if (!dialog.open) dialog.showModal();

      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = previousOverflow;
      };
    }

    if (dialog.open) dialog.close();
    return undefined;
  }, [member]);

  // The close button only exists once `displayMember` (not `member`) has
  // rendered the panel, so its initial focus is a separate effect keyed on
  // that state — doing it inside the effect above would run before the
  // button element exists and silently no-op.
  useEffect(() => {
    if (displayMember) closeButtonRef.current?.focus();
  }, [displayMember]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function handleClose() {
      onClose();
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
    }

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  function handleDialogClick(e: React.MouseEvent<HTMLDialogElement>) {
    // A click that lands on the <dialog> element itself (not one of its
    // descendants) landed on the ::backdrop — the box the dialog occupies
    // is sized to its content, so this only fires for true outside clicks.
    if (e.target === dialogRef.current) {
      dialogRef.current?.close();
    }
  }

  const person = displayMember;

  return (
    <dialog
      ref={dialogRef}
      className="sm-team-dialog"
      aria-modal="true"
      aria-labelledby={person ? titleId : undefined}
      onClick={handleDialogClick}
    >
      {person && (
        <div className="sm-team-dialog__panel">
          <button
            ref={closeButtonRef}
            type="button"
            className="sm-team-dialog__close"
            aria-label={`Close ${person.name}'s bio`}
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" />
          </button>
          <div className="sm-team-dialog__header">
            <span className="sm-team-dialog__avatar">
              <img src={person.photo} alt={`Portrait of ${person.name}`} />
            </span>
            <div>
              <h2 id={titleId} className="sm-team-dialog__name">
                {person.name}
              </h2>
              <p className="sm-team-dialog__role">{person.role}</p>
            </div>
          </div>
          <p className="sm-team-dialog__intro">{person.intro}</p>
          <ul className="sm-team-dialog__responsibilities">
            {person.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="sm-team-dialog__support">
            <strong>How {person.name.split(" ")[0]} supports your project: </strong>
            {person.support}
          </p>
        </div>
      )}
    </dialog>
  );
}
