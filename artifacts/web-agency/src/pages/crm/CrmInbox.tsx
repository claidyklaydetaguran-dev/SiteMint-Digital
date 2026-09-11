import { CrmLayout } from "./CrmLayout";
import { MessageSquare } from "lucide-react";
import { ConversationInbox } from "@/components/crm/ConversationInbox";

// ── Inbox ────────────────────────────────────────────────────────────────────
//
// A thin page around the shared `ConversationInbox`. This file used to be ~930
// lines that duplicated the Conversations tab of the Communications Center
// almost exactly — same three endpoints, same polling, same selection logic,
// two separate copies. They had already drifted apart: delivery-status pills
// and SMS retry existed here and not there, so which features you got depended
// on which menu item you clicked.
//
// Both entry points stay in the navigation, because people have them
// bookmarked and they mean different things to different people. There is now
// one implementation behind both.

export default function CrmInbox() {
  return (
    <CrmLayout>
      <div className="flex flex-col h-[calc(100vh-48px)]">
        <div className="px-4 py-3 border-b border-border">
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-teal-600" /> Inbox
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            SMS and calls with clients. Reading a conversation is separate from taking it on
            and from marking it done.
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <ConversationInbox />
        </div>
      </div>
    </CrmLayout>
  );
}
