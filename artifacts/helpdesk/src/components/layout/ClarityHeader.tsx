import { useState } from "react";
import { Link } from "wouter";
import { Search, Bell, ChevronDown, ArrowUpRight } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useInquiries } from "@/hooks/useInquiries";
import { useContactsList } from "@/hooks/useContacts";
import { useRealCallsList } from "@/hooks/useVoiceCalls";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

function SearchRecords({onClose}:{onClose:()=>void}) {
  const [query,setQuery]=useState("");
  const calls=useRealCallsList(), messages=useInquiries("all"), contacts=useContactsList("");
  const q=query.trim().toLowerCase();
  const results=[...(calls.data?.items??[]).map(c=>({key:`call-${c.callId}`,label:c.callerNumberDisplay||"Unknown caller",detail:"Call record",href:`/activity/calls/${encodeURIComponent(c.callId)}`})),...(messages.data?.items??[]).map(m=>({key:`message-${m.id}`,label:m.callerName,detail:m.topic,href:`/activity/inquiries?id=${m.id}`})),...(contacts.data?.items??[]).map(c=>({key:`contact-${c.id}`,label:c.name||c.phone,detail:c.phone,href:`/activity/contacts/${encodeURIComponent(c.id)}`}))].filter(r=>q && `${r.label} ${r.detail}`.toLowerCase().includes(q)).slice(0,12);
  return <><label className="cl-search-input"><Search size={20}/><input autoFocus aria-label="Search workspace records" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a name, number or message…"/></label><p className="cl-muted">Searches loaded calls, messages and contacts.</p>{(calls.isError||messages.isError||contacts.isError)&&<p role="status">Some records could not be loaded. Results may be incomplete.</p>}<div className="cl-search-results">{results.map(r=><Link key={r.key} href={r.href} onClick={onClose}><span><strong>{r.label}</strong><small>{r.detail}</small></span><ArrowUpRight size={18}/></Link>)}{q&&!results.length&&<p>{calls.isLoading||messages.isLoading||contacts.isLoading?"Searching…":"No matching records."}</p>}</div></>;
}
export function ClarityHeader() {
  const {data:session}=useSession(); const [open,setOpen]=useState(false);
  if(!session)return null;
  const email=session.viewer?.email||session.firm.email;
  const name=email?.split("@")[0]||"Your account";
  return <><header className="cl-utility"><Link className="cl-business" href="/account/settings">{session.firm.name}<ChevronDown size={16}/></Link><div className="cl-utility-actions"><button className="cl-search-trigger" onClick={()=>setOpen(true)}><Search size={19}/><span>Search calls, messages, or contacts…</span></button><Link href="/#attention" className="cl-notifications" aria-label="View items needing attention"><Bell size={22}/></Link><details className="cl-profile"><summary><span className="cl-avatar cl-avatar--owner">{name[0]?.toUpperCase()}</span><span><strong>{name}</strong><small>{session.viewer?.role==="staff"?"Staff":"Owner"}</small></span><ChevronDown size={16}/></summary><div><Link href="/account/settings">Account settings</Link><Link href="/account/billing">Plan and usage</Link></div></details></div></header><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Search your workspace</DialogTitle><DialogDescription>Find a call, message or contact.</DialogDescription>{open&&<SearchRecords onClose={()=>setOpen(false)}/>}</DialogContent></Dialog></>;
}
