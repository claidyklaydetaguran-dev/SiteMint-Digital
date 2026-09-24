/**
 * J8 — owner-only controls are not shown to staff.
 *
 * The server already refuses these writes for staff (lib/receptionistRoles.ts
 * on the API: everything outside the staff write list is owner-only). Showing
 * the button anyway meant a staff member learned that only by pressing it and
 * reading an error. `OwnerOnly` renders its children for owners only;
 * `StaffReadOnlyNote` tells staff, once per page, why the controls are not
 * there. Neither is a security boundary — the server is.
 *
 * While the session is still loading the viewer is unknown, and nothing is
 * rendered either way, so a staff member never sees a control flash in.
 */

import type { ReactNode } from "react";
import { useViewer } from "@/hooks/useSession";

export function OwnerOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const viewer = useViewer();
  if (viewer.role === null) return null;
  return <>{viewer.isOwner ? children : fallback}</>;
}

export const STAFF_READ_ONLY_COPY = "You're signed in as staff. Only an owner of this business can change what's on this page.";

export function StaffReadOnlyNote({ text = STAFF_READ_ONLY_COPY }: { text?: string }) {
  const viewer = useViewer();
  if (viewer.role === null || viewer.isOwner) return null;
  return (
    <p className="ws-notice sd-notice" role="note">
      {text}
    </p>
  );
}
