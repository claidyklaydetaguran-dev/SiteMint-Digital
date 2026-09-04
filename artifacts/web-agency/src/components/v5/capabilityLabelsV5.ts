/**
 * V5 honest-capability labels (W-7): every product or composition shown on
 * the public site is labelled with exactly one of these four states so
 * visual polish never implies more is live than actually is. Distinct from
 * the older V2 `capabilityStatus.ts` labels (which this program is retiring)
 * — these are the four the owner approved for V5 (workbook W-7).
 */

export type CapabilityLevelV5 =
  | "available"
  | "private-beta"
  | "in-development"
  | "planned";

export const capabilityLabelsV5: Record<CapabilityLevelV5, string> = {
  available: "Available now",
  "private-beta": "Private beta",
  "in-development": "In development",
  planned: "Planned",
};
