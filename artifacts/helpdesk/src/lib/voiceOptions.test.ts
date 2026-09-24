/**
 * Voice choices in the dashboard: which voice callers hear, and whether a
 * saved choice can be published in this environment.
 *
 * Run via: pnpm --filter @workspace/scripts run test
 */

import { effectiveVoiceKey, parseVoiceOptions, unavailableChoice } from "./voiceOptions.js";

let failed = 0;
function check(name: string, ok: boolean): void {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const options = parseVoiceOptions({
  available: true,
  styles: [{ key: "natural-balanced", label: "Balanced", description: "d", voiceKey: "aria" }],
  voices: [
    { key: "aria", label: "Aria", description: "d" },
    { key: "brook", label: "Brook", description: "d" },
  ],
  defaultStyle: "natural-balanced",
  defaultVoice: "aria",
});

check("parses styles, voices and defaults", options.styles.length === 1 && options.voices.length === 2 && options.defaultVoice === "aria");
check("a style's own voice is kept", options.styles[0]!.voiceKey === "aria");
check("a malformed response is an error, not an empty list", (() => {
  try {
    parseVoiceOptions({ styles: "nope" });
    return false;
  } catch {
    return true;
  }
})());

check("with no explicit voice, callers hear the style's voice", effectiveVoiceKey(options, "natural-balanced", null) === "aria");
check("an explicit voice wins", effectiveVoiceKey(options, "natural-balanced", "brook") === "brook");
check("an unknown style has no known voice", effectiveVoiceKey(options, "highest-intelligence", null) === null);

check("the reported failure is caught before publishing: an unoffered style", unavailableChoice(options, "highest-intelligence", null) === "style");
check("a withdrawn voice is caught", unavailableChoice(options, "natural-balanced", "zed") === "voice");
check("an offered style and voice pass", unavailableChoice(options, "natural-balanced", "brook") === null);
check("an offered style with no explicit voice passes", unavailableChoice(options, "natural-balanced", null) === null);

console.log(failed === 0 ? "\nAll voiceOptions tests passed." : `\nvoiceOptions: ${failed} check(s) FAILED.`);
if (failed > 0) process.exit(1);
