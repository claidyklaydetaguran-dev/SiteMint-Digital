import { CheckCircle2, Circle, FlaskConical } from "lucide-react";
import { useVoiceProviderStatus, useRealCallsList } from "@/hooks/useVoiceCalls";
import { StatusBadge, type StatusTone } from "@/components/common/StatusBadge";

function ConfigRow({ label, configured }: { label: string; configured: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {configured ? (
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
      ) : (
        <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="text-foreground">{label}</span>
      <span className="ml-auto text-xs text-muted-foreground">{configured ? "Configured" : "Not configured"}</span>
    </div>
  );
}

/**
 * Honest real-voice readiness summary. Every label here reflects either a
 * server-verified environment-variable presence check or an actual count of
 * folded real (Vapi + Twilio) call records — never "Live"/"Operational"/
 * "Connected" language unless that exact state has been verified.
 */
export function VoiceProviderStatusCard() {
  const { data: status, isLoading: statusLoading } = useVoiceProviderStatus();
  const { data: calls } = useRealCallsList();

  const hasVerifiedRealCall = (calls?.items ?? []).some((c) => c.isFinal);
  const overallLabel = hasVerifiedRealCall
    ? "Real voice verified"
    : "Real voice integration configured but not yet verified";
  const overallTone: StatusTone = hasVerifiedRealCall ? "success" : "info";

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Voice provider readiness</h2>
        <StatusBadge label={overallLabel} tone={overallTone} />
      </div>

      {statusLoading || !status ? (
        <p className="text-sm text-muted-foreground">Checking configuration…</p>
      ) : (
        <div className="space-y-2">
          <ConfigRow label="Vapi API key (server)" configured={status.vapiApiKeyConfigured} />
          <ConfigRow label="Vapi webhook signature secret" configured={status.vapiWebhookSecretConfigured} />
          <ConfigRow label="Vapi browser public key" configured={status.vapiPublicKeyConfigured} />
          <ConfigRow label="Development phone number verified" configured={status.developmentPhoneNumberVerified} />
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 rounded-lg border border-statusbadge-info-bg bg-statusbadge-info-bg/40 px-3 py-2 text-xs font-medium text-statusbadge-info-text">
        <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>Demo Mode is available in Call Logs while Vapi and Twilio setup is completed.</span>
      </div>
    </div>
  );
}
