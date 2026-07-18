import { Link } from "wouter";
import { Users2, MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";

export default function Contacts() {
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Page header */}
      <div className="px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <h1 className="text-lg font-semibold text-foreground">Contacts</h1>
        <p className="text-sm text-muted-foreground mt-0.5">View and manage your caller contacts</p>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <EmptyState
          icon={Users2}
          title="Contact directory coming soon"
          description="A full contact directory with call history, tier breakdowns, and lead scoring is on the way. For now, view callers directly in Conversations."
          action={
            <Link href="/conversations">
              <Button className="gap-2">
                <MessageSquare className="h-4 w-4" aria-hidden="true" />
                Go to Conversations
              </Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}
