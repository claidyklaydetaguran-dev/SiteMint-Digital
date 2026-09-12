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
 * ── What changed in M5, and what did not ────────────────────────────────────
 *
 * The caller-facing behaviour is IDENTICAL: still `void`, still never throws,
 * still not awaited, still nothing on the request's critical path. Every
 * producer call site is unchanged.
 *
 * What changed is where the event lives between the business write and rule
 * evaluation. It used to be a promise inside the process — so a process that
 * died in that window lost the event, and, worse, nothing recorded that it had
 * been lost. The event is now a ROW first (`crm_automation_events`), and a
 * durable worker turns rows into executions with retry. A restarted process
 * finds the work still waiting instead of never knowing it existed.
 *
 * The immediate attempt below is a LATENCY optimisation, not the guarantee: it
 * is why a rule still fires within milliseconds of the business write instead of
 * within one worker tick. The guarantee is the row.
 *
 * ── The guarantee, stated honestly ──────────────────────────────────────────
 *
 * AT-LEAST-ONCE, with repeats made harmless by deduplication. NOT exactly-once:
 *
 *   - The row is written after the business write and not inside its
 *     transaction, because these producers are called once the route has
 *     already answered. A process killed between the two still loses that
 *     event. The window is now one INSERT wide rather than a whole rule
 *     evaluation wide, which is a real improvement and is not a guarantee.
 *   - Anything that IS recorded reaches rule evaluation, retried with backoff
 *     across restarts and workers, or ends up visibly `failed` in the table.
 *   - It may reach rule evaluation more than once — a reclaimed lease — and
 *     that costs nothing, because the engine's UNIQUE occurrence index refuses
 *     the second execution.
 *
 * Closing the last gap means recording the event inside the business
 * transaction, which is a change to the routes that own those writes. Until
 * then: automation is a convenience layer over the record, never the system of
 * record — do not build anything that must happen on top of it alone.
 */

import { recordAutomationEvent, processAutomationEvent } from "./automationSweep.js";
import type { CrmAutomationTriggerEvent } from "@workspace/db";
import { logger } from "./logger.js";

/**
 * Announce a business event to the automation engine. Fire and forget.
 *
 * Deliberately returns `void`, not a promise: an `await` here would put rule
 * evaluation on the request's critical path, which is exactly what this exists
 * to avoid. Tests that need to observe the effect call `recordAutomationEvent`
 * / `drainAutomationEvents` / `emitAutomationTrigger` directly.
 */
export function fireAutomation(event: CrmAutomationTriggerEvent): void {
  void (async () => {
    let eventId: number | null = null;
    try {
      const recorded = await recordAutomationEvent(event, { source: "producer" });
      if (!recorded) return;
      eventId = recorded.event.id;
    } catch (err) {
      // The recording itself failed. This is the one loss this design cannot
      // absorb, so it is logged as such rather than as "a rule misbehaved".
      logger.error(
        { err, trigger: event.trigger, recordId: event.payload.recordId },
        "automation event could NOT be recorded; this occurrence is lost. "
        + "the business write is unaffected",
      );
      return;
    }

    try {
      await processAutomationEvent(eventId);
    } catch (err) {
      // The row is safe on disk, so this is a delay and not a loss: the durable
      // worker will pick it up on its next pass.
      logger.error(
        { err, eventId, trigger: event.trigger, recordId: event.payload.recordId },
        "automation trigger failed on its immediate attempt; the event is recorded and "
        + "will be retried by the worker. the business write is unaffected",
      );
    }
  })();
}
