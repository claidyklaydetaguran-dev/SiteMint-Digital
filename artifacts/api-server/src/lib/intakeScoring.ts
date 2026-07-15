/**
 * intakeScoring.ts
 *
 * Pure, synchronous, deterministic case scoring — no LLM, no async, no DB.
 * Returns one of five tiers plus an optional disqualify reason.
 *
 * Architecture:
 *  - Law Firm industry: law-specific rules (prior attorney, practice area match,
 *    statute of limitations) layered on top of generic base.
 *  - All other industries: generic rule-based scoring using engagement level
 *    and qualifying-question answer coverage.
 *  - Adding new industry-specific rules: add a case to getIndustryRules() below.
 *
 * Scoring order for Law Firm (first matching rule wins):
 *  1. Prior attorney             → Disqualified
 *  2. Incident type outside firm → Disqualified
 *  3. Statute of limitations hit → Disqualified
 *  4. Normalized date unknown    → Needs Review
 *  5. Severe injury keywords     → Hot
 *  6. Passed all checks          → Warm
 *
 * Scoring order for generic industries (first matching rule wins):
 *  1. No info at all             → Needs Review
 *  2. Low engagement + 0 answers → Cold
 *  3. All questions answered + engaged → Hot
 *  4. Some answers or engaged    → Warm
 *  5. Fallback                   → Cold
 */

export type IntakeTier = "Hot" | "Warm" | "Cold" | "Disqualified" | "Needs Review";

export interface ScoringInput {
  priorAttorney:           boolean | null;
  incidentType:            string  | null;
  incidentDateNormalized:  string  | null;
  injurySeverity:          string  | null;
  // Generic (non-law) inputs — populated from final LLM response
  answeredQuestionsCount?: number;
  engagementLevel?:        string | null;
}

export interface ScoringFirm {
  practiceAreas:            string[];
  statuteOfLimitationsDays: number;
  industry?:                string;
  qualifyingQuestionsCount?: number;
}

export interface ScoringResult {
  tier:             IntakeTier;
  disqualifyReason?: string;
}

// ── Keywords that indicate a serious/significant injury (Law Firm) ─────────────
const HOT_KEYWORDS: string[] = [
  "broken", "fracture", "surgery", "hospital", "hospitalized",
  "concussion", "icu", "intensive care", "paralysis", "paralyzed",
  "amputat", "severe", "critical", "permanent", "disability",
  "wheelchair", "coma", "unconscious", "spinal", "head injury",
  "brain", "wrongful death",
];

// ── Industry-specific hard rules ──────────────────────────────────────────────
// Returns a disqualification result if an industry-specific hard rule fires,
// or null to fall through to generic scoring.
// Extend this function to add rules for new industries.

function getIndustryRules(
  caseData: ScoringInput,
  firm: ScoringFirm,
): ScoringResult | null {
  const industry = (firm.industry ?? "").toLowerCase();

  if (industry === "law firm" || industry === "") {
    // ── Law Firm: prior attorney ──────────────────────────────────────────────
    if (caseData.priorAttorney === true) {
      return { tier: "Disqualified", disqualifyReason: "Already has counsel" };
    }

    // ── Law Firm: incident type vs practice areas ─────────────────────────────
    if (caseData.incidentType && firm.practiceAreas.length > 0) {
      const incidentLower = caseData.incidentType.toLowerCase();
      const matchesFirm = firm.practiceAreas.some(area => {
        const areaLower = area.toLowerCase();
        return incidentLower.includes(areaLower) || areaLower.includes(incidentLower);
      });
      if (!matchesFirm) {
        return { tier: "Disqualified", disqualifyReason: "Outside firm's practice areas" };
      }
    }

    // ── Law Firm: statute of limitations ─────────────────────────────────────
    if (caseData.incidentDateNormalized) {
      const incidentDate = new Date(caseData.incidentDateNormalized);
      if (!isNaN(incidentDate.getTime())) {
        const daysSince = Math.floor((Date.now() - incidentDate.getTime()) / 86_400_000);
        if (daysSince > firm.statuteOfLimitationsDays) {
          return { tier: "Disqualified", disqualifyReason: "Outside statute of limitations window" };
        }
      }
    }
  }

  // No industry-specific hard rule fired
  return null;
}

// ── Law Firm scoring (post-hard-rules) ───────────────────────────────────────

function scoreLawFirmCase(caseData: ScoringInput): ScoringResult {
  // Normalized date unknown → flag for review (don't auto-disqualify)
  if (!caseData.incidentDateNormalized) {
    return { tier: "Needs Review" };
  }

  // Severity keyword check → Hot
  const severityLower = (caseData.injurySeverity ?? "").toLowerCase();
  if (HOT_KEYWORDS.some(kw => severityLower.includes(kw))) {
    return { tier: "Hot" };
  }

  // Passed all checks
  return { tier: "Warm" };
}

// ── Generic industry scoring ──────────────────────────────────────────────────

function scoreGenericCase(caseData: ScoringInput, firm: ScoringFirm): ScoringResult {
  const total      = firm.qualifyingQuestionsCount ?? 0;
  const answered   = caseData.answeredQuestionsCount ?? 0;
  const engagement = (caseData.engagementLevel ?? "").toLowerCase();

  // No information gathered at all → needs human review
  if (!caseData.incidentType && answered === 0) {
    return { tier: "Needs Review" };
  }

  // Actively disengaged with no answers → Cold
  if (engagement === "low" && answered === 0) {
    return { tier: "Cold" };
  }

  // All questions answered and caller engaged → Hot
  if (total > 0 && answered >= total && engagement !== "low") {
    return { tier: "Hot" };
  }

  // Some questions answered or good engagement → Warm
  if (answered > 0 || engagement === "high" || engagement === "medium") {
    return { tier: "Warm" };
  }

  // Fallback
  return { tier: "Cold" };
}

// ── Main scoring function ──────────────────────────────────────────────────────

export function scoreIntakeCase(
  caseData: ScoringInput,
  firm: ScoringFirm,
): ScoringResult {
  const industry = (firm.industry ?? "").toLowerCase();
  const isLawFirm = industry === "law firm" || industry === "";

  // Apply industry-specific hard rules first (disqualification checks)
  const industryResult = getIndustryRules(caseData, firm);
  if (industryResult) return industryResult;

  // Dispatch to industry-appropriate scoring
  if (isLawFirm) {
    return scoreLawFirmCase(caseData);
  }
  return scoreGenericCase(caseData, firm);
}
