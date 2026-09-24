/**
 * Frontend V2 Phase 7 — the authenticated navigation model, as pure data.
 *
 * `lib/nav.ts` holds the approved navigation architecture (Checkpoint B1) and
 * is **not** changed here. This module only decides what the shell renders
 * from it, so that the visible destination set can be asserted in a test
 * without a renderer.
 *
 * The selection rule is carried over from the previous `AppShell` unchanged:
 * an item appears when it is `live` and either not voice-gated or the voice
 * flag is on. Nothing else is shown. In particular this shell **adds no
 * navigation entry for an unbuilt capability** — a nav row that leads nowhere
 * is a dead link, and the readiness of in-development and planned work is
 * stated on the overview instead, where it can be labelled honestly.
 *
 * No imports beyond the nav model itself, so a `tsx` test can load it directly.
 */

import { NAV_GROUPS, type NavGroup, type NavItem } from "../../lib/nav.js";

export interface VisibleNavGroup {
  key: string;
  label: string;
  /** The first group holds a single "Overview" item; a heading above it would
   *  repeat the item's own name, so it is labelled for assistive technology
   *  only. Every other group keeps its visible heading. */
  showLabel: boolean;
  items: NavItem[];
}

/**
 * The navigation the shell renders, in approved order.
 *
 * @param voiceEnabled the `voicePlatformEnabled` build flag, passed in rather
 *        than imported so the selection can be exercised for both values.
 */
export function visibleNavGroups(
  voiceEnabled: boolean,
  groups: NavGroup[] = NAV_GROUPS,
): VisibleNavGroup[] {
  const out: VisibleNavGroup[] = [];
  for (const group of groups) {
    const items = group.items.filter(
      (item) => item.state === "live" && (!item.voiceGated || voiceEnabled) && Boolean(item.href),
    );
    if (items.length === 0) continue;
    out.push({
      key: group.key,
      label: group.label,
      showLabel: out.length > 0,
      items,
    });
  }
  return out;
}

/** Every destination the shell will link to, flattened. */
export function visibleNavDestinations(voiceEnabled: boolean, groups: NavGroup[] = NAV_GROUPS): string[] {
  return visibleNavGroups(voiceEnabled, groups).flatMap((g) => g.items.map((i) => i.href!));
}

/**
 * Whether a nav item is the current page.
 *
 * Identical to `isNavItemActive` in `lib/nav.ts` — the overview (`/`) matches
 * only itself, every other item matches its own subtree — and delegated to it
 * so the two can never drift.
 */
export { isNavItemActive } from "../../lib/nav.js";
export type { NavItem, NavGroup } from "../../lib/nav.js";
