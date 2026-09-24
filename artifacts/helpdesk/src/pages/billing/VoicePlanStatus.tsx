/**
 * J7 — the receptionist plan's real state, from `GET /receptionist/account/subscription`.
 *
 * The legacy trial/paid label below it describes text-message conversations.
 * This block is what decides whether the receptionist may run: active, a
 * failed payment inside its grace period, paused after grace ran out,
 * cancelled, or not activated. Each state says what happens and what to do.
 */

import { useQuery } from "@tanstack/react-query";
import { useAuthenticatedFirmId } from "@/hooks/useSession";
import { InlineError } from "@/components/common/InlineError";
import { voicePlanStatusCopy, type VoiceSubscriptionView } from "@/pages/billing/billingContract";

async function fetchSubscription(): Promise<VoiceSubscriptionView> {
  const res = await fetch("/api/receptionist/account/subscription", { credentials: "include" });
  if (!res.ok) throw Object.assign(new Error(`API ${res.status}`), { status: res.status });
  return (await res.json()) as VoiceSubscriptionView;
}

export function VoicePlanStatus() {
  const firmId = useAuthenticatedFirmId();
  const query = useQuery<VoiceSubscriptionView>({
    queryKey: ["billing", "voice-subscription", firmId ?? "unresolved"],
    queryFn: fetchSubscription,
    enabled: firmId !== undefined,
  });

  if (query.isLoading) {
    return <p className="sd-sr" role="status" aria-live="polite">Checking your receptionist plan…</p>;
  }
  if (query.isError || !query.data) {
    return (
      <InlineError
        title="Your receptionist plan couldn't be checked"
        description="This is a failed read, not a change to your plan. Try again."
        onRetry={() => void query.refetch()}
      />
    );
  }
  const copy = voicePlanStatusCopy(query.data);
  return (
    <section className="sd-section" aria-labelledby="sb-voice-plan-h" data-tone={copy.tone}>
      <h2 className="sd-h2" id="sb-voice-plan-h">Receptionist plan</h2>
      <p className="sd-status__title">{copy.title}</p>
      <p className="sb-lede">{copy.detail}</p>
    </section>
  );
}
