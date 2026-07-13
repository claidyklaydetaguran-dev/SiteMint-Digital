/**
 * intakeScoring.ts
 *
 * Pure, synchronous, deterministic case scoring — no LLM, no async, no DB.
 * Returns one of five tiers plus an optional disqualify reason.
 *
 * This is a first-pass heuristic. All logic is keyword/rule-based so a
 * human reviewer can read, understand, and tune it without needing to
 * understand the rest of the codebase.
 *
 * Scoring order (first matching rule wins):
 *  1. Prior attorney             → Disqualified
 *  2. Incident type outside firm → Disqualified
 *  3. Statute of limitations hit → Disqualified
 *  4. Normalized date unknown    → Needs Review  (don't auto-disqualify on uncertainty)
 *  5. Severe injury keywords     → Hot
 *  6. Everything else that passed → Warm
 */

export type IntakeTier = "Hot" | "Warm" | "Cold" | "Disqualified" | "Needs Review";

export interface ScoringInput {
  priorAttorney:          boolean | null;
  incidentType:           string  | null;
  incidentDateNormalized: string  | null;
  injurySeverity:         string  | null;
}

export interface ScoringFirm {
  practiceAreas:            string[];
  statuteOfLimitationsDays: number;
}

export interface ScoringResult {
  tier:             IntakeTier;
  disqualifyReason?: string;
}

// ── Keywords that indicate a serious/significant injury ────────────────────────
// Add or remove terms here — each is checked as a case-insensitive substring.
const HOT_KEYWORDS: string[] = [
  "broken",
  "fracture",
  "surgery",
  "hospital",
  "hospitalized",
  "concussion",
  "icu",
  "intensive care",
  "paralysis",
  "paralyzed",
  "amputat",       // matches "amputated", "amputation"
  "severe",
  "critical",
  "permanent",
  "disability",
  "wheelchair",
  "coma",
  "unconscious",
  "spinal",
  "head injury",
  "brain",
  "wrongful death",
];

// ── Main scoring function ──────────────────────────────────────────────────────

export function scoreIntakeCase(
  caseData: ScoringInput,
  firm: ScoringFirm,
): ScoringResult {

  // ── Rule 1: Prior attorney — always disqualify ─────────────────────────────
  if (caseData.priorAttorney === true) {
    return { tier: "Disqualified", disqualifyReason: "Already has counsel" };
  }

  // ── Rule 2: Incident type vs. firm practice areas ─────────────────────────
  // Both sides lowercased; substring match in either direction is intentional
  // so "personal injury" matches "injury" and "car accident" matches "auto".
  if (caseData.incidentType) {
    const incidentLower = caseData.incidentType.toLowerCase();
    const matchesFirm = firm.practiceAreas.some(area => {
      const areaLower = area.toLowerCase();
      return incidentLower.includes(areaLower) || areaLower.includes(incidentLower);
    });
    if (!matchesFirm) {
      return {
        tier:             "Disqualified",
        disqualifyReason: "Outside firm's practice areas",
      };
    }
  }

  // ── Rule 3: Statute of limitations ────────────────────────────────────────
  if (caseData.incidentDateNormalized) {
    const incidentDate = new Date(caseData.incidentDateNormalized);
    if (!isNaN(incidentDate.getTime())) {
      const daysSince = Math.floor(
        (Date.now() - incidentDate.getTime()) / 86_400_000,
      );
      if (daysSince > firm.statuteOfLimitationsDays) {
        return {
          tier:             "Disqualified",
          disqualifyReason: "Outside statute of limitations window",
        };
      }
    }
  }

  // ── Rule 4: Normalized date unknown → flag for human review ───────────────
  // We do not auto-disqualify on missing/uncertain date data.
  if (!caseData.incidentDateNormalized) {
    return { tier: "Needs Review" };
  }

  // ── Rule 5: Severity keyword check ────────────────────────────────────────
  const severityLower = (caseData.injurySeverity ?? "").toLowerCase();
  const isHot = HOT_KEYWORDS.some(kw => severityLower.includes(kw));
  if (isHot) {
    return { tier: "Hot" };
  }

  // ── Rule 6: Passed all checks but no severe injury keywords ───────────────
  return { tier: "Warm" };
}
