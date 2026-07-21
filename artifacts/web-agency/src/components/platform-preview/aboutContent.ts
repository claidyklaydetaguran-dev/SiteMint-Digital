/**
 * Real, approved team/values content — re-expressed here in the preview's
 * data-file convention from production `src/pages/About.tsx`'s existing
 * `team`/`values` arrays, not fabricated for this page. Photo paths point
 * at the same already-approved assets already served from `public/`.
 */

export interface AboutTeamMember {
  name: string;
  title: string;
  photo: string;
  description: string;
}

export const aboutTeam: AboutTeamMember[] = [
  {
    name: "Claidy Taguran",
    title: "Technical Director",
    photo: "/team-claidy.png",
    description:
      "Leads technical strategy, website development, application development, CRM systems, AI integrations, database architecture, and deployment. Oversees the technical quality of every SiteMint project from planning to launch.",
  },
  {
    name: "Shasta Greene",
    title: "Head of Strategy",
    photo: "/team-shasta.jpg",
    description:
      "Leads business strategy, client growth planning, digital positioning, website messaging, CRM workflow strategy, and automation planning. Helps clients turn their website into a real business growth system.",
  },
  {
    name: "Saisa Lorraigne",
    title: "Project and Admin Manager",
    photo: "/team-saisa.jpg",
    description:
      "Manages project coordination, client communication, onboarding, timelines, documentation, quality control, and administrative operations to keep every project organized and moving forward.",
  },
];

export interface AboutValue {
  title: string;
  description: string;
}

export const aboutValues: AboutValue[] = [
  {
    title: "Trustworthy",
    description: "We do what we say, on the timeline we set, with clear communication along the way.",
  },
  {
    title: "Connected by design",
    description: "We build websites, products, and systems to work together — not as separate, disconnected pieces.",
  },
  {
    title: "Honest about readiness",
    description: "We label what's available, what's in development, and what's a planned direction — never the reverse.",
  },
];
