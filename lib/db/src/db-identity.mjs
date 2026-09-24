// Read-only: report which database a named target actually reaches.
//
// This is the command you run FIRST. It connects, reads the server's own
// answers, and prints the identity plus the two values every mutating command
// then requires you to state back to it. It writes nothing, takes no lock, and
// prints no credential.
//
//   node ./src/db-identity.mjs --target dev
//   node ./src/db-identity.mjs --target prod
//
// Exit codes: 0 = identity reported; 2 = usage or connection error.

import { fileURLToPath } from "node:url";

import { readDatabaseIdentity, renderTargetBanner, resolveDbTarget } from "./db-target.mjs";

async function main() {
  const resolved = resolveDbTarget({ argv: process.argv.slice(2), env: process.env, requireExpectations: false });
  if (!resolved.ok) {
    console.error(`db identity — ${resolved.message}`);
    process.exit(2);
  }

  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: resolved.url });
  try {
    await client.connect();
  } catch (err) {
    console.error(`db identity — connection failed: ${err instanceof Error ? err.message : "unknown"}`);
    process.exit(2);
  }
  try {
    const identity = await readDatabaseIdentity(client);
    console.log(renderTargetBanner({ ...resolved, identity }));
    console.log("");
    console.log("Pass these back to any migrating command so it can verify the target:");
    console.log(`  --target ${resolved.name} --expect-db ${identity.database} --expect-fingerprint ${resolved.fingerprint}`);
    process.exit(0);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
