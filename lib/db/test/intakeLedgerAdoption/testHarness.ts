// Checkpoint A3 — shared minimal assertion harness, matching the
// PASS/FAIL-to-stdout convention used by the other lib/db/test/*.test.ts
// files (no test framework dependency added).
let failures = 0;

export function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

export async function expectRejection(
  label: string,
  reason: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    check(`${label} (expected rejection with reason '${reason}')`, false);
  } catch (err) {
    const actualReason = (err as { reason?: string } | undefined)?.reason;
    check(`${label} (rejected with reason '${reason}', got '${actualReason}')`, actualReason === reason);
  }
}

export function finish(): void {
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}
