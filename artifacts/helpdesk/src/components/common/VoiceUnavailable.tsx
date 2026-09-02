/**
 * Capability state for voice-platform destinations in builds where the
 * platform is NOT enabled (R1 correction 5).
 *
 * Deliberately minimal, because the committed built-output boundary (the
 * AR-001M matrix) forbids a disabled build from emitting any voice-gated
 * navigation label, description, href-only destination, or gated-only icon
 * — a disabled build must not advertise unbuilt voice features. So this
 * page uses one neutral title and copy, an inline mark instead of a shared
 * icon, exposes no action, and implies no backend enablement. The paths it
 * answers come from the always-bundled route table, adding no new strings.
 */

import { Link } from "wouter";

export function VoiceUnavailable() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <svg
        className="mb-5 h-12 w-12 text-primary"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="5.2"
          y="5.2"
          width="13.6"
          height="13.6"
          rx="2"
          transform="rotate(45 12 12)"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" />
      </svg>
      <h1 className="font-display text-2xl font-semibold text-foreground">
        Voice features
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        This area belongs to the SiteMint voice platform, which is not enabled
        on this workspace. Nothing is running in the background — your SMS
        receptionist and everything in the sidebar remain fully available.
      </p>
      <span className="mt-4 inline-flex items-center rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
        Not enabled on this workspace
      </span>
      <Link
        href="/"
        className="mt-6 text-sm font-medium text-primary hover:underline focus-visible:underline"
      >
        Back to Overview
      </Link>
    </div>
  );
}

export default VoiceUnavailable;
