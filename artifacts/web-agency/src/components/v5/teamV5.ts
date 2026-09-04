/**
 * The V5 team section (W-9): roles only, no invented biographies, portraits
 * only if approved image assets exist (none do yet — see `HomeV5`/`AboutV3`
 * for the labelled placeholder treatment). Shared so the homepage and About
 * page never list different people or titles.
 */

export interface TeamMemberV5 {
  name: string;
  role: string;
}

export const teamV5: TeamMemberV5[] = [
  { name: "Shasta Greene", role: "Head of Strategy" },
  { name: "Claidy Taguran", role: "Technical Director" },
  { name: "Saisa Lorraigne", role: "Project & Admin Manager" },
];
