/**
 * V5 / AR-001M: the assistant session guard, hosted behind the voice build
 * boundary. `App.tsx` used to import `useAssistantSessionGuard` statically,
 * which pulled `lib/assistantsApi` — and its `/receptionist/voice/*` endpoint
 * literals — into the entry chunk of every build, gated or not. Loading the
 * guard through `routes/voiceRoutes.ts` keeps that whole graph out of a
 * gated-out build; the disabled branch resolves to the shared null gate.
 */
import { useAssistantSessionGuard } from "@/hooks/useAssistants";

export default function AssistantSessionGuardHost() {
  useAssistantSessionGuard();
  return null;
}
