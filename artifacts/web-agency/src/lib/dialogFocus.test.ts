/**
 * The focus walk, tested against a fake tree.
 *
 * `pickReturnFocus` is written against an environment interface precisely so
 * this can run in the package's node-only vitest setup: the cases that matter
 * are about which node is chosen, not about how the DOM reports it.
 */
import { describe, expect, it } from "vitest";
import {
  POINTER_ORIGIN_TTL_MS,
  pickOpener,
  pickReturnFocus,
  type FocusEnvironment,
} from "./dialogFocus.js";

interface FakeNode {
  name: string;
  connected: boolean;
  focusable: boolean;
  contains: FakeNode[];
}

const node = (name: string, options: Partial<Omit<FakeNode, "name">> = {}): FakeNode => ({
  name,
  connected: options.connected ?? true,
  focusable: options.focusable ?? true,
  contains: options.contains ?? [],
});

const environment: FocusEnvironment<FakeNode> = {
  isConnected: (n) => n.connected,
  canFocus: (n) => n.connected && n.focusable,
  firstFocusableWithin: (n) => n.contains.find((child) => child.connected && child.focusable) ?? null,
};

describe("pickReturnFocus", () => {
  it("returns focus to the control that opened the dialog", () => {
    const opener = node("delete-button");
    const row = node("row", { contains: [opener] });
    expect(pickReturnFocus({ opener, ancestors: [row] }, environment)).toBe(opener);
  });

  it("falls back to the nearest surviving ancestor when the opener was deleted", () => {
    // Confirming deleted the row the button lived in — the usual case.
    const opener = node("delete-button", { connected: false });
    const row = node("row", { connected: false });
    const nextRowButton = node("next-row-button");
    const list = node("list", { contains: [nextRowButton] });
    expect(pickReturnFocus({ opener, ancestors: [row, list] }, environment)).toBe(nextRowButton);
  });

  it("skips an ancestor that has nothing focusable left in it", () => {
    const opener = node("revoke", { connected: false });
    const emptyRow = node("row", { contains: [] });
    const closeButton = node("close");
    const panel = node("panel", { contains: [closeButton] });
    expect(pickReturnFocus({ opener, ancestors: [emptyRow, panel] }, environment)).toBe(closeButton);
  });

  it("treats a still-present but unfocusable opener as gone", () => {
    // A button left disabled by the page after the action would swallow focus.
    const opener = node("run-now", { focusable: false });
    const replacement = node("refresh");
    const toolbar = node("toolbar", { contains: [replacement] });
    expect(pickReturnFocus({ opener, ancestors: [toolbar] }, environment)).toBe(replacement);
  });

  it("returns null rather than moving focus somewhere arbitrary", () => {
    const opener = node("gone", { connected: false });
    const ancestor = node("also-gone", { connected: false });
    expect(pickReturnFocus({ opener, ancestors: [ancestor] }, environment)).toBeNull();
  });
});

describe("pickOpener", () => {
  const body = node("body");
  const button = node("button");
  const isConnected = (n: FakeNode) => n.connected;

  it("uses the focused element when there is one", () => {
    expect(pickOpener({ active: button, body, pointer: null, now: 1000, isConnected })).toBe(button);
  });

  it("uses the last pointer press when nothing is focused (Safari clicks buttons without focusing them)", () => {
    expect(
      pickOpener({ active: body, body, pointer: { element: button, at: 900 }, now: 1000, isConnected }),
    ).toBe(button);
  });

  it("ignores a stale pointer press", () => {
    expect(
      pickOpener({
        active: body,
        body,
        pointer: { element: button, at: 0 },
        now: POINTER_ORIGIN_TTL_MS + 1,
        isConnected,
      }),
    ).toBeNull();
  });

  it("ignores a pointer press on something that has since been removed", () => {
    const removed = node("removed", { connected: false });
    expect(
      pickOpener({ active: null, body, pointer: { element: removed, at: 900 }, now: 1000, isConnected }),
    ).toBeNull();
  });
});
