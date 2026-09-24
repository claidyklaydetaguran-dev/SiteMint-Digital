# Call replay and complete SiteMint release — continuation checkpoint

Prepared against release commit `458bfb2d587dfad4c8eeac6e491a5624713eef08`.
The owner now wants Claude to take over integration and deployment. These changes
have **not** been deployed, recording has **not** been enabled, and no number
has been purchased or assigned by this workstream.

## Changes ready for review

- Call detail includes a native audio player: explicit load/play, seeking,
  volume and 0.75–2× speed, with unavailable, disabled, pending and failed states.
- `GET /api/receptionist/voice/calls/:callId/recording` checks the existing
  receptionist session and firm-owned call before constructing a provider.
  It requires the server's `VOICE_ARTIFACT_POLICY=full`, refuses synthetic and
  unfinished calls, rate-limits reads, and returns a fresh signed URL with
  private/no-store headers. URLs are never persisted or logged.
- The optional provider-neutral `getCallRecording` method uses Vapi's
  authenticated mono-recording endpoint. It handles the 302 manually and never
  forwards the private key to storage. HTTPS S3, Google Storage and Supabase
  destinations are supported; verify the actual account's destination before
  launch. Other storage hosts currently fail closed and need a reviewed adapter
  extension, not removal of URL validation.
- Phone Number now offers new-number and existing-number request forms backed by
  the existing Support request API. Existing open requests are shown after a
  reload; failed reads do not look like no request. This is a tracked setup
  request, not self-service purchase, import, porting or assignment.
- Confirmed Discovery/Projects authorization gap fixed: reads require the
  appropriate read permission, writes the corresponding write permission, and
  project task creation/conversion also requires `tasks.write`. Existing hard
  delete permissions and the shared staff-session/CSRF gate remain in place.
- No dependency, lockfile, migration, secret or environment change is included.

## Verification actually performed

- 72 tests pass across recording transport, recording route ownership/policy,
  Discovery/Projects permission wiring, existing voice samples and route security.
- Call Logs contract passes, including the built output checks; phone-number
  contract passes 16 checks; the recording response contract passes.
- Library, API and helpdesk TypeScript checks pass. API and voice-enabled
  helpdesk production builds pass. Vite reports sourcemap warnings in existing
  shared UI components; it still emits the build successfully.
- The new permission route tests substitute the session seam and database
  tripwires. They are not a substitute for the existing real-database staff
  authentication/CSRF tests and the new denied-permission cases on that database.
- No live recording was played; no browser visual pass, production database
  rehearsal, full release gate or voice-boundary matrix was performed here.
  Those remain release gates for the exact integrated commit.
- This runtime's pnpm 11 added an invalid `allowBuilds` placeholder during
  installation. That generated change was removed. Existing installed binaries
  ran the checks without enabling an unapproved install script. In the supported
  project runtime, use the checked-in package-manager/build policy; don't commit
  a placeholder or disable supply-chain checks. `node --import tsx` ran the
  contract tests because this container cannot create tsx's CLI IPC socket.

## Remaining work in order

1. Review and integrate this change into the latest shared release, preserving
   any newer Claude work. Keep one deployment owner for both Replit apps.
2. Finish recording activation: approved disclosure/consent before capture,
   approved retention/deletion behavior, private provider storage and successful
   future-call playback. Keep recording off until those conditions are met.
   A call made with recording disabled can never acquire historical audio.
   Show a transcript only when actually retained; do not invent time alignment.
3. Verify the operator-owned inventory number ending 9097. If it is still owned
   and free for this pilot, assign it to the correct business and published
   assistant on staging, checking both local assignment and actual provider
   routing. Keep SiteMint's intake SMS number and webhooks untouched.
4. Complete the staging customer/browser/microphone/calendar/inbound-call tests
   in the owner's brief; transfer remains off until a consenting recipient test.
   The real-call reports used typed caller turns and are not microphone proof.
5. Rehearse the exact candidate on a safely restored copy of the actual
   production catalog; preserve records and migration journals. Verify actual
   target identities and effective source-defined settings without displaying
   secrets. Prior 84-to-110 or 121-table fresh builds are insufficient alone.
6. Publish the API/dashboard backend and then the compatible marketing/proxy
   deployment, verify the public hostname and record the exact deployed version.

## Deployment topology and observations

The repository's `docs/crm-ops/DEPLOYMENT-BLOCKED.md` records:

`sitemintdigital.com` → Replit **SiteMint-Digital** marketing/proxy →
Replit **Web Asset Builder** backend (`sitemintdigital.replit.app`).

Preserve this arrangement unless a current authenticated inspection proves it
has changed. Include `/portal` as well as `/api`, `/admin`, `/app`, `/ai-toolkit`
and `/ai-receptionist/dashboard` in the applicable proxy deployment. Marketing
is not a replacement database host. The backend publishes prebuilt dashboard
and marketing assets, so verify every required frontend was built and included.

Replit read-only inspection reported Web Asset Builder workspace at
`194ff793fb4f48d68bb162b03c53509148a7f2bf` on
`feature/ai-receptionist-visible-progress`, without the current release commit,
and no demonstrated production rehearsal. It could not identify the live
commit. Its missing-setting list included names from older code; reconcile
against current source, not that unverified list. No Replit mutation was issued.

Current source uses `CALENDAR_TOKEN_KEY`, `CORS_ALLOWED_ORIGINS` and
`CRM_LEGACY_BEARER_ENABLED=false`; do not substitute similarly named legacy keys.
Preserve any existing calendar encryption key. Resolve backup connection strings
inside the authorized environment and keep dumps out of publish artifacts.

## Authoritative scope

Signup/sign-in already works on staging. Keep open signup, Terms/Privacy dialogs,
four-step setup, real voice samples, actual dashboard data, team access and
automatic booking after confirmed calendar success. SMS remains deferred and
Stripe/commercial activation stays last. Customer workspaces never gain access
to SiteMint's private CRM. Do not mark rows Yes or claim 90–95% to meet a target
without deployed customer evidence.

Official references checked 17 September 2026:

- https://docs.vapi.ai/assistants/retrieve-call-artifacts
- https://docs.vapi.ai/assistants/call-recording
- https://docs.vapi.ai/phone-calling
