/**
 * The safe way for a business route to announce that something happened.
 *
 * `emitAutomationTrigger()` reads rules, evaluates brakes and writes execution
 * rows. Calling it inline from a route would mean that a fault in somebody's
 * automation rule — a bad condition, a lock timeout, a missing record — could
 * fail the request that merely *caused* the event. Closing a deal must not 500
 * because an unrelated rule misbehaved.
 *
 * So every producer goes through `fireAutomation()`, which:
 *   - never throws, and never rejects;
 *   - runs after the caller's response has already been decided;
 *   - logs a failure rather than surfacing it to the person clicking the button.
 *
 * This is the same shape as `linkToConversation()` in `phone.ts`: an enrichment
 * that must never be able to break the thing it enriches.
 *
 * The trade-off is stated rather than hidden: a trigger emitted this way is
 * best-effort. If the process dies between the business write and the emit, the
 * rule does not run for that occurrence. The dedup key means a later retry of
 * the same occurrence is safe, but nothing retries automatically. Automation is
 * therefore a convenience layer over the record, never the system of record —
 * do not build anything that must happen on top of it alone.
 */

import { emitAutomationTrigger } from "./automationEngine.js";
import type { CrmAutomationTriggerEvent } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Announce a business event to the automation engine. Fire and forget.
 *
 * Deliberately returns `void`, not a promise: an `await` here would put rule
 * evaluation on the request's critical path, which is exactly what this exists
 * to avoid. Tests that need to observe the effect call `emitAutomationTrigger`
 * directly.
 */
export function fireAutomation(event: CrmAutomationTriggerEvent): void {
  void (async () => {
    try {
      await emitAutomationTrigger(event);
    } catch (err) {
      logger.error(
        { err, trigger: event.trigger, recordId: event.payload.recordId },
        "automation trigger failed; the business write is unaffected",
      );
    }
  })();
}
