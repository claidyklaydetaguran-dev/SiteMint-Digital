/**
 * Frontend V2 / AR-001J — the voice-platform **build** boundary.
 *
 * Before this module existed, `App.tsx` declared all seventeen pages with
 * `lazy(() => import("@/pages/X"))` at module scope, the seven voice-platform
 * pages included, and only the `<Route>` registrations sat behind
 * `voicePlatformEnabled`. But a dynamic import is a bundler instruction, not a
 * runtime one: Rollup emits a chunk for every `import()` it can reach, whether
 * or not the code around it ever runs. A default-gated build therefore built,
 * shipped and served every voice chunk — the Vapi SDK among them — that it
 * could never load.
 *
 * `voicePlatformEnabled` cannot close that on its own, and this is the root of
 * it: it is `parseBooleanFlag(import.meta.env.…)`, a *function call*, which no
 * bundler can evaluate. The gate it provides is only ever a runtime one, so
 * the branch it guards — and the `import()` calls inside it — always survive
 * into the module graph.
 *
 * `VOICE_BUILD_ENABLED` below is deliberately a bare literal comparison
 * instead. Vite substitutes `import.meta.env.VITE_VOICE_PLATFORM_ENABLED` with
 * the build's own literal before Rollup sees this module, so the conditional
 * collapses at build time and the enabled branch's `import()` calls leave the
 * graph entirely. Nothing is emitted, so nothing can be fetched.
 *
 * The disabled branch resolves each voice page to the existing not-found page
 * rather than to nothing. It is unreachable in both states that matter —
 * unset and `"false"` each leave `voicePlatformEnabled` false, so `App.tsx`
 * registers no voice route at all — and exists only so that a spelling
 * `parseBooleanFlag` accepts but this comparison does not (`"TRUE"`,
 * `" true "`) degrades to the documented not-found experience instead of
 * failing to resolve a module. Neither flag's meaning or default changes.
 *
 * This module adds no behaviour of its own. The route table, its order, the
 * gate in `App.tsx`, and every page's own behaviour are unchanged.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** Build-time twin of `voicePlatformEnabled` — see the note above. */
const VOICE_BUILD_ENABLED = import.meta.env.VITE_VOICE_PLATFORM_ENABLED === "true";

/** Each voice page reads its parameters through `useRoute`, never from props. */
type VoiceRoutePage = LazyExoticComponent<ComponentType>;

export interface VoiceRoutePages {
  Assistants: VoiceRoutePage;
  AssistantCreate: VoiceRoutePage;
  AssistantBuilderNew: VoiceRoutePage;
  AssistantBuilder: VoiceRoutePage;
  CallLogs: VoiceRoutePage;
  CallLogDetail: VoiceRoutePage;
  Appointments: VoiceRoutePage;
}

/** Already emitted by every build, gated or not — see the note above. */
const unavailable = () => import("@/pages/not-found");

export const voiceRoutePages: VoiceRoutePages = VOICE_BUILD_ENABLED
  ? {
      Assistants: lazy(() => import("@/pages/Assistants")),
      AssistantCreate: lazy(() => import("@/pages/AssistantCreate")),
      AssistantBuilderNew: lazy(() => import("@/pages/AssistantBuilderNew")),
      AssistantBuilder: lazy(() => import("@/pages/AssistantBuilder")),
      CallLogs: lazy(() => import("@/pages/CallLogs")),
      CallLogDetail: lazy(() => import("@/pages/CallLogDetail")),
      Appointments: lazy(() => import("@/pages/Appointments")),
    }
  : {
      Assistants: lazy(unavailable),
      AssistantCreate: lazy(unavailable),
      AssistantBuilderNew: lazy(unavailable),
      AssistantBuilder: lazy(unavailable),
      CallLogs: lazy(unavailable),
      CallLogDetail: lazy(unavailable),
      Appointments: lazy(unavailable),
    };
