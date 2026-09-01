# AI Receptionist — Demo Theater (design + future activation contract)

**This phase ships a typed state-machine simulation only. Vapi is NOT activated; no public
calling exists.** The theater is designed so the simulated adapter and the future live adapter
implement the same interface.

## V4.1 capability-honest copy rules (binding until certification)

- Page lead: **"Meet the receptionist designed to help every caller reach the next right
  step."** Language describes *design intent* ("designed to answer, qualify, and guide"), never
  certified production behavior.
- The theater is labeled prominently: **"Interactive staging preview — simulated conversation"**
  (amber tag), and the action reads **"Preview the experience"** — no "live conversation"
  wording anywhere until the real public demo is authorized.
- No production-SMS claims, no completely-autonomous-booking claims: simulated scripts end with
  "preferred time captured for the team to confirm", never "appointment booked".
- Visible privacy/artifact line on the theater: "No recording · no transcripts retained ·
  artifact policy: none", plus the simulation disclosure ("no microphone is requested, no audio
  plays, nothing is live").
- Contextual example-question chips (appointments / hours / callback) seed the simulated script.

## Interface: Receptionist Theater (V4.1)

A distinctive SiteMint stage: the **Signal voice object** — the diamond inside a responsive ring
field rendered on canvas (rings ripple inward while Listening, dots orbit while Thinking, rings
emanate outward while Speaking, a mint ring when Ended) — with state label, elapsed timer, End
control, example-question chips, and the disclosures above.

### Prototype state machine (simulated adapter)

```
ready → listening ⇄ thinking ⇄ speaking → ended → ready
any active state → ended (End control, Escape, or 02:00 cap)
```

### Future live-adapter states (unchanged from V4.0, for the real integration)

```
ready → mic_explain → permission_request → connecting → listening ⇄ thinking ⇄ speaking
      ↘ unavailable                         ↘ error      ↘ reconnecting → listening
listening/thinking/speaking → session_ending → ready
any active state → time_limit_reached → ready
```

| State | Visual | Copy/behavior |
|---|---|---|
| `ready` | Diamond idle, slow 4s breath pulse | "Try a live conversation" + Start button. **Nothing auto-starts; no mic request on page load.** |
| `mic_explain` | Diamond opens into ring | Explains the mic will be requested, what happens, the AI disclosure, and the time limit — Continue / Cancel |
| `permission_request` | Ring pulses cyan | Browser permission prompt is out; instructions if dismissed |
| `connecting` | Thread orbits the ring | "Connecting…" with cancel |
| `listening` | Waveform bars, cyan, caller-driven | Timer runs; "Listening" label (state never conveyed by motion alone) |
| `assistant_speaking` | Waveform turquoise, assistant-driven | "Assistant speaking" label |
| `reconnecting` | Bars freeze, ring dashes rotate | "Reconnecting…" with countdown to give-up |
| `session_ending` | Bars collapse to line | "Wrapping up" |
| `time_limit_reached` | Line → mint terminus dot | "Demo limit reached — thanks for trying it" + summary of what a real deployment does |
| `unavailable` | Diamond dim, amber dot | "Demo is at capacity right now" + link to book a walkthrough |
| `error` / privacy | Diamond dim | Plain-language failure + retry; never blames the user |

Controls: Start (min 44×44), End (always visible during any active state), timer `aria-live=off`
with a text alternative, state label in an `aria-live=polite` region. Full keyboard: Start/End
focusable, Escape ends session. Screen readers get state text, not waveform.

Hard rules (all phases): no autoplay audio; no recording/transcript claims (and artifact policy
stays `none`); no private key in client code (browser gets only `VITE_VAPI_PUBLIC_KEY` when ever
activated); no fake conversation presented as live — the simulation is labeled "Interface
preview: simulated conversation" in the prototype; no tools, booking, transfer, or SMS in any
public demo.

## Backend activation contract (LATER phase — not built now)

Prerequisites: owner approval + AR-002-series staging verification. Design constraints the
backend must satisfy before the theater's live adapter is allowed to mount:

1. **Server-minted sessions.** Browser never talks to Vapi with a standing key. A
   `POST /api/voice/demo-session` endpoint mints a short-lived, single-use session (server holds
   `VAPI_API_KEY`; response carries only the ephemeral join credential).
2. **Per-IP and per-session limits.** Sliding-window per-IP (e.g. 3 sessions/hour, 6/day) +
   one concurrent session per IP; enforced server-side, backed by the existing rate-limit
   patterns (`authRateLimit` style, not imported from protected files).
3. **Short max duration.** Hard server-side cap (e.g. 120s) — server terminates the call at cap;
   client timer is cosmetic.
4. **Concurrency ceiling.** Global cap on simultaneous demo calls (e.g. 3); above it the theater
   receives `unavailable` (never queues silently).
5. **Cost ceiling.** Daily credit/minute budget; when spent, endpoint returns `unavailable` with
   a `Retry-After`. Graceful quota exhaustion is a designed state, not an error.
6. **Artifact policy `none`.** `VOICE_ARTIFACT_POLICY=none` applies; explicit artifactPlan
   disabling recording/transcripts on every demo assistant request (existing platform rule).
7. **Abuse prevention.** Origin allow-list on the mint endpoint, no cross-firm data, demo
   assistant has no tools/transfer/SMS and a fixed prompt; suspicious traffic falls to
   `unavailable`.
8. **HMAC webhook verification.** Demo call webhooks use the existing verified HMAC path
   (milliseconds timestamp rule per PR #22).
9. **Automatic cleanup.** Sessions and provider-side assistants/calls for the demo are reaped on
   TTL; orphan reaper runs on interval.
10. **Kill switch.** Single env flag turns the endpoint off; theater then renders `unavailable`.

The activation contract will be its own PRD; nothing in this phase creates routes, env vars, or
Vapi objects.
