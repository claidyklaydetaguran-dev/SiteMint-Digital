import { Info } from "lucide-react";

interface BuilderNoticeProps {
  className?: string;
}

/**
 * Persistent, screen-reader-friendly notice that nothing in the builder is
 * saved yet. Must remain visible on every builder tab — never success wording.
 */
export function BuilderNotice({ className = "" }: BuilderNoticeProps) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-warning-foreground dark:text-warning ${className}`}
    >
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <div className="text-xs leading-relaxed">
        <p className="font-semibold">Not connected yet</p>
        <p className="text-[11px] opacity-90">Changes in this preview are not saved.</p>
      </div>
    </div>
  );
}
