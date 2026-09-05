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
  /** One-sentence intro composed from the first responsibility below — no
   *  invented credentials, history, or biography. */
  intro: string;
  /** Verbatim-derived duties, owner directive 2026-09-06. */
  responsibilities: string[];
  /** "How this person supports your project" line, derived from the final
   *  responsibility. */
  support: string;
}

export const teamV5: TeamMemberV5[] = [
  {
    name: "Shasta Greene",
    role: "Head of Strategy",
    photo: "/team-shasta.jpg",
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
  },
  {
    name: "Claidy Taguran",
    role: "Technical Director",
    photo: "/team-claidy.png",
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
  },
  {
    name: "Saisa Lorraigne",
    role: "Project & Admin Manager",
    photo: "/team-saisa.jpg",
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
  },
];
