import { useState } from "react";
import { useListHelpdeskContacts } from "@workspace/api-client-react";
import type { HelpdeskContact } from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Download,
  Plus,
  ExternalLink,
  MoreHorizontal,
  Zap,
  Mail,
  Phone,
  Building2,
  ArrowUpDown,
  Users,
} from "lucide-react";

function relativeDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TIER_COLORS: Record<string, string> = {
  vip: "bg-amber-100 text-amber-700",
  standard: "bg-slate-100 text-slate-600",
  trial: "bg-indigo-100 text-indigo-700",
};

export default function Contacts() {
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const { data: contacts, isLoading } = useListHelpdeskContacts();

  const filtered = contacts?.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      (c.company ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Page Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Contacts</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {contacts?.length ?? 0} total contacts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-slate-200 text-slate-600 gap-1.5">
            <Zap className="h-3.5 w-3.5 text-indigo-500" /> MCP Access
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs font-medium border-slate-200 text-slate-600 gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white gap-1.5"
            onClick={() => setShowAdd(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Search bar */}
      <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search contacts…"
            className="h-8 pl-8 text-xs bg-white border-slate-200 focus-visible:ring-indigo-500"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-sm text-slate-400">Loading…</div>
        ) : !filtered?.length ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[280px]">
                  <button className="flex items-center gap-1 hover:text-slate-900 transition-colors">
                    Name <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[140px]">
                  Last Contact
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Note
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[100px]">
                  Tickets
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-[100px]">
                  Tier
                </th>
                <th className="px-4 py-3 w-[80px]" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((contact) => (
                <ContactRow key={contact.id} contact={contact} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <AddContactDialog open={showAdd} onClose={() => setShowAdd(false)} />
    </div>
  );
}

function ContactRow({ contact }: { contact: HelpdeskContact }) {
  return (
    <tr className="hover:bg-slate-50 group transition-colors cursor-pointer">
      <td className="px-6 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarFallback
              style={{ backgroundColor: contact.avatarColor }}
              className="text-white text-xs font-semibold"
            >
              {contact.initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="font-medium text-slate-900 truncate">{contact.name}</div>
            <div className="text-xs text-slate-500 flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 flex-shrink-0" />
              {contact.email}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-600 text-xs">
        {relativeDate(contact.lastContactedAt)}
      </td>
      <td className="px-4 py-3 text-slate-500 text-xs max-w-[260px]">
        <div className="truncate">
          {contact.company
            ? `Works at ${contact.company}`
            : contact.phone
            ? contact.phone
            : `${contact.openTickets ?? 0} open ticket${(contact.openTickets ?? 0) !== 1 ? "s" : ""}`}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-xs font-medium text-slate-700">
          {contact.totalTickets ?? 0}
        </span>
      </td>
      <td className="px-4 py-3">
        <Badge
          className={`${TIER_COLORS[contact.tier] ?? "bg-slate-100 text-slate-600"} border-transparent rounded-full text-xs font-medium capitalize px-2`}
        >
          {contact.tier}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-indigo-600 transition-colors">
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 text-center px-8">
      <svg
        className="h-32 w-32 text-slate-200 mb-6"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="60" cy="48" r="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M20 100c0-22.09 17.91-40 40-40s40 17.91 40 40" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M90 58h20M100 48v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <h3 className="text-lg font-bold text-slate-900 mb-2">No data</h3>
      <p className="text-sm text-slate-500 mb-6 max-w-xs">
        You don't have any contacts yet. Add your first contact to start managing support relationships.
      </p>
      <Button
        size="sm"
        className="bg-slate-900 hover:bg-slate-800 text-white gap-1.5"
        onClick={onAdd}
      >
        <Plus className="h-4 w-4" /> Add Contact
      </Button>
    </div>
  );
}

function AddContactDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Full Name</label>
            <Input placeholder="Jane Smith" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Email</label>
            <Input type="email" placeholder="jane@example.com" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Phone</label>
            <Input placeholder="+1 (555) 000-0000" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Company</label>
            <Input placeholder="Acme Corp" className="h-9" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white">Create Contact</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
