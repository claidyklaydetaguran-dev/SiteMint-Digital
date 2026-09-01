# V4 Signal — Consolidated Owner Decision List

Nothing below proceeds without an explicit owner decision. Approving D1 approves the direction;
D2–D9 can be decided independently.

| # | Decision | Recommendation | Consequence of "no" |
|---|---|---|---|
| D1 | **Adopt the SiteMint Signal direction** (palette, typography, editorial-chapter layout, signal identity) as the V4 system for the full rebuild | Approve after reviewing the prototype's 7 surfaces | Iterate direction in this branch; no rebuild starts |
| D2 | **Hero storyboard** (04-HERO-STORYBOARD) — approve scenes, copy direction, and production prompt | Approve storyboard; then approve K1–K3 stills before the master render | Corporate Signal Loop stays as fallback; hero ships with the CSS/SVG signal field only |
| D3 | **Magnific budget** ~19,500 credits (11k minimum path) for keyframes + master + retake + mobile | Approve ceiling; per-step gates remain | No video generation |
| D4 | **Navigation IA**: four-pillar "What We Build" mega panel + AI Receptionist as separate product entry; logo-as-home | Approve | Keep V3 nav labels, restyle only |
| D5 | **Typography licensing/choice**: Space Grotesk + DM Sans + JetBrains Mono + Newsreader italic (all Google Fonts, free) | Approve | Fall back to single-family (Plus Jakarta Sans) at the cost of distinctiveness |
| D6 | **Warm accent usage**: amber reserved for human-attention (alerts, missed-call storytelling); CTAs stay cyan family | Approve | Alternative: amber CTAs (higher pop, less signal-coherence) |
| D7 | **GSAP**: not added; framer-motion + native APIs carry the motion grammar. Revisit only if production hero scrub fails 60fps on mid-tier mobile; requires measured bundle report | Keep GSAP out | — |
| D8 | **Demo theater**: ship simulated adapter publicly (clearly labeled) while live-call backend contract goes through its own PRD | Approve simulation-first | AI Receptionist hero ships without theater until live path exists |
| D9 | **Proof honesty**: Work/case-study sections launch with explicit "in progress" states; no placeholder logos/metrics | Approve | Delay Work page entirely until first case study |
| D10 | **Rebuild scope order** (post-approval): homepage → AI Receptionist page → What We Build + pillars → intake → dashboard shell → remaining app screens → ops skin | Approve sequence | Owner reorders |

Blocked by design-phase rules (no action taken, listed for transparency): no PR/merge/deploy, no
Vapi/provider/config changes, no paid video generation, no live voice demo.
