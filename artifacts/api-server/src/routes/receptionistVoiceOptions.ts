// What a business may choose for its assistant's voice, and a real sample of
// each voice.
//
// Both answers come from the server runtime catalog — the same catalog publish
// and sync resolve through — so a choice offered here is a choice that can be
// published. Nothing here accepts a provider identifier, a URL or free text
// from the browser: a sample is requested by catalog key only.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import { loadRuntimeCatalogFromEnv } from "../lib/voicePublishing/runtimeCatalog.js";
import { SlidingWindowLimiter } from "../lib/contactProtection.js";

const router = Router();

/**
 * Response styles. These are performance presets — how quickly and how
 * carefully the assistant answers — not voices. Only presets present in the
 * environment's catalog are ever offered.
 */
export const RESPONSE_STYLE_COPY: Record<string, { label: string; description: string }> = {
  "natural-balanced": {
    label: "Balanced",
    description: "Natural pace with careful answers. Recommended for most businesses.",
  },
  "fast-response": {
    label: "Quick replies",
    description: "Answers a little faster, for short, high-volume calls.",
  },
  "highest-intelligence": {
    label: "Most thorough",
    description: "Takes a moment longer on detailed questions.",
  },
  "budget-friendly": {
    label: "Economical",
    description: "Lower running cost for simple calls.",
  },
};

const DEFAULT_RESPONSE_STYLE = "natural-balanced";

// Samples are cached server-side, but each request still costs a little; a
// business auditioning voices needs a few dozen plays, not thousands.
const sampleLimiter = new SlidingWindowLimiter(120, 60 * 60 * 1000);
setInterval(() => sampleLimiter.purgeStale(), 5 * 60 * 1000).unref();

router.get("/receptionist/voice/options", requireReceptionistAuth, (req: Request, res: Response) => {
  let catalog;
  try {
    catalog = loadRuntimeCatalogFromEnv();
  } catch {
    res.status(503).json({ error: "Voice choices are not available right now.", available: false });
    return;
  }
  // Which curated voice a style already speaks with, so a draft that never
  // chose a voice still shows the voice callers will actually hear.
  const sameVoice = (a: { provider: string; voiceId: string }, b: { provider: string; voiceId: string }) =>
    a.provider === b.provider && a.voiceId.toLowerCase() === b.voiceId.toLowerCase();
  const styles = Object.entries(catalog.presets)
    .filter(([key]) => RESPONSE_STYLE_COPY[key] !== undefined)
    .map(([key, preset]) => ({
      key,
      ...RESPONSE_STYLE_COPY[key]!,
      voiceKey: Object.entries(catalog.voices).find(([, o]) => sameVoice(o.voice, preset.voice))?.[0] ?? null,
    }));
  const voices = Object.entries(catalog.voices).map(([key, option]) => ({
    key,
    label: option.label,
    description: option.description,
  }));
  const defaultStyle = styles.some((s) => s.key === DEFAULT_RESPONSE_STYLE)
    ? DEFAULT_RESPONSE_STYLE
    : (styles[0]?.key ?? null);
  res.json({
    available: styles.length > 0,
    styles,
    voices,
    defaultStyle,
    defaultVoice: voices[0]?.key ?? null,
  });
});

router.get("/receptionist/voice/voices/:key/sample", requireReceptionistAuth, async (req: Request, res: Response) => {
  const key = String(req.params.key ?? "");
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(key)) {
    res.status(404).json({ error: "That voice is not available." });
    return;
  }
  const bucket = `firm:${req.firmId}`;
  if (sampleLimiter.isOverLimit(bucket)) {
    res.status(429).json({ error: "Too many previews. Try again in a few minutes." });
    return;
  }
  sampleLimiter.record(bucket);

  let catalog;
  try {
    catalog = loadRuntimeCatalogFromEnv();
  } catch {
    res.status(503).json({ error: "Voice samples are not available right now." });
    return;
  }
  const option = catalog.voices[key];
  if (!option) {
    res.status(404).json({ error: "That voice is not available." });
    return;
  }

  try {
    const { createProductionVoiceProvider } = await import("../lib/voicePublishing/providerFactory.js");
    const provider = createProductionVoiceProvider();
    const audio = provider.getVoiceSample ? await provider.getVoiceSample(option.voice) : undefined;
    if (!audio) {
      res.status(404).json({ error: "This voice has no sample yet." });
      return;
    }
    res.setHeader("Content-Type", audio.contentType);
    res.setHeader("Content-Length", String(audio.bytes.length));
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).end(audio.bytes);
  } catch (err) {
    req.log.warn(
      { firmId: req.firmId, voiceKey: key, errorClass: err instanceof Error ? err.constructor.name : typeof err },
      "[voice options] sample unavailable",
    );
    res.status(503).json({ error: "The sample couldn't be loaded. Try again shortly." });
  }
});

export default router;
