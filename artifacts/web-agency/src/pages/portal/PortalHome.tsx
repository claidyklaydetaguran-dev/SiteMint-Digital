// ── M4: the customer portal overview ────────────────────────────────────────
//
// What a client wants to know in ten seconds: is anything waiting on me, how
// many projects are running, and what have I paid. Nothing is invented — there
// is no "balance owed", because the CRM records payments received and does not
// hold a ledger of what is outstanding, and showing a number we cannot compute
// would be worse than showing none.

import { Link } from "wouter";
import PortalShell, {
  PortalCard, PortalErrorState, PortalLoadingState, usePortalResource,
} from "./PortalShell";
import { Button } from "@/components/ui/button";
import { FileUp, FolderKanban, FileText, LifeBuoy } from "lucide-react";

interface Overview {
  contact: { name: string; company: string | null };
  counts: { projects: number; documents: number; documentsRequested: number; openRequests: number };
  paidToDate: number;
  nextActionForYou: { kind: string; title: string; id: number } | null;
}

const money = (n: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

/**
 * The one thing the customer is being asked to do, worded for what it is.
 *
 * A quote is answered on the Quotes page; a document request is fulfilled on
 * Documents. A single "Send it now" button for both sent somebody who had been
 * asked to accept a quote to a page that said nothing was outstanding.
 */
function NextAction({ action }: { action: NonNullable<Overview["nextActionForYou"]> }) {
  const isQuote = action.kind === "quote";
  const Icon = isQuote ? FileText : FileUp;
  return (
    <PortalCard className="border-teal-300 bg-teal-50 dark:border-teal-800 dark:bg-teal-950">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal-700 dark:text-teal-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">We are waiting on one thing from you</p>
          <p className="mt-1 break-words text-sm text-muted-foreground">{action.title}</p>
          <Button asChild className="mt-3 min-h-11 w-full sm:w-auto">
            <Link href={isQuote ? "/portal/proposals" : "/portal/documents"}>
              {isQuote ? "Review and accept" : "Send it now"}
            </Link>
          </Button>
        </div>
      </div>
    </PortalCard>
  );
}

function Stat({ label, value, href, icon: Icon }: {
  label: string; value: string; href: string; icon: typeof FolderKanban;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-teal-400"
    >
      <Icon className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
      <span className="min-w-0">
        <span className="block text-lg font-semibold leading-tight">{value}</span>
        <span className="block truncate text-sm text-muted-foreground">{label}</span>
      </span>
    </Link>
  );
}

export default function PortalHome() {
  const { state, reload } = usePortalResource<Overview>("/api/portal/overview");

  return (
    <PortalShell title="Your account">
      {state.status === "loading" && <PortalLoadingState label="Loading your account…" />}
      {state.status === "error" && <PortalErrorState error={state.error} onRetry={reload} />}
      {state.status === "ready" && (
        <>
          <p className="text-sm text-muted-foreground">
            Hello {state.data.contact.name.split(" ")[0]}. Here is where everything stands.
          </p>

          {state.data.nextActionForYou && <NextAction action={state.data.nextActionForYou} />}

          {/* One column at 375px, two from 640px. Nothing here can overflow
              sideways: every value is short and every label truncates. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              label={state.data.counts.projects === 1 ? "project" : "projects"}
              value={String(state.data.counts.projects)}
              href="/portal/projects" icon={FolderKanban}
            />
            <Stat
              label={state.data.counts.documents === 1 ? "document" : "documents"}
              value={String(state.data.counts.documents)}
              href="/portal/documents" icon={FileText}
            />
            <Stat
              label={state.data.counts.openRequests === 1 ? "open support request" : "open support requests"}
              value={String(state.data.counts.openRequests)}
              href="/portal/support" icon={LifeBuoy}
            />
            <Stat
              label="paid to date"
              value={money(state.data.paidToDate)}
              href="/portal/invoices" icon={FileText}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            “Paid to date” is money we have actually received. It is not a balance —
            anything still to be invoiced is agreed with your SiteMint contact.
          </p>
        </>
      )}
    </PortalShell>
  );
}
