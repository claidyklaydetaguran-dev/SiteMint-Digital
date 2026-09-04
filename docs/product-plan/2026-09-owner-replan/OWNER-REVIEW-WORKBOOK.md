# Owner Review Workbook — DECISIONS RECORDED (2026-09-04)

> Status: **COMPLETE.** The owner returned every decision on 2026-09-04, then issued the
> **Brand, Homepage and AI Receptionist Amendment**, which supersedes any conflicting
> visual, homepage, positioning, pricing and AI Receptionist decision below. Where the
> amendment changed an answer, the row shows `SUPERSEDED →` and the amended decision.
> These decisions are approved product direction. Every dependent planning document in this
> directory was reconciled to them on 2026-09-04; the consolidated creative and engineering
> plan is `V5-BLUEPRINT.md`.

## 0. Core product direction (approved)

1. SiteMint Digital is the master company brand; AI Receptionist is one SiteMint product, the highest-priority revenue product, and must not dominate the company identity.
2. Immediate launch target: honest, invite-only AI Receptionist private beta.
3. Visual direction: Operational Editorial (premium, spacious, restrained, quietly expensive, technically sophisticated, accessible). **Amended:** the palette becomes mint-centred (aqua-mint between green and blue), light-forward, with deep teal for text and ink reserved for contrast or selected dramatic moments; navy no longer leads.
4. Never: purple, excessive gradients, card walls, fake dashboards, fabricated clients, unsupported metrics, testimonials, AI overstatement, neon/cyberpunk, ordinary leafy green, washed-out pale mint, different colour identities per page.
5. Every feature is labelled operational, disabled, or coming later. Nothing planned looks live.
6. Operations CRM stays private and separate.
7. `VOICE_ARTIFACT_POLICY=none`; no call audio or transcripts retained.
8. Replit staging stays paused: no shut down, resume, republish or provider activation.
9. "Signal" is an internal design-system/engineering codename only; it leaves all public copy, titles, metadata and visible branding. Internal contracts, components and evidence directories keep their names.

## 1. Company website

| # | Page | Decision | Recorded direction |
|---|---|---|---|
| W-1 | Homepage | CHANGE · SUPERSEDED → amendment §6 | Headline "Digital systems built to move your business forward." Supporting: "SiteMint designs websites, web applications, CRM systems, AI automation, and custom software that work together—from the first interaction to the next meaningful action." Brand line: "Capture. Organize. Connect. Resolve." Primary CTA "Build Your SiteMint System"; secondary "Explore What We Build". Keep nav + scroll transition, particles, scatter/capture behaviour and the bottom sequence. "From first click to booked customer" moves to lead-generation / AI Receptionist contexts only. Hero is expanded into one connected-signal story (website → capture → CRM record → AI routing → AI conversation/workflow → resolved outcome). Cinematic background produced only after the visual-development package is approved; no paid generation without authorisation. |
| W-2 | What We Build overview | KEEP + CHANGE | Keep `/services`; add working section anchors and correct active-nav behaviour. Interaction signature: interactive systems map. |
| W-3 | Duplicate AI Receptionist | CHANGE | Keep the nav pill; remove the duplicate card from the mega panel. Mega panel describes service categories only. |
| W-4 | Websites & Web Apps | KEEP | One route for now. |
| W-5 | Discovery Systems | KEEP | Core pillar. |
| W-6 | Workflow Automation | CHANGE | Rename to "AI Systems & Automation"; include CRM systems as a substantial section; no separate CRM route yet. |
| W-7 | Work | CHANGE | Keep the three capability compositions; rewrite every unsupported claim now. Labels: Available now · Private beta · In development · Planned. |
| W-8 | Process | CHANGE | Real five phases: Discover · Design · Build · Validate · Launch & Improve, each with the concrete client output. |
| W-9 | Company | CHANGE + ADD | Remove "answers real calls" and "is our actual intake". Add a restrained team section: Shasta Greene — Head of Strategy; Claidy Taguran — Technical Director; Saisa Lorraigne — Project & Admin Manager. Roles only; no invented biographies. |
| W-10 | Start a Project | KEEP | `/start` stays the primary path. |
| W-11 | Discovery intake | CHANGE · P0 | Keep the multi-step experience; connect to the real backend with submission, loading, error, success and duplicate-prevention states. Flag stays off until the whole journey passes testing. |
| W-12 | Contact | REMOVE as separate experience | Fold into `/start`; `/contact` redirects to the relevant `/start` section (or a minimal V4-compatible route). V2 experience retired. |
| W-13 | Pricing | SUPERSEDED → amendment §10 | The V2 page is retired, but pricing **returns** rebuilt in the V5 system: Starter Site System from $2,995 · Growth Digital System from $5,995 · Custom Connected System from $9,995, with the "Starting estimates…" disclaimer, a scope configurator, and an honesty check of every inclusion against what the business can deliver (see V5-BLUEPRINT §9). AI Receptionist pricing stays separate and un-invented. |
| W-14 | Privacy / Terms | ADD · action | Prepare for owner/legal review now; approval mandatory before public launch. |
| W-15 | Insights | KEEP HIDDEN | Until the first approved article. |
| W-16 | 404 | CHANGE · P0 | On-brand recovery page: plain explanation + Home, What We Build, AI Receptionist, Start a Project, Client Sign In. |
| W-17 | Mobile nav | CHANGE | Rename group "Company" → "Explore" (or drop the label); Work / Process / Company stay separate destinations. |
| W-18 | Legacy verticals | REMOVE · amended §11 | Retire `/ai-for-lawyers` and `/ai-for-realtors`. Their verified ideas move into an AI Receptionist "Built for different businesses" section (professional services, legal offices, real estate teams, home services, healthcare offices with privacy limits, appointment-based businesses). No industry performance claims. |

## 2. AI Receptionist landing page (amended §12–§15 apply)

| # | Section | Decision | Recorded direction |
|---|---|---|---|
| L-1 | Hero | CHANGE | Headline "Never let a good opportunity end at a missed call." Supporting: "SiteMint AI Receptionist is built to answer incoming calls, handle routine questions, and help callers reach the right next step using your actual business rules and availability." Display "Private beta — invite only". Theater label: "Interactive product preview — simulated. No live call is taking place." No "every call", "24/7", or active-service implication. Cinematic AI-call hero video per its own storyboard. |
| L-2 | Capabilities | CHANGE + ADD | List certified scheduling capabilities once their controls are connected (availability, request, approve/book, reschedule, cancel, Google Calendar availability) with readiness badges. Never market number assignment, live inbound, browser calling, transfers or transcripts before certification. |
| L-3 | How it works | CHANGE | Six steps: tell SiteMint about your business → configure receptionist, voice, permitted actions → set availability + connect Google Calendar → test and approve → activate the assigned number → review calls, contacts, appointments. |
| L-4 | Outcomes | KEEP with copy review | Qualitative only: fewer missed opportunities; consistent caller handling; less repetitive admin; easier appointment coordination; visibility after each call. |
| L-5 | Pricing posture | ADD | "Private beta — invite only" and "Private-beta pricing is provided during onboarding." |
| L-6 | Privacy | CHANGE | "SiteMint does not retain call audio or full transcripts. The dashboard stores only the operational call details and outcomes needed to manage the receptionist." Confirm with legal before public launch. |
| L-7 | Conversion | CHANGE · amended §15 | Before certification: primary "Request Beta Access", secondary "Explore the Interactive Preview", text "Already a client? Sign in". After certification + cost controls: primary may become "Try the AI". No unrestricted signup. **The general Start a Project journey leaves this page.** |
| L-8 | Page structure | ADD · amendment §12 | 17-section product page (cinematic hero → call theater → Try the AI → what it does → appointment/calendar journey → caller examples → owner dashboard → voice & prompt → calls/contacts/outcomes → safe failure → privacy → use cases → setup → private-beta posture → FAQ → Request Beta Access → Sign In). Structural inspiration from product-led voice sites; no copied design, wording, layout or assets. |
| L-9 | Try the AI | ADD · amendment §14 | Two modes: default zero-marginal-cost simulated Interactive Preview (curated branches, waveform, no provider call); controlled live beta demo behind explicit consent, 60–90 s cap, one session per visitor per period, concurrency + daily cost caps, abuse protection, no retained audio/transcript, metadata-only logging, auto-stop, countdown, honest fallback. Not advertised until the browser call passes end-to-end certification; cost model from real rates first. |

## 3. Signup and onboarding

| # | Decision | Recorded direction |
|---|---|---|
| S-1 | CHANGE | Page title "Set up your AI Receptionist"; invite-only mechanism; collect owner name, business name, work email, password, timezone, Terms/Privacy acknowledgement only. Industry and configuration move to onboarding. |
| S-2 | ADD · required before first customer | Forgot-password and reset UI. |
| S-3 | ADD · P0 | Persistent guided onboarding, ten steps: business information → assistant goal and role → prompt and caller handling → voice → hours and availability → appointment types → Google Calendar → browser test call → phone-number assignment → final review and activation. Saved progress, prerequisites, completion states, one next action. No automatic activation. |

## 4. Customer dashboard

| # | Decision | Recorded direction |
|---|---|---|
| D-1 | CHANGE | Overview answers: live and healthy? what happened recently? what needs attention? what next? Setup progress, receptionist status, needs-attention, recent calls, appointments, usage, one next-best action. No fake metrics in empty states. |
| D-2 | CHANGE | Navigation: Overview · Setup · Assistant (Configuration, Prompt, Voice) · Scheduling (Availability, Appointment Types, Calendar, Appointments) · Activity (Calls, Conversations, Contacts) · Channels (Phone Number, SMS, Transfers only when implemented) · Account (Usage, Billing, Settings, Support). No nested sidebar scrollbar; consistent breadcrumbs. |
| D-3 | CHANGE | SMS is a channel under Channels → SMS; working functionality preserved. |
| D-4 | CHANGE | Calls and Conversations stay separate pages under Activity. |
| D-5 | ADD · P0 | Minimal Contacts backend + frontend: name, phone, source/channel, last interaction, disposition/status, next appointment, opt-out state, linked calls and conversations. |
| D-6 | CHANGE | Keep Plan and Usage; manual invoicing in beta; hide inactive Stripe controls. |
| D-7 | CHANGE | Editable: business name, business type/industry, primary contact, timezone, default business location, account password. Team later. |
| D-8 | REMOVE from nav until functional | Tools, Voice Library, Knowledge, Analytics, Testing, Structured Outputs, Integrations, API Keys. Phone Number is required and built. Calendar lives under Scheduling. |
| D-9 | KEEP DRAWER | Mobile drawer, not bottom nav. |

## 5. Receptionist configuration

| # | Decision | Recorded direction |
|---|---|---|
| C-1 | CHANGE | One assistant per firm in beta; one status card replaces the grid/table; hide "create another" after the first. |
| C-2 | CHANGE | Fields: assistant name, role, primary goal, timezone, supported language, greeting, business context, permitted actions, escalation behaviour. Business name and industry come from Workspace Settings. |
| C-3 | CHANGE | Guided structured prompt by default (greeting, business information, questions to ask, appointment rules, allowed actions, escalation, prohibited topics, closing behaviour) with generated full-prompt preview and "How callers will hear this" preview; unrestricted editing behind Advanced. |
| C-4 | CHANGE | Two curated presets; voice samples mandatory; plain-language descriptions; provider/model detail behind Advanced. |
| C-5 | CHANGE | Show Test and Activate/Publish with prerequisite-based disabled states and explanations; "Sync" becomes "Save changes" / "Publish update". |
| C-6 | ADD | Breadcrumbs `Assistant / Ava / Prompt`. |

## 6. Booking and calendar

| # | Decision | Recorded direction |
|---|---|---|
| B-1 | CHANGE | Keep availability settings; move out of the voice-platform build flag; buffers, notice, window, blocked dates, daily limit under Advanced. |
| B-2 | KEEP | Wholesale save acceptable with clear validation/loading/success/conflict/error. |
| B-3 | ADD · P0 | Wire approve/book, reschedule, cancel, reconcile; appointment detail drawer (status history, contact, type, time, source, actions); confirmations for reschedule and cancel. |
| B-4 | ADD · P0 | Scheduling → Calendar: connect, connected account/status, last successful check, reconnect/error, disconnect, post-OAuth success handling. Not inside a generic integrations marketplace. |
| B-5 | CHANGE | Rename to "Test Booking"; preview never silently creates a request; explicit "Create test request" and the record is labelled a test. |
| B-6 | DEFER | Public scheduling link stays behind its flag; later under Scheduling → Booking Link. |

## 7. Calls, conversations, contacts

| # | Decision | Recorded direction |
|---|---|---|
| A-1 | CHANGE | "Call Logs" → "Calls"; statuses In progress · Completed · Failed · Needs attention. |
| A-2 | KEEP + CHANGE | Keep structured outcomes; explain the no-audio/no-transcript policy. |
| A-3 | KEEP | Conversations = messaging activity. |
| A-4 | ADD | Minimal Contacts per D-5. |

## 8. Usage, billing, limits

| # | Decision | Recorded direction |
|---|---|---|
| U-1 | CHANGE | Compact current-period usage indicator in the rail; voice minutes primary, SMS secondary. |
| U-2 | ADD | Usage page: calls, minutes used, included, remaining, billing period, warning threshold, cap/paused state. |
| U-3 | CHANGE | "Your receptionist is paused because the current usage limit was reached." + "Contact SiteMint to continue". No dead upgrade button. |
| U-4 | DEFER | Manual invoicing in beta; plans and public pricing after real cost data. |

## 9. Operations CRM

| # | Decision | Recorded direction |
|---|---|---|
| O-1 | CHANGE · security requirement | Password-only is preview-only. Before real customer data: persistent secure session (httpOnly cookie), proper logout, rate limiting, audit trail. No roles yet. |
| O-2 | CHANGE | Command Center: leads needing follow-up, active clients, receptionist health, today's calls/appointments, unresolved issues, usage/cost alerts, project status. No vanity KPIs. |
| O-3 | CHANGE · required | One canonical lead-status taxonomy everywhere; migrate or map legacy statuses. |
| O-4 | CHANGE | Lead detail simplified: summary + next action, contact info, stage, timeline, tasks, communications, opportunity/project. |
| O-5 | KEEP | Discovery Submissions, connected to the repaired intake. |
| O-6 | ADD · P0 | Receptionist Ops: Firms, Firm detail, activation/readiness, assigned number, calendar status, usage, limits, open issues, recent failures, safe support actions. |
| O-7 | CHANGE | Remove six dead Soon items and duplicate Lead DNA; one Command Center with Discovery as a distinct workflow. |
| O-8 | CHANGE | One primary scroll region; consistent breadcrumbs. |
| O-9 | ADD | Query-param filters + local saved views. |
| O-10 | ADD · required | Shared authenticated request helper, one 401/logout path, client-side route protection, standard loading/empty/error/denied/retry states. |

## 10. Mobile

| # | Decision | Recorded direction |
|---|---|---|
| M-1 | CHANGE | Keep the responsive foundation; apply nav and hero changes; primary CTA readable at 360 px. |
| M-2 | CHANGE | Keep the drawer; dense tables → cards/summary rows below 768 px; preserve essential actions. |
| M-3 | CHANGE | Mobile required only for essential Ops workflows (urgent issues, receptionist health, lead details, tasks, calls, appointments). |

## 11. Product-level

| # | Decision | Recorded direction |
|---|---|---|
| P-1 | NARROWER beta | Required: invitation signup; login + reset; persistent onboarding; one assistant; guided prompt; curated voices with samples; availability + types; Google Calendar; certified browser test call; number assignment; certified inbound call; full appointment lifecycle; Calls; minimal Contacts; usage/limit states; safe failure handling; Receptionist Ops visibility. Not required: public booking link, transfer, integrations marketplace, self-serve Stripe, analytics, knowledge base, API keys, multiple assistants, multi-user, retained audio/transcripts. |
| P-2 | DEFER | SMS stays a channel, not a beta dependency; human transfer post-beta and out of primary nav. |
| P-3 | APPROVE | Domain model as proposed; no DNS work during local development. |
| P-4 | AFTER BETA | No 8,400-credit film now. **Amendment §7:** a visual-development package (treatment, storyboard, references, prompts, motion, crops, poster, performance, reduced motion) is produced first; Magnific for concept frames only with authorisation. |
| P-5 | STAY `none` | Retention unchanged. |
| P-6 | MERGED | PR #30 merged 2026-09-04 at the exact reviewed identity (head `17a7056`, base `7d84bcb`, gates ✔ voice-matrix ✔) → main `57ea6c8d1902b1520fff9697379109edaaa84f04`. Nothing deployed or activated. |

## 12. Program structure (amendment §16–§18)

One integrated **SiteMint V5 Brand and Product Program** with three workstreams (A — master brand and public website; B — AI Receptionist revenue product; C — customer application and operations), led from this primary session with bounded subagents, defined file ownership, one master decision ledger (this file + `V5-BLUEPRINT.md`), and the standing engineering gates. The consolidated blueprint must be approved before broad implementation starts.
