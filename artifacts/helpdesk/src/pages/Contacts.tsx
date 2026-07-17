import { Link } from "wouter";
import { Users2, MessageSquare } from "lucide-react";

export default function Contacts() {
  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Contacts</h1>
        <p className="text-sm text-slate-500 mt-0.5">View and manage your caller contacts</p>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
        <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-5">
          <Users2 className="h-8 w-8 text-slate-300" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-2">Contact directory coming soon</h3>
        <p className="text-sm text-slate-500 max-w-xs leading-relaxed mb-6">
          A full contact directory with call history, tier breakdowns, and lead scoring is on the way. For now, view callers directly in Conversations.
        </p>
        <Link href="/conversations">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm">
            <MessageSquare className="h-4 w-4" />
            Go to Conversations
          </button>
        </Link>
      </div>
    </div>
  );
}
