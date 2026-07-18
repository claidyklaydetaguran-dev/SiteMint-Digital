/**
 * Business-friendly voice/model presets plus advisory cost and latency
 * figures. Every number here is a planning estimate, not measured or
 * fetched data — Checkpoint B3 never calls a provider or pricing API.
 */

export type VoicePresetId =
  | "natural-balanced"
  | "fast-response"
  | "highest-intelligence"
  | "budget-friendly"
  | "custom";

export interface CostCategoryEstimate {
  label: "Model" | "Voice" | "Transcription" | "Runtime";
  /** Fraction of the total estimated range this category represents (0-1), for illustrative sizing only. */
  share: number;
}

export interface LatencyCategoryEstimate {
  label: "Transcription" | "Reasoning" | "Voice synthesis" | "Transport";
  ms: number;
}

export interface VoicePreset {
  id: VoicePresetId;
  label: string;
  friendlyDescription: string;
  /** Illustrative planning range in USD per minute — an estimate, never a fetched price. */
  costRangeLow: number;
  costRangeHigh: number;
  costBreakdown: CostCategoryEstimate[];
  /** Illustrative planning figure in milliseconds — guidance, not a measurement. */
  latencyMs: number;
  latencyBreakdown: LatencyCategoryEstimate[];
}

export const VOICE_MODEL_PRESETS: VoicePreset[] = [
  {
    id: "natural-balanced",
    label: "Natural & Balanced",
    friendlyDescription: "A conversational, well-rounded stack for most businesses.",
    costRangeLow: 0.09,
    costRangeHigh: 0.14,
    costBreakdown: [
      { label: "Model", share: 0.4 },
      { label: "Voice", share: 0.25 },
      { label: "Transcription", share: 0.2 },
      { label: "Runtime", share: 0.15 },
    ],
    latencyMs: 850,
    latencyBreakdown: [
      { label: "Transcription", ms: 180 },
      { label: "Reasoning", ms: 380 },
      { label: "Voice synthesis", ms: 210 },
      { label: "Transport", ms: 80 },
    ],
  },
  {
    id: "fast-response",
    label: "Fast Response",
    friendlyDescription: "Prioritizes snappy replies for high-volume, quick-turn calls.",
    costRangeLow: 0.07,
    costRangeHigh: 0.11,
    costBreakdown: [
      { label: "Model", share: 0.3 },
      { label: "Voice", share: 0.25 },
      { label: "Transcription", share: 0.25 },
      { label: "Runtime", share: 0.2 },
    ],
    latencyMs: 650,
    latencyBreakdown: [
      { label: "Transcription", ms: 140 },
      { label: "Reasoning", ms: 260 },
      { label: "Voice synthesis", ms: 170 },
      { label: "Transport", ms: 80 },
    ],
  },
  {
    id: "highest-intelligence",
    label: "Highest Intelligence",
    friendlyDescription: "The most capable reasoning stack for nuanced conversations.",
    costRangeLow: 0.16,
    costRangeHigh: 0.24,
    costBreakdown: [
      { label: "Model", share: 0.55 },
      { label: "Voice", share: 0.2 },
      { label: "Transcription", share: 0.15 },
      { label: "Runtime", share: 0.1 },
    ],
    latencyMs: 1100,
    latencyBreakdown: [
      { label: "Transcription", ms: 190 },
      { label: "Reasoning", ms: 570 },
      { label: "Voice synthesis", ms: 240 },
      { label: "Transport", ms: 100 },
    ],
  },
  {
    id: "budget-friendly",
    label: "Budget Friendly",
    friendlyDescription: "Keeps per-minute cost low for straightforward conversations.",
    costRangeLow: 0.04,
    costRangeHigh: 0.07,
    costBreakdown: [
      { label: "Model", share: 0.3 },
      { label: "Voice", share: 0.3 },
      { label: "Transcription", share: 0.25 },
      { label: "Runtime", share: 0.15 },
    ],
    latencyMs: 950,
    latencyBreakdown: [
      { label: "Transcription", ms: 200 },
      { label: "Reasoning", ms: 420 },
      { label: "Voice synthesis", ms: 240 },
      { label: "Transport", ms: 90 },
    ],
  },
  {
    id: "custom",
    label: "Custom",
    friendlyDescription: "Configure each layer yourself under the Advanced tab.",
    costRangeLow: 0.05,
    costRangeHigh: 0.25,
    costBreakdown: [
      { label: "Model", share: 0.4 },
      { label: "Voice", share: 0.25 },
      { label: "Transcription", share: 0.2 },
      { label: "Runtime", share: 0.15 },
    ],
    latencyMs: 900,
    latencyBreakdown: [
      { label: "Transcription", ms: 180 },
      { label: "Reasoning", ms: 400 },
      { label: "Voice synthesis", ms: 220 },
      { label: "Transport", ms: 100 },
    ],
  },
];

export function getVoicePreset(id: VoicePresetId): VoicePreset {
  return VOICE_MODEL_PRESETS.find((p) => p.id === id) ?? VOICE_MODEL_PRESETS[0];
}

export interface LatencyBand {
  label: "Excellent" | "Natural" | "Acceptable" | "May feel delayed";
  minMs: number;
  maxMs: number | null;
  tone: "success" | "info" | "warning" | "destructive";
}

/** Advisory bands only — never enforced as a hard technical restriction. */
export const LATENCY_BANDS: LatencyBand[] = [
  { label: "Excellent", minMs: 0, maxMs: 700, tone: "success" },
  { label: "Natural", minMs: 700, maxMs: 1000, tone: "info" },
  { label: "Acceptable", minMs: 1000, maxMs: 1200, tone: "warning" },
  { label: "May feel delayed", minMs: 1200, maxMs: null, tone: "destructive" },
];

export function bandForLatency(ms: number): LatencyBand {
  return (
    LATENCY_BANDS.find((b) => ms >= b.minMs && (b.maxMs === null || ms < b.maxMs)) ??
    LATENCY_BANDS[LATENCY_BANDS.length - 1]
  );
}
