# Owner test script — staging browser call (2026-09-11)

Environment: **SiteMint-Voice-Staging**, `https://site-mint-voice-staging.replit.app`
Build under test: dashboard `index-tmcjg74D.js`, source `83ff869`.
Assistant: `SiteMint App Staging Receptionist` — OpenAI `gpt-4.1`, Vapi voice
`Elliot`, Soniox transcriber, recording and transcript retention **off**.

This is a real browser call to a real provider. It is not a simulation, and
nothing here is prerecorded.

## Before you start

- Use Chrome or Edge on a laptop/desktop with a working microphone. Headphones
  help — without them the assistant can hear its own voice and interrupt itself.
- The browser will ask for microphone permission. Allow it. If you previously
  blocked it for this site, clear that in the padlock menu first.
- Have a quiet minute. Two or three short calls are enough.

## Steps

1. Open **https://site-mint-voice-staging.replit.app/ai-receptionist/dashboard/login**
   and sign in as the staging owner account.
2. Go to **Assistants** and open `SiteMint App Staging Receptionist`.
3. Confirm the readiness panel before calling — it should say the provider key
   and webhook secret are *configured*. It must never say "Live" or "Connected"
   purely on the basis of configuration.
4. Press **Start Browser Test**, confirm in the dialog, and allow the microphone.
5. Speak first — say hello and wait for the greeting to finish.

## What to try, and what to tell me about each

**a. Voice and speed.** Does the assistant sound natural? How long is the gap
between you finishing a sentence and it starting to answer — instant, a beat,
or awkward?

**b. Interruption.** Start talking while it is mid-sentence. Does it stop and
listen, or talk over you?

**c. Mute and End Call.** Mute, say something, unmute, and check it did not
hear the muted part. Then press **End Call**. Confirm the browser's microphone
indicator turns **off** — a mic left live after a call is a defect, tell me
immediately.

**d. Business answers.** Ask two or three things a real caller would ask —
what the business does, hours, whether it can help with a specific problem.
Note anything invented or wrong.

**e. Booking.** Ask to book an appointment. Give a name and a time. Note
whether it confirms a specific slot or is vague.

**f. Honest failure.** Ask for something it cannot do — a price quote, a
transfer to a person, a text message. It should say plainly that it cannot,
not improvise.

## After the call

Note the call time. I will match it against the provider call id, the dashboard
call record, and the usage entry, and report whether all three line up.

## What is deliberately inactive

Telephone calling, call forwarding, transfer to a person, billing, and SMS are
off in this environment and are not part of this test. Browser calling working
does **not** mean inbound phone calls are ready.
