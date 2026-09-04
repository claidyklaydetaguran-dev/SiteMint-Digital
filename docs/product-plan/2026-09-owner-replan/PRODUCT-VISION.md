# SiteMint — Product Vision (reconciled 2026-09-04)

> Reconciled to the owner's final decisions and the Brand/Homepage/AI Receptionist amendment.
> Superseded statements from the 2026-09-03 draft are marked. Owner decisions live in
> OWNER-REVIEW-WORKBOOK.md; the executable plan is V5-BLUEPRINT.md.

## 1. What SiteMint is

SiteMint Digital builds connected digital systems for service businesses: websites, web
applications, CRM and internal business systems, AI systems and automation, custom software
engineering, connected workflows, and ongoing improvement using AI-assisted development.
It also sells one product of its own, the **SiteMint AI Receptionist** — the highest-priority
revenue product, but one part of the broader SiteMint system, never the whole identity.

Three surfaces, one codebase:

| Surface | Audience | Job |
|---|---|---|
| Company website | prospects for agency work | explain everything SiteMint builds on the homepage alone, prove it honestly, start a project |
| AI Receptionist application | invited business customers | set up, run and monitor the receptionist |
| Operations CRM | SiteMint staff | run the agency pipeline and support every receptionist customer |

## 2. Brand (amended)

**SUPERSEDED (2026-09-03):** "ink navy, warm porcelain, mint, controlled electric cyan" with
navy-led surfaces. **NOW:** a mint-centred identity — aqua-mint between green and blue as the
lead colour, light-forward surfaces, deep teal for text, ink reserved for contrast and selected
dramatic moments. Feeling: fresh, intelligent, premium, creative, calm, welcoming, technically
sophisticated, unisex, recognisably SiteMint. Palette, tokens and contrast evidence:
V5-BLUEPRINT §1–2. "Signal" is an internal codename and leaves public copy.

Design consistency with page individuality: one token set, type system, spacing, buttons,
focus, radii, shadows, icons, motion and accessibility everywhere — but every major page has
one distinctive interaction signature (V5-BLUEPRINT §5) rather than repeated cards.

## 3. The revenue priority

The AI Receptionist private beta (invite-only) is the immediate launch target. The website
carries a strong product spotlight and a dedicated, product-only landing page; the CRM gains
Receptionist Ops. Company positioning never reads "SiteMint is an AI receptionist company".

## 4. Product principles

1. Honest by construction — no invented clients, metrics, testimonials, "24/7" or "every call"; capabilities labelled Available now · Private beta · In development · Planned.
2. Safe by default — exact-`"true"` flags, `VOICE_ARTIFACT_POLICY=none`, intake SMS number never near Vapi, staging paused until activation is authorised.
3. One product story per surface; the user always knows which surface and page they are on, and routes open at the top.
4. Contract-pinned frontend; protected backend files untouched; migrations versioned and additive.
5. Certify, then expose — backend milestones (M2–M4, AR-002B) are proven before their UI ships; the browser call and inbound call are certified before any "Try the AI" or "live" wording.

## 5. Recommended domain model (approved P-3, not implemented)

`sitemintdigital.com` (company) · `/ai-receptionist` (canonical product page) ·
`ai-receptionist.sitemintdigital.com` (optional redirect only) · `app.sitemintdigital.com`
(customer app) · `ops.sitemintdigital.com` (Operations CRM) · `api.sitemintdigital.com` (API).
No DNS or domain work during local development.

## 6. Milestones

- **Blueprint approved** — V5-BLUEPRINT.md accepted by the owner.
- **Program executing** — the three workstreams run as one program with preview checkpoints.
- **Invite-only private beta live** — AI-RECEPTIONIST-PRIVATE-BETA.md "required" column green on a deployed origin with one real firm.
- **Public launch** — PUBLIC-LAUNCH-CHECKLIST.md closed, legal approved, domains cut over.
