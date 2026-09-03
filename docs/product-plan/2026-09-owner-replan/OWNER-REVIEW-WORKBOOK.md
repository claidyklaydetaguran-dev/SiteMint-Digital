# Owner Review Workbook

> Fill in one line per page: **KEEP · CHANGE · REMOVE · ADD · UNCERTAIN**, plus a note.
> Review in the order below. Preview servers run on loopback only and must be started on
> the review machine (see "How to run the preview" at the end). Mode A = the committed
> product with no backend attached; mode B = the same build with local synthetic fixtures
> labelled `OWNER PREVIEW — LOCAL SYNTHETIC DATA`. Anything marked PLANNED is not built.

Decision key: KEEP (as is) · CHANGE (note what) · REMOVE · ADD (something missing) · UNCERTAIN (ask me).

## Preview URLs (loopback)

| Mode | URL | What it is |
|---|---|---|
| A — current product | http://127.0.0.1:4173/ | company website, receptionist landing, signup, ops CRM login (no backend) |
| A — current product | http://127.0.0.1:4174/ai-receptionist/dashboard/ | customer app, canonical build (voice flags off) — shows the login wall |
| B — certified preview | http://127.0.0.1:4175/admin | ops CRM with synthetic data (any password signs in) |
| B — certified preview | http://127.0.0.1:4176/ai-receptionist/dashboard/ | customer app, voice-platform build, synthetic firm "Preview Dental Studio (synthetic)" |

State switcher (mode B only, bottom banner): `data · fresh · empty · locked · slow · error · denied`.

## 1. Company website (mode A, 4173)

| # | Page | URL | Review questions | Decision | Note |
|---|---|---|---|---|---|
| W-1 | Homepage | `/` | Does the hero say what SiteMint does in one read? Is "From first click to booked customer" the line you want? Is the five-phase field worth a film later? | | |
| W-2 | What We Build overview | `/services` | Is a separate overview page needed, or is the mega panel enough? Should section anchors exist? | | |
| W-3 | Nav: AI Receptionist appears in the panel and as a pill | header | Keep both, or one? | | |
| W-4 | Websites & Web Apps | `/websites-apps` | One page or two (websites / web applications)? | | |
| W-5 | Discovery Systems | `/discovery-systems` | Keep as a pillar? | | |
| W-6 | Workflow Automation | `/automation` | Is this "AI systems"? Should "CRM systems" be its own page? | | |
| W-7 | Work | `/work` | Copy claims discovery is delivered instantly and the receptionist books autonomously — both untrue today. Rewrite or remove? Keep the three capability compositions? | | |
| W-8 | Process | `/process` | Are the five chapters your real process? | | |
| W-9 | Company | `/about` | "answers real calls" and "is our actual intake" — rewrite until true? Team section wanted? | | |
| W-10 | Start a Project | `/start` | Right primary path? | | |
| W-11 | Discovery intake | `/discovery` | It currently saves nothing. Wire it to the backend (flag on) for launch? Keep the multi-step shape? | | |
| W-12 | Contact | `/contact` | V2 chrome. Rebuild on V4, or fold into `/start`? | | |
| W-13 | Pricing | `/pricing` | V2 page with $2,995 / $5,995 / $9,995. Retire, hide, or rebuild? | | |
| W-14 | Privacy / Terms | `/privacy` `/terms` | Send to counsel now? | | |
| W-15 | Insights | `/insights` | Keep hidden until the first article? | | |
| W-16 | 404 | `/anything` | Replace the developer placeholder? | | |
| W-17 | Mobile nav | 360 px | Group label "Company" containing Work/Process/Company — rename? | | |
| W-18 | Legacy verticals | `/ai-for-lawyers` `/ai-for-realtors` | Retire? | | |

## 2. AI Receptionist landing page (mode A, 4173)

| # | Section | Review questions | Decision | Note |
|---|---|---|---|---|
| L-1 | Hero + theater | Is "Meet the receptionist designed to help every caller reach the next right step" right? Is the simulated theater labelled clearly enough? | | |
| L-2 | Capabilities | Anything promised that is not certified? Anything certified that is missing (calendar booking is certified on the backend)? | | |
| L-3 | How it works | Right steps? | | |
| L-4 | Business outcomes | Honest without metrics? | | |
| L-5 | Pricing posture | No pricing shown. Add "from $X", "private beta — invite only", or nothing? | | |
| L-6 | Safety / privacy line | Say "no recordings or transcripts retained" explicitly? | | |
| L-7 | Conversion | "Create an account" + header "Client Sign In". Add a sign-in link in the body? Invite-only gate for beta? | | |

## 3. Customer signup and onboarding (A: 4173 signup, 4174 login; B: 4176)

| # | Screen | Review questions | Decision | Note |
|---|---|---|---|---|
| S-1 | Signup `/ai-receptionist/signup` | Title says "Create your SMS Receptionist" — rename for the voice product? Fields right? Invite code? | | |
| S-2 | Login | Add "Forgot password" (needs the reset UI)? | | |
| S-3 | Onboarding | Nothing exists; new firms land on Overview. Approve the checklist hub (business → prompt → voice → hours → types → calendar → test call → number)? Use mode B state `fresh` to see the current landing. | | |

## 4. Customer dashboard (mode B, 4176; compare mode A, 4174 login wall)

| # | Screen | State to try | Review questions | Decision | Note |
|---|---|---|---|---|---|
| D-1 | Overview | data / fresh / locked / error | Does it answer "is my receptionist healthy, what needs me"? Setup rail covers only the SMS receptionist — extend to voice/calendar/number? | | |
| D-2 | Sidebar / groups | any | Groups Overview · Build · Operate · Observe · Manage — adopt the proposed regroup (Setup · Assistant · Scheduling · Activity · Channels · Account)? Remove the nested scrollbar? | | |
| D-3 | "Current SMS Receptionist" `/receptionist` | data | Is the SMS receptionist one channel of the assistant, or a separate product in the nav? | | |
| D-4 | Conversations `/conversations` | data / empty | Keep as the SMS channel? Merge with Calls under Activity? | | |
| D-5 | Contacts `/contacts` | any | No backend exists. Minimal list for beta? | | |
| D-6 | Billing `/billing` | data / locked | Plan/usage tabs right? Manual invoicing for beta acceptable? | | |
| D-7 | Settings `/settings` | data | What should be editable (name, industry, timezone, team)? | | |
| D-8 | Coming-soon pages (Tools, Phone Numbers, Voice Library, Knowledge, Analytics, Testing, Structured Outputs, Integrations, API Keys) | data | Keep in nav as "coming later", or remove until built? | | |
| D-9 | Mobile drawer | 360 px | Drawer vs bottom nav? | | |

## 5. Receptionist configuration (mode B, 4176 → Assistants)

| # | Screen | Review questions | Decision | Note |
|---|---|---|---|---|
| C-1 | Assistants list | One assistant per firm for beta (hide "create" after one)? Grid vs table default? | | |
| C-2 | Setup tab | Fields right (name, business, role, industry, goal, timezone, language)? | | |
| C-3 | Prompt tab | Structured prompt vs free text? Add "how a caller hears this" preview? | | |
| C-4 | Voice & model tab | Two presets (natural-balanced, budget-friendly). Enough for beta? Voice samples? | | |
| C-5 | Publish / Test / Sync | Controls are absent in this build (flags off). Show them disabled with a reason instead? | | |
| C-6 | Breadcrumb | Add `Assistants / {name} / Prompt`? | | |

## 6. Booking and calendar (mode B, 4176 → Appointments)

| # | Screen | Review questions | Decision | Note |
|---|---|---|---|---|
| B-1 | Availability tab | Weekly hours, buffers, notice, window, blocked dates, daily limit — right set? Move out of the voice flag? | | |
| B-2 | Appointment types | Wholesale save acceptable? | | |
| B-3 | Requests tab | Booked rows have no action in the product. Approve the approve / reschedule / cancel controls (backend certified in M4)? Detail drawer wanted? | | |
| B-4 | Calendar connection | No connect screen exists (status line only). Approve the connect / status / disconnect screen and where it lives (Scheduling vs Integrations)? | | |
| B-5 | Booking preview tab | Note: in the real product this tab creates real pending requests. Keep it, rename it, or move it under a "Test booking" label? | | |
| B-6 | Public booking page `/schedule/{slug}` | Keep for beta (flag off today)? Show the slug in Settings? | | |

## 7. Calls, conversations, contacts (mode B, 4176)

| # | Screen | Review questions | Decision | Note |
|---|---|---|---|---|
| A-1 | Call Logs `/logs` | Rename to "Calls"? In-progress call chip right? | | |
| A-2 | Call detail | Metadata-only (policy `none`) explanation clear? Structured outcome useful? | | |
| A-3 | Conversations | see D-4 | | |
| A-4 | Contacts | see D-5 | | |

## 8. Usage, billing and limits (mode B, 4176)

| # | Item | Review questions | Decision | Note |
|---|---|---|---|---|
| U-1 | Trial meter in the rail | Keep the conversation-count meter? Add minutes? | | |
| U-2 | Usage tab | Show voice minutes + included minutes + cap state? | | |
| U-3 | Limit reached (state `locked`) | Copy and action right? | | |
| U-4 | Plan catalog | Decide plans/prices now or after beta? | | |

## 9. Operations CRM (mode B, 4175; mode A login wall on 4173/admin)

| # | Screen | Review questions | Decision | Note |
|---|---|---|---|---|
| O-1 | Login wall `/admin` | Password-only login acceptable for now? | | |
| O-2 | Command Center | Right KPIs? | | |
| O-3 | Contacts table `/admin/crm/leads` | Smart lists use legacy statuses (New/Contacted/…) — normalise to the canonical set? | | |
| O-4 | Lead detail + timeline | Keep as is? | | |
| O-5 | Discovery submissions | Keep; upstream form fix (W-11) | | |
| O-6 | Receptionist Accounts | Approve the new Receptionist Ops area (Firms · Firm detail · Usage · Issues)? | | |
| O-7 | Nav | Remove the six "Soon" items and the duplicate "Lead DNA"? Two dashboards → one? | | |
| O-8 | Breadcrumbs / scrollbars | Approve one scroll region + breadcrumbs? | | |
| O-9 | Saved views / filters | Query-param filters + local saved views for now? | | |
| O-10 | Error / denied states | Approve a shared fetch helper with one 401 path and a client-side guard? | | |

## 10. Mobile experience (360 / 768 screenshots)

| # | Surface | Review questions | Decision | Note |
|---|---|---|---|---|
| M-1 | Website | Hero at 360 readable? Sheet nav groups right? | | |
| M-2 | Dashboard | Drawer usable? Tables → cards wanted? | | |
| M-3 | CRM | Internal only — is mobile support required at all? | | |

## 11. Product-level decisions

| # | Decision | Options | Decision | Note |
|---|---|---|---|---|
| P-1 | Beta scope | as in AI-RECEPTIONIST-PRIVATE-BETA.md / narrower / wider | | |
| P-2 | SMS and human transfer | "coming later" tiles for beta / required | | |
| P-3 | Domain model | as in PRODUCT-VISION §5 / different | | |
| P-4 | Hero film | generate now (8,400 credits) / after beta / never | | |
| P-5 | Retention policy | stay `none` / decide later | | |
| P-6 | Merge PR #30 | after this review / with changes first | | |

## How to run the preview (on the review machine)

The servers are Node scripts in the session scratchpad; they serve the Linux-built dist of
`17a7056` on loopback and never call a provider or database. If they are not running, start:

```
node owner-preview.mjs <dist/wa/public> 4173 wa / current
node owner-preview.mjs <dist/hd/public> 4174 hd /ai-receptionist/dashboard current
node owner-preview.mjs <dist/wa/public> 4175 wa / certified
node owner-preview.mjs <dist/hd-voice> 4176 hd /ai-receptionist/dashboard certified
```
