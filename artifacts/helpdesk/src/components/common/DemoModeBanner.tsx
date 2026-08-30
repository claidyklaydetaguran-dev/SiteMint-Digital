import { FlaskConical } from "lucide-react";

/**
 * Consistent, unmissable label for screens backed by sample data rather
 * than a live call, transcript, or booking. Never render call/transcript/
 * appointment fixture data without this banner alongside it.
 */
export function DemoModeBanner({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-statusbadge-warning-bg bg-statusbadge-warning-bg/40 px-3 py-2 text-xs font-medium text-statusbadge-warning-text">
      <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
      <span>Demo Mode — {text}</span>
    </div>
  );
}
