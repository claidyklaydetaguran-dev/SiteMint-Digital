# Content Specification — Frontend V2

## 1. Voice

Plain, concrete, owner-facing. Short sentences. Name the work and the outcome.
No hype adjectives, no "revolutionary", no "AI-powered synergy". A small-business
owner should understand every sentence on first read.

## 2. Homepage — hero (fixed copy)

**Headline**
> Digital systems built to turn attention into customers.

**Supporting**
> SiteMint designs websites, apps, CRM workflows, and AI receptionists that work
> together—so your business can respond faster, follow up better, and grow
> without adding more busywork.

**Primary CTA:** Start Your Project → `/discovery` (via the centralised route
helper — never a hand-written path)
**Secondary CTA:** View Our Work → `/work`

These two CTA labels are fixed by owner decision. *Start Your Project* is the
primary CTA on every public page; *View Our Work* is the homepage secondary.
**"Book a Call" is not used.**

### Hero visual

A **real HTML/CSS product-system composition** showing Website → CRM →
Automation → AI Receptionist as connected nodes with labelled edges. Rendered
with semantic markup and CSS; readable without JavaScript; static after one
entrance.

**Forbidden:** fake laptop/tablet/phone imagery, AI-generated interface text,
looping hero video, WebGL, 3D, continuously floating cards, generic robot,
human in a headset, neon circuitry.

## 3. Homepage sections

| # | Section | Purpose | Content |
|---|---|---|---|
| 3 | Connected-system statement | The thesis | One sentence: the tools are one system, not six disconnected tools. |
| 4 | Business outcomes | What changes | 3–4 outcomes: respond faster · stop losing leads to follow-up gaps · see what's working · reduce busywork. Outcomes, not features. |
| 5 | What SiteMint builds | Scope | Four cards: Websites & Apps · CRM & Automation · AI Receptionist · Integrations. Each links to its Solutions page. |
| 6 | Interactive system workflow | Show the mechanism | A single inquiry moving through Website → AI Receptionist → CRM → Follow-up. **Animates only on deliberate interaction or once during hero entrance, then static.** |
| 7 | AI Receptionist feature | Cross-sell | Short block + link to `/ai-receptionist`. |
| 8 | Selected work | Credibility | Real projects only. **No invented metrics.** If outcomes are unverified, show scope and role, not results. |
| 9 | SiteMint process | Reduce risk | 4 steps: Discover → Design → Build → Operate. Links to `/process`. |
| 10 | Team | Trust | Real people, real roles, real photos. |
| 11 | FAQ | Objections | 6–8 real questions: timeline, cost basis, ownership, what happens after launch, whether existing tools can be kept, what SiteMint needs from the owner. |
| 12 | Final project CTA | Convert | Restates *Start Your Project*. |

## 4. AI Receptionist landing (fixed copy)

The previously proposed call-only headline (*"Every call answered. Every lead
followed up."*) is **withdrawn** — it implied a production voice capability that
does not exist. Replaced by owner decision with:

**Headline**
> Every lead deserves a timely response.

**Supporting**
> SiteMint's AI Receptionist helps businesses respond to inquiries, qualify
> leads, organize conversations, and keep opportunities from being forgotten.
> SMS is available now, with voice and deeper CRM connections being developed.

**Primary CTA:** Create Your Receptionist → `/ai-receptionist/signup`
**Secondary CTA:** See How It Works → `#how-it-works`

No "24/7", no "every call", and no response-time figure appears in this copy.

### 4.1 Readiness labelling (binding)

| Capability | Public status |
|---|---|
| **SMS Receptionist** | **Available now** |
| **Voice experience** | **In development** |
| **Connected CRM and automated follow-up** | **Planned direction** |

The page may demonstrate the future connected product vision, but **every future
capability must carry a visible *in development* or *planned* label** adjacent to
it — not in a footnote.

### 4.2 Five core jobs — verification-gated

The labels below are the approved vocabulary. **None may be presented as a
shipped capability until it is individually verified against repository code**,
and each must be rendered with the readiness tier it actually belongs to. Any
job that cannot be substantiated ships labelled *in development* or is omitted.

| Job | Plain description | Ships as "available now" only if |
|---|---|---|
| **Answer** | Replies to inbound contact. | verified for the SMS pipeline |
| **Qualify** | Asks the questions your business needs answered. | qualification logic verified in code |
| **Schedule** | Moves a qualified conversation toward a booking. | scheduling verified end-to-end |
| **Record** | Logs the conversation so nothing is lost. | conversation persistence verified |
| **Escalate** | Hands off to a human when it should. | escalation path verified in code |

"Replies in seconds" and "day or night" are removed from the *Answer*
description — both are unverified performance/availability claims.

### Remaining sections

3. **Visual call workflow** — inbound → answer → qualify → schedule/escalate →
   record. Static diagram; steps advance only on interaction.
4. **Human-control explanation** — what the AI never decides alone; how to review,
   correct, and take over. This section is a requirement, not a nicety.
5. **Business use cases** — real-estate, law, home services, med spa, restaurant,
   retail, described as *scenarios*, not as customers. No industry count claim
   ("built for 6+ industries") — that is an invented figure.
6. **Integration explanation** — **only integrations verified in the repository
   may be named.** Every unverified named integration is removed. If no
   integration is verified, this section describes the approach without naming
   products.
7. **Setup process** — honest steps and honest effort. **No delivery timeline**
   ("setup in under two weeks" and any equivalent) appears anywhere.
8. **FAQ**
9. **Signup CTA**

## 5. Signup copy

**Step 1 — Your account:** "Start with your details. Nothing is submitted until
you review on the next step."
**Step 2 — Your business:** "Tell us about the business your receptionist will
answer for."
**Submit:** "Create account"
**Submitting:** "Creating your account…"

Errors:
- Duplicate email → "An account already exists for that email. Sign in instead."
  with a link to login.
- Rate limit → "Too many signup attempts from this network. Try again in an
  hour."
- Network → "We couldn't reach the server. Your details are still here — try
  again."

Password requirements are shown **before** submission: "At least 8 characters."

## 6. Dashboard copy

Operational and terse. Labels: *Overview, Calls, Leads, Appointments,
Receptionist, Knowledge, Integrations, Settings*.

Empty states name the cause and the fix — e.g. Calls empty: "No calls yet. Once
your receptionist number is connected, conversations appear here." plus a link to
Integrations.

Error states: what failed, what it means, one retry action. Never a bare
"Something went wrong."

## 7. Not-found and error pages

`/404` — "That page doesn't exist." with links Home / Solutions / Contact.
Route error boundary — "This section failed to load." with Retry and Home. Both
are designed pages, never a blank screen.

## 8. Prohibited content (repeat of the binding rule)

No fake awards · no fake customer logos · no fabricated testimonials · no
invented revenue numbers · no fake live-user counters · no meaningless statistics
· no auto-playing carousel · no infinite logo marquee · no generic blog · no
pricing table before approved scope and prices · **no video of any kind** · **no
generated (Magnific or otherwise) imagery in Phase 1** · no image added merely to
fill space · no unverified named integration · no delivery-timeline claim · no
availability claim ("24/7", "always on") for a capability not in production.

## 9. Removed claims — settled, not pending

Owner decision 1 **removes** the following from the V2 interface and content
specification. They are not held for approval, not shown with a disclaimer, and
not replaced by a differently-worded number. The sections that hosted them ship
**without numbers**, using qualitative statements the business can stand behind.

| Removed claim | Where it appeared | Disposition |
|---|---|---|
| Inbound-call "unanswered" percentage | AI Receptionist landing stat band | **Removed** |
| Average AI SMS response time | AI Receptionist landing stat band | **Removed** |
| Typical value of one qualified lead | AI Receptionist landing stat band | **Removed** |
| Industry-count and setup-duration strip | AI Receptionist landing | **Removed** |
| Every unverified named integration | AI Receptionist landing | **Removed** |
| The `$500` / `$99` figures in `LandingReceptionist` | AI Receptionist landing pricing block | **Removed** — no pricing before approved scope and prices |

**The rule, not the list:** any invented statistic, result, availability claim,
customer count, performance claim, or delivery timeline is removed, including
ones not enumerated above. A number ships only when repository code or
owner-supplied evidence substantiates it, and it carries its real basis.

Animated counters are prohibited outright — they render misleading intermediate
values (`0%+`, `<0 sec`, `$0+`) and there are no approved statistics left to
count toward.
