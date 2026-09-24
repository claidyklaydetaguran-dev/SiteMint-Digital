---
name: sitemint-voice-preview
description: Diagnose and repair SiteMint receptionist voice selection, samples, greeting previews and consistency with the published assistant.
---

Use the existing voice integration and reproduce the customer failure first.
Trace the selected voice through UI, API, credentials, provider configuration,
audio response and deployed browser. Separate voice identity from response presets.
Check current provider availability and deprecated IDs before adding dependencies.
Use playable provider audio or permitted generated audio of the selected voice.
Never replace it with an unrelated browser voice or a fake playing indicator.
Keep private credentials server-side. Authorize personalized previews, bound
generation and retries, isolate caches by business and avoid arbitrary URL proxies.
Verify actual media playback, save/reload, publishing and the resulting voice.
Record the root cause and deployed evidence in the existing Pilot Ledger.

Repository anchors: the catalog lives in `artifacts/api-server/src/lib/voice/`
(provider mapping in `providers/vapi/`), publish validation in
`lib/voicePublishing/persistedConfigMapper.ts`, the customer player in
`artifacts/helpdesk/src/components/common/VoiceSamplePlayer.tsx` and
`lib/voiceSampleAdapter.ts`.
