// R6 — the process's explicit boot state.
//
// Before this, `index.ts` awaited `runStripeMigrations()` and only then called
// `app.listen()`. Nothing was bound to the port during migrations, so the
// platform health probe had no upstream at all and its proxy answered 500 —
// the restart loop seen in the staging deployment logs.
//
// Binding the port first fixes the probe but opens a worse hole: the app would
// be accepting real traffic before its migrations had run. So the port and the
// application become available at different moments, and this is the flag that
// separates them.

export type BootState = "starting" | "ready" | "failed";

let state: BootState = "starting";

export function getBootState(): BootState {
  return state;
}

export function setBootState(next: BootState): void {
  state = next;
}

/** Test-only: restore the initial state between cases. */
export function resetBootStateForTests(): void {
  state = "starting";
}
