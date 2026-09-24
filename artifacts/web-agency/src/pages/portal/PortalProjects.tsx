// ── M4: the customer's view of their own work ───────────────────────────────
//
// Stage, dates and type. Deliberately NOT the project's `nextAction`,
// `blockedReason` or `notes` — those are staff writing to staff, and the server
// does not send them either.

import PortalShell, {
  PortalCard, PortalEmptyState, PortalErrorState, PortalLoadingState, usePortalResource,
} from "./PortalShell";

interface Project {
  id: number;
  name: string;
  projectType: string | null;
  stage: string;
  startDate: string | null;
  targetLaunchDate: string | null;
}

const day = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function PortalProjects() {
  const { state, reload } = usePortalResource<{ projects: Project[] }>("/api/portal/projects");

  return (
    <PortalShell title="Projects">
      {state.status === "loading" && <PortalLoadingState label="Loading your projects…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (
        state.data.projects.length === 0 ? (
          <PortalEmptyState
            title="No projects yet"
            detail="Once work starts, it will show here with its stage and dates."
          />
        ) : (
          <ul className="space-y-3">
            {state.data.projects.map((p) => (
              <li key={p.id}>
                <PortalCard>
                  {/* Stacked at 375px, side by side from 640px. The stage pill
                      wraps rather than pushing the row wider than the screen. */}
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="break-words font-medium">{p.name}</h2>
                      {p.projectType && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{p.projectType}</p>
                      )}
                    </div>
                    <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                      {p.stage}
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Started</dt>
                      <dd className="mt-0.5">{day(p.startDate)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Target launch</dt>
                      <dd className="mt-0.5">{day(p.targetLaunchDate)}</dd>
                    </div>
                  </dl>
                </PortalCard>
              </li>
            ))}
          </ul>
        )
      )}
    </PortalShell>
  );
}
