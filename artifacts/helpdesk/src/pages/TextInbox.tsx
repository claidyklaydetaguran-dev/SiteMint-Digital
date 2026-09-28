import { WorkspaceTabs } from "@/components/layout/WorkspaceNavigation";
import { useState } from "react";
import { Link } from "wouter";
import { useContactsList } from "@/hooks/useContacts";
import { ContactTexts } from "@/pages/contacts/ContactTexts";
import { ROUTES } from "@/lib/routes";

export default function TextInbox() {
  const contacts = useContactsList("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const items = (contacts.data?.items ?? []).filter(c => `${c.name ?? ""} ${c.phone}`.toLowerCase().includes(search.toLowerCase()));
  const contact = items.find(c => c.id === selected);
  return <div className="sd-page cf-inbox"><div className="sd-page__head"><div><h1 className="sd-page__title">Text inbox</h1><p className="ws-page-lede">Caller replies and appointment updates, together.</p></div></div>
    <WorkspaceTabs location="/activity/texts" />
    {contacts.isLoading ? <p role="status">Loading contacts…</p> : contacts.isError ? <div role="alert"><p>Contacts couldn't be loaded.</p><button onClick={() => void contacts.refetch()}>Try again</button></div> : <div className="mc-call-layout cl-inbox-layout" data-selected={!!contact}>
      <div className="mc-call-list">    <label htmlFor="text-search" className="sd-sr">Search contacts</label><input id="text-search" className="mc-search" placeholder="Search contacts by name or phone" value={search} onChange={e => {setSearch(e.target.value);setSelected(null);}}/>{items.length === 0 ? <p className="sd-empty__detail">{search ? "No contacts match your search." : "Caller text threads will appear here when contacts are available."}</p> : items.map(c => <button className="mc-call-row" type="button" key={c.id} aria-pressed={c.id === selected} onClick={() => setSelected(c.id)}><strong><span className="cf-initials" aria-hidden="true">{(c.name||"Caller").split(" ").map(n=>n[0]).slice(0,2).join("")}</span>{c.name || c.phone}</strong><span>{c.unreadTexts ? `${c.unreadTexts} new` : ""}</span><small>{c.phone}</small><small>{c.optedOut ? "Opted out" : "View thread"}</small></button>)}</div>
      <div className="mc-call-detail">{contact ? <><button className="mc-mobile-back" onClick={() => setSelected(null)}>Back to contacts</button><h2 className="sd-h2">{contact.name || contact.phone}</h2><p>{contact.phone}</p>{contact.optedOut && <p className="sc-note">This caller has opted out of text messages.</p>}<Link className="sd-link" href={ROUTES.contactDetail.replace(":id", encodeURIComponent(contact.id))}>View contact and appointments</Link><ContactTexts key={contact.id} contactId={contact.id}/></> : <div className="mc-detail-placeholder"><h2>Select a contact</h2><p>Read their text history and delivery status.</p></div>}</div>{contact && <aside className="cl-card cl-contact-context"><span className="cl-avatar">{(contact.name||contact.phone).charAt(0)}</span><h2>{contact.name || "Caller"}</h2><p>{contact.phone}</p><dl><dt>Calls</dt><dd>{contact.callCount}</dd><dt>Text preference</dt><dd>{contact.optedOut ? "Opted out" : "Not opted out"}</dd><dt>Next appointment</dt><dd>{contact.nextAppointmentAt ? new Date(contact.nextAppointmentAt).toLocaleString() : "None recorded"}</dd></dl><Link className="cl-add" href={ROUTES.contactDetail.replace(":id",encodeURIComponent(contact.id))}>View full contact</Link><p className="cl-muted">Sending eligibility is checked before each message.</p></aside>}
    </div>}
  </div>;
}
