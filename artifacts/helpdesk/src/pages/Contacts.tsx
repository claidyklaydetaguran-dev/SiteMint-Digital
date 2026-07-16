import { Badge } from "@/components/ui/badge";
import { Users2 } from "lucide-react";

export default function Contacts() {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="px-6 py-4 border-b border-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">Contacts</h1>
        <p className="text-sm text-slate-500 mt-0.5">View and manage your caller contacts</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Users2 className="h-8 w-8 text-slate-300" />
        </div>
        <h3 className="text-base font-bold text-slate-900 mb-2">Contacts</h3>
        <p className="text-sm text-slate-500 max-w-xs mb-4">
          A full contact directory with call history, tier breakdowns, and lead scoring is on the way. For now, view callers directly in the Inbox.
        </p>
        <Badge className="bg-slate-100 text-slate-500 border-transparent text-xs">
          Coming Soon
        </Badge>
      </div>
    </div>
  );
}
