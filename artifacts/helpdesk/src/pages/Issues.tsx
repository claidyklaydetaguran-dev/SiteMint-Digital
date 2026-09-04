/**
 * V5 PR-8 — the Issues screen: open issues with a plain message, an
 * occurrence count, first/last seen, and a resolve action. See
 * `pages/issues/issuesContract.ts`.
 */

import { useState } from "react";
import { useSession } from "@/hooks/useSession";
import { useIssuesList, useResolveIssue } from "@/hooks/useIssues";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { COPY, PAGE, levelLabel } from "@/pages/issues/issuesContract";
import "@/styles/v2-dashboard.css";

export default function Issues() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const issuesQuery = useIssuesList();
  const resolveMutation = useResolveIssue();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  if (sessionLoading || issuesQuery.isLoading) {
    return <PageSkeleton label={PAGE.loading} list />;
  }
  if (!me) return null;

  const items = issuesQuery.data?.items ?? [];

  const handleResolve = async (id: string) => {
    setPendingId(id);
    setFailedId(null);
    try {
      await resolveMutation.mutateAsync(id);
    } catch {
      setFailedId(id);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.detail}</p>
        </div>
      </div>

      {issuesQuery.isError && (
        <section className="sd-error" role="alert">
          <div className="sd-error__body">
            <span className="sd-error__title">{COPY.errorTitle}</span>
            <p className="sd-error__detail">{COPY.errorDetail}</p>
          </div>
          <button type="button" className="sd-error__action" onClick={() => issuesQuery.refetch()} disabled={issuesQuery.isRefetching}>
            {issuesQuery.isRefetching ? COPY.retryingLabel : COPY.retryLabel}
          </button>
        </section>
      )}

      {!issuesQuery.isLoading && !issuesQuery.isError && items.length === 0 && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{COPY.allClearTitle}</h3>
          <p className="sd-empty__detail">{COPY.allClearDetailPrefix} {new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        </div>
      )}

      {!issuesQuery.isLoading && !issuesQuery.isError && items.length > 0 && (
        <ul className="sd-list">
          {items.map((issue) => (
            <li className="sd-list__item" key={issue.id}>
              <div className="flex flex-col gap-2 rounded-lg border border-card-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={issue.level === "critical" || issue.level === "error" ? "destructive" : "outline"}>
                      {levelLabel(issue.level)}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{issue.message}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{COPY.occurrencesLabel}: {issue.occurrences}</span>
                    <span>{COPY.firstSeenLabel}: {new Date(issue.createdAt).toLocaleDateString()}</span>
                    <span>{COPY.lastSeenLabel}: {new Date(issue.updatedAt).toLocaleDateString()}</span>
                  </div>
                  {failedId === issue.id && (
                    <p className="mt-1 text-xs text-destructive">{COPY.resolveFailedTitle} — {COPY.resolveFailedDetail}</p>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="sm" variant="outline" disabled={pendingId === issue.id}>
                      {pendingId === issue.id ? COPY.resolvePendingLabel : COPY.resolveLabel}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{COPY.resolveConfirmTitle}</AlertDialogTitle>
                      <AlertDialogDescription>{COPY.resolveConfirmDetail}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{COPY.resolveConfirmDismiss}</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleResolve(issue.id)}>{COPY.resolveConfirmAction}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
