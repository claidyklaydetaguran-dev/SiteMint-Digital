/**
 * The V5 team section (W-9): the three real people named by the owner,
 * roles only, no invented biographies. Portraits are the owner-supplied
 * photographs recovered from `artifacts/web-agency/public/` (final owner
 * directive, 2026-09-05: "use only real photographs... recover the existing
 * approved team photos") — never a generated face or stock photo. Shared so
 * the homepage and About page never list different people or titles.
 * Spelling note: "Shasta Greene" per the owner's written directive (matches
 * shastagreene.com in the portfolio manifests).
 */

export interface TeamMemberV5 {
  name: string;
  role: string;
  /** Public-root path to the real, owner-supplied portrait photograph. */
  photo: string;
  /**
   * Per-person focal point for the shared 4:3 portrait viewport (owner
   * correction, 2026-09-09): Shasta's source is 4:3 landscape and fills the
   * frame exactly; Claidy's and Saisa's are 3:4 portrait sources, so
   * `object-fit: cover` shows only a horizontal band — centered, it cut
   * their heads. The focal point moves each person's crop window (never a
   * zoom, never an edit of the photograph) so the full head, hair, and
   * comfortable headroom stay visible. Consumed as `object-position`.
   */
  portraitPosition: string;
  /** One-sentence intro composed from the first responsibility below — no
   *  invented credentials, history, or biography. */
  intro: string;
  /** Verbatim-derived duties, owner directive 2026-09-06. */
  responsibilities: string[];
  /** "How this person supports your project" line, derived from the final
   *  responsibility. */
  support: string;
  /** Card sentence — owner-provided verbatim (final polish directive,
   *  2026-09-06): one strong sentence explaining what this person owns. */
  summary: string;
  /** Three concise responsibility tags — owner-provided verbatim. */
  tags: string[];
}

export const teamV5: TeamMemberV5[] = [
  {
    name: "Shasta Greene",
    role: "Head of Strategy",
    photo: "/team-shasta.jpg",
    portraitPosition: "50% 50%", /* 4:3 source == 4:3 frame; approved as-is */
    intro:
      "Shasta leads discovery and translates each client's vision into a practical business and digital strategy.",
    responsibilities: [
      "Leads discovery and translates the client's vision into a practical business and digital strategy.",
      "Identifies goals, audience, positioning, customer journey, priorities, and project scope.",
      "Connects website, systems, marketing, SEO, analytics, and conversion needs.",
      "Helps ensure the finished product supports the client's actual business objectives.",
    ],
    support:
      "Shasta helps ensure the finished product supports your business's actual objectives — not just how it looks, but what it needs to do for you.",
    summary:
      "Shapes the business strategy, client experience, project direction, and growth priorities behind every build.",
    tags: ["Discovery", "Positioning", "Growth Strategy"],
  },
  {
    name: "Claidy Taguran",
    role: "Technical Director",
    photo: "/team-claidy.png",
    portraitPosition: "50% 12%", /* 3:4 source: hold the crop window near the top — full head + headroom */
    intro:
      "Claidy leads technical planning, architecture, engineering, and implementation for every SiteMint system.",
    responsibilities: [
      "Leads technical planning, architecture, engineering, and implementation.",
      "Oversees websites, web applications, CRM systems, automation, AI, integrations, performance, quality, and technical reliability.",
      "Translates the approved strategy and design into a secure, maintainable working product.",
      "Reviews technical decisions and launch readiness.",
    ],
    support:
      "Claidy reviews technical decisions and launch readiness so your project ships secure, maintainable, and ready to run.",
    summary:
      "Leads the design and engineering that turn approved ideas into reliable digital products.",
    tags: ["Engineering", "Systems", "AI & Automation"],
  },
  {
    name: "Saisa Lorraigne",
    role: "Project & Admin Manager",
    photo: "/team-saisa.jpg",
    portraitPosition: "50% 10%", /* 3:4 source: same treatment, tuned to her framing */
    intro:
      "Saisa organizes timelines, files, requirements, deliverables, meetings, approvals, and follow-ups for every project.",
    responsibilities: [
      "Organizes timelines, files, requirements, deliverables, meetings, approvals, and follow-ups.",
      "Keeps client communication and project records organized.",
      "Helps coordinate the team so requested information, revisions, and next steps do not get lost.",
      "Supports the project from intake through completion and ongoing service.",
    ],
    support:
      "Saisa supports your project from intake through completion and ongoing service, so nothing you need gets lost along the way.",
    summary:
      "Keeps requirements, communication, timelines, approvals, and deliverables moving from intake through completion.",
    tags: ["Coordination", "Documentation", "Delivery"],
  },
];
