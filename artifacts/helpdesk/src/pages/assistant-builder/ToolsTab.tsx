import { CalendarCheck, CalendarPlus, Sheet, PhoneForwarded, PhoneOff, MessageSquareText, Webhook } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { BuilderTabProps } from "@/pages/AssistantBuilder";

const TOOLS = [
  { icon: CalendarCheck, name: "Google Calendar — Check Availability", integration: "Google Calendar" },
  { icon: CalendarPlus, name: "Google Calendar — Create Event", integration: "Google Calendar" },
  { icon: Sheet, name: "Google Sheets — Add Row", integration: "Google Sheets" },
  { icon: PhoneForwarded, name: "Human Transfer", integration: "Telephony" },
  { icon: PhoneOff, name: "End Call", integration: "Built-in" },
  { icon: MessageSquareText, name: "Send Text", integration: "Messaging" },
  { icon: Webhook, name: "Custom API Request", integration: "Custom" },
];

export default function ToolsTab(_props: BuilderTabProps) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground">Tools</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Actions this assistant can take during a call.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-muted px-4 py-3 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Integration</span> = a connected account or
        credential (Manage → Integrations).{" "}
        <span className="font-semibold text-foreground">Tool</span> = an action assigned to this
        assistant. Tool connections will be enabled in a later checkpoint.
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {TOOLS.map((tool) => (
          <div key={tool.name} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
              <tool.icon className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{tool.name}</p>
              <p className="text-[11px] text-muted-foreground">Requires {tool.integration}</p>
            </div>
            <Switch checked={false} disabled aria-label={`Enable ${tool.name}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
