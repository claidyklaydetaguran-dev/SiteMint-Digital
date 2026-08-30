import { useRoute } from "wouter";
import { PublicBookingCalendar } from "@/components/booking/PublicBookingCalendar";
import { usePublicConfig } from "@/hooks/usePublicScheduling";

/**
 * Checkpoint B: the public, unauthenticated scheduling page — no dashboard
 * chrome, no login, no internal firm id in the URL. Reachable at
 * /schedule/:slug for linking or embedding from a business's own website.
 */
export default function PublicSchedule() {
  const [, params] = useRoute("/schedule/:slug");
  const slug = params?.slug ?? "";
  const configQuery = usePublicConfig(slug);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">
            {configQuery.data ? `Book with ${configQuery.data.firmName}` : "Schedule an appointment"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick a date and time below. Submitting sends a request for review — it does not book the
            appointment automatically.
          </p>
        </header>
        <PublicBookingCalendar slug={slug} />
      </div>
    </div>
  );
}
