# Call recording — the decision that has to be made before capture is switched on

Replay is built and deployed. Capture is a separate switch, and this is what
turning it on actually means. Nothing here is enabled in production.

## What the switch does

`VOICE_ARTIFACT_POLICY` is server-owned, per environment, and read when an
assistant is published or synchronized:

| Value | Audio kept | Transcript kept | Replay in the dashboard |
| --- | --- | --- | --- |
| `none` (production today) | no | no | "Audio replay is switched off for this workspace" |
| `transcript_only` | no | yes | still off — there is nothing to play |
| `full` | yes | yes | plays the retained audio for that call |

Three consequences, all measured rather than assumed:

1. **It is not retroactive.** A call made while the policy was `none` has no
   audio anywhere, ever. Every call before the switch stays unplayable.
2. **It needs a republish.** The recording instruction lives in the published
   assistant. Changing the variable changes nothing until each assistant is
   published or synchronized again.
3. **Storage is the provider's.** Audio sits with the voice provider, and the
   dashboard fetches a fresh, short-lived link each time someone presses play.
   SiteMint never stores the audio or the link.

## Wording to approve (or change)

**Spoken at the start of every call, before the caller says anything:**

> "This call is recorded for quality and training. If you'd rather it wasn't,
> tell me and I'll take a message instead."

**For the Privacy Policy, under "Information from using our services":**

> Where a business turns on call recording, the audio of a call to that business
> is recorded and kept by our voice provider, and the people that business has
> invited to its account can play it back from the call record. Callers are told
> at the start of the call. Recordings are kept for 30 days and then deleted.
> A business can ask us to delete a recording sooner, and can switch recording
> off, which takes effect on its next publish.

**Retention:** 30 days is a proposal, not a current setting — there is no
retention rule configured today. The number has to be a decision, because the
provider keeps audio until it is deleted.

## The honest limit on consent

A one-line notice at the start of the call is a *disclosure*, not consent
obtained before capture. Recording is decided per call, when the call starts —
so a call that records at all records the opening sentence too. Genuine
"record only after the caller agrees" needs one of:

- two assistants: an unrecorded one that answers, and a recorded one the call is
  handed to once the caller agrees (an extra transfer the caller hears); or
- per-call recording chosen at answer time, which the provider supports only
  through a per-call override our publish path does not currently send.

If you need consent-before-capture (two-party-consent states, or callers in the
EU/UK), say so and the two-assistant hand-off is the change to make. If a
disclosure is enough for where your callers are, the wording above is all that
is needed.

## What is switched on where

- **Production:** `none`. Unchanged by this work, and it stays that way until
  you approve wording and a retention period.
- **Staging:** switched to `full` on 18 September to prove replay end to end,
  with the disclosure above spoken by the labelled test receptionist and only
  consenting test participants on the line. The staging test business is
  SiteMint's own.

## What was verified with it on

Recorded on the staging release; see the Pilot Ledger for the evidence lines.
