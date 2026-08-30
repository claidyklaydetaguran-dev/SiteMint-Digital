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
 * The first correction gave this module its own bare literal comparison
 * against `import.meta.env.VITE_VOICE_PLATFORM_ENABLED`, because that is the
 * only shape Vite substitutes and Rollup folds. It removed the chunks, but it
 * also created a second reading of the flag: `parseBooleanFlag` accepts
 * `"TRUE"` and `" true "`, this comparison did not, and a build set to either
 * spelling showed the voice navigation while every voice route resolved to
 * Not Found.
 *
 * `voicePlatformEnabled` is now itself foldable — see the note in
 * `lib/featureFlags.ts` — so this module reads that constant instead of
 * parsing the variable again. Navigation, route registration and the page
 * imports below therefore share one interpretation, and a build in which the
 * navigation is visible is by construction a build in which these imports
 * were kept.
 *
 * The disabled branch resolves each voice page to the existing not-found page
 * rather than to nothing. With a single interpretation it is unreachable —
 * whenever it is selected, `App.tsx` registers no voice route to render it —
 * and it stays as the branch's total answer for all seven keys, and as the
 * defence if a route were ever registered without its gate. Neither flag's
 * meaning nor default changes.
 *
 * This module adds no behaviour of its own. The route table, its order, the
 * gate in `App.tsx`, and every page's own behaviour are unchanged.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from "react";

import { voicePlatformEnabled } from "@/lib/featureFlags";

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

export const voiceRoutePages: VoiceRoutePages = voicePlatformEnabled
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
