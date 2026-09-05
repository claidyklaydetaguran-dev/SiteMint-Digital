/**
 * The V5 team section (W-9): the three real people named by the owner
 * (2026-09-05), roles only, no invented biographies. No portrait photographs
 * exist yet, so `HomeV5`/`AboutV3` render a CSS-only initials monogram in a
 * fixed-aspect slot sized to accept a real photograph later — never a
 * generated face or stock photo. Shared so the homepage and About page never
 * list different people or titles.
 */

export interface TeamMemberV5 {
  name: string;
  role: string;
}

export const teamV5: TeamMemberV5[] = [
  { name: "Shasta Green", role: "Head of Strategy" },
  { name: "Claidy Taguran", role: "Technical Director" },
  { name: "Saisa Lorraigne", role: "Project & Admin Manager" },
];
