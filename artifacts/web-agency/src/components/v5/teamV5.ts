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
}

export const teamV5: TeamMemberV5[] = [
  { name: "Shasta Greene", role: "Head of Strategy", photo: "/team-shasta.jpg" },
  { name: "Claidy Taguran", role: "Technical Director", photo: "/team-claidy.png" },
  { name: "Saisa Lorraigne", role: "Project & Admin Manager", photo: "/team-saisa.jpg" },
];
