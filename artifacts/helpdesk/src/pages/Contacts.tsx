/**
 * V5 PR-8 — the Contacts workspace: a real, searchable list.
 *
 * Reads `GET /receptionist/contacts?query=&limit=` (`useContactsList`). The
 * search box updates the query key after a short debounce, so typing issues
 * one request per pause rather than one per keystroke. A table renders at
 * desktop widths; a stacked card list renders below 768px (see
 * `.sd-hide-mobile` / `.sd-hide-desktop` — plain Tailwind responsive classes,
 * no new stylesheet).
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useSession } from "@/hooks/useSession";
import { useContactsList } from "@/hooks/useContacts";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InlineError } from "@/components/common/InlineError";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { relativeTime } from "@/lib/conversationUi";
import type { ContactSummary } from "@/lib/contactsApi";
import {
  LIST,
  PAGE,
  contactDisplayName,
  dispositionLabel,
  sourceLabel,
} from "@/pages/contacts/contactsContract";
import "@/styles/v2-dashboard.css";

function useDebounced(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function ContactRow({ contact }: { contact: ContactSummary }) {
  return (
    <Link href={`/contacts/${encodeURIComponent(contact.id)}`} className="block rounded-lg border border-card-border bg-card p-4 md:hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-foreground">{contactDisplayName(contact)}</span>
        {contact.optedOut && <Badge variant="outline">{LIST.optedOutChip}</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{contact.phone}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{sourceLabel(contact.source)}</span>
        <span>{contact.lastInteractionAt ? relativeTime(contact.lastInteractionAt) : LIST.never}</span>
        <span>{dispositionLabel(contact.disposition)}</span>
      </div>
    </Link>
  );
}

export default function Contacts() {
  const { data: me, isLoading: sessionLoading } = useSession();
  const [rawQuery, setRawQuery] = useState("");
  const query = useDebounced(rawQuery, 300);
  const contactsQuery = useContactsList(query);

  if (sessionLoading) {
    return <PageSkeleton label={PAGE.loading} list />;
  }
  if (!me) return null;

  const items = contactsQuery.data?.items ?? [];
  const searching = rawQuery.trim() !== "";

  return (
    <div className="sd-page sd-enter">
      <div className="sd-page__head">
        <div>
          <span className="sd-eyebrow">{PAGE.eyebrow}</span>
          <h1 className="sd-page__title">{PAGE.title}</h1>
          <p className="sd-page__meta">{PAGE.detail}</p>
        </div>
      </div>

      <div className="max-w-sm">
        <label className="sr-only" htmlFor="contacts-search">{LIST.searchLabel}</label>
        <Input
          id="contacts-search"
          type="search"
          placeholder={LIST.searchPlaceholder}
          value={rawQuery}
          onChange={(e) => setRawQuery(e.target.value)}
        />
      </div>

      {contactsQuery.isLoading && (
        <p className="sd-sr" role="status" aria-live="polite">{LIST.loading}</p>
      )}

      {contactsQuery.isError && (
        <InlineError title={LIST.failed} description="" onRetry={() => contactsQuery.refetch()} />
      )}

      {!contactsQuery.isLoading && !contactsQuery.isError && items.length === 0 && (
        <div className="sd-empty">
          <h3 className="sd-empty__title">{searching ? LIST.noResultsTitle : LIST.emptyTitle}</h3>
          <p className="sd-empty__detail">{searching ? LIST.noResultsDetail : LIST.emptyDetail}</p>
        </div>
      )}

      {!contactsQuery.isLoading && !contactsQuery.isError && items.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">{LIST.countSuffix(items.length)}</p>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{LIST.columnName}</TableHead>
                  <TableHead>{LIST.columnSource}</TableHead>
                  <TableHead>{LIST.columnLastInteraction}</TableHead>
                  <TableHead>{LIST.columnStatus}</TableHead>
                  <TableHead>{LIST.columnNextAppointment}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((contact) => (
                  <TableRow key={contact.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/contacts/${encodeURIComponent(contact.id)}`} className="font-medium text-foreground hover:underline">
                        {contactDisplayName(contact)}
                      </Link>
                      <div className="text-xs text-muted-foreground">{contact.phone}</div>
                      {contact.optedOut && <Badge variant="outline" className="mt-1">{LIST.optedOutChip}</Badge>}
                    </TableCell>
                    <TableCell>{sourceLabel(contact.source)}</TableCell>
                    <TableCell>{contact.lastInteractionAt ? relativeTime(contact.lastInteractionAt) : LIST.never}</TableCell>
                    <TableCell>{dispositionLabel(contact.disposition)}</TableCell>
                    <TableCell>{contact.nextAppointmentAt ? relativeTime(contact.nextAppointmentAt) : LIST.noNextAppointment}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 md:hidden">
            {items.map((contact) => <ContactRow key={contact.id} contact={contact} />)}
          </div>
        </>
      )}
    </div>
  );
}
