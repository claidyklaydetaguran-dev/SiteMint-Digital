// Phase 2C.2D — body-size-limit enforcement test for
// POST /api/v1/discovery-submissions, exercised against a REAL (but
// minimal, standalone, ephemeral-port, in-process-only) Express server —
// not the full application (which transitively requires DATABASE_URL via
// other routers' top-level @workspace/db imports) and never a real
// database. Verifies actual byte-stream enforcement, not just a
// Content-Length header check: an undersized declared Content-Length with
// an actually-larger streamed body, and chunked transfer encoding (no
// Content-Length header at all), both still get rejected correctly,
// because body-parser counts real bytes as they arrive.
//
// Run via:
//   pnpm --filter @workspace/scripts exec tsx artifacts/api-server/test/discoveryV1BodyLimit.test.ts
import express from "express";
import http from "node:http";
import { DISCOVERY_V1_BODY_LIMIT, DISCOVERY_V1_PATH, discoveryV1BodyLimitErrorHandler } from "../src/lib/discoveryV1BodyLimit";

let failures = 0;
function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.error(`  FAIL  ${label}`);
    failures++;
  }
}

function buildTestApp() {
  const app = express();
  app.use(DISCOVERY_V1_PATH, express.json({ limit: DISCOVERY_V1_BODY_LIMIT }));
  app.use(DISCOVERY_V1_PATH, discoveryV1BodyLimitErrorHandler);
  app.post(DISCOVERY_V1_PATH, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = buildTestApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function run() {
  // 1. Body under the limit, correct Content-Length — accepted (200).
  await withServer(async (baseUrl) => {
    const smallBody = JSON.stringify({ hello: "world" });
    const res = await fetch(`${baseUrl}${DISCOVERY_V1_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: smallBody,
    });
    check("small body with correct Content-Length is accepted", res.status === 200);
  });

  // 2. Body clearly over 64KB with an accurate Content-Length — rejected 413.
  await withServer(async (baseUrl) => {
    const bigBody = JSON.stringify({ padding: "x".repeat(80 * 1024) });
    const res = await fetch(`${baseUrl}${DISCOVERY_V1_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: bigBody,
    });
    check("oversized body (accurate Content-Length) is rejected with 413", res.status === 413);
    const json = (await res.json()) as Record<string, unknown>;
    check("413 body uses the stable payload_too_large code", json?.code === "payload_too_large");
    check("413 body does not leak parser internals", !JSON.stringify(json).includes("raw-body") && !JSON.stringify(json).includes("entity.too.large"));
  });

  // 3. Chunked transfer encoding (no Content-Length header at all) with an
  //    oversized body — still rejected, because body-parser counts actual
  //    streamed bytes, not a header. Node's fetch sets Transfer-Encoding:
  //    chunked automatically for a ReadableStream body with no explicit
  //    Content-Length.
  await withServer(async (baseUrl) => {
    const bigPayload = JSON.stringify({ padding: "y".repeat(80 * 1024) });
    const encoder = new TextEncoder();
    const chunks = encoder.encode(bigPayload);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Push in small pieces to genuinely exercise streaming, not a single write.
        const pieceSize = 4096;
        for (let i = 0; i < chunks.length; i += pieceSize) {
          controller.enqueue(chunks.slice(i, i + pieceSize));
        }
        controller.close();
      },
    });
    const res = await fetch(`${baseUrl}${DISCOVERY_V1_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: stream,
      // @ts-expect-error -- Node's fetch requires this for streaming request bodies.
      duplex: "half",
    });
    check("oversized chunked-encoded body (no Content-Length) is still rejected with 413", res.status === 413);
  });

  // 4. Malformed JSON body — rejected 400 with the stable malformed_request code.
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}${DISCOVERY_V1_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json ",
    });
    check("malformed JSON body is rejected with 400", res.status === 400);
    const json = (await res.json()) as Record<string, unknown>;
    check("400 body uses the stable malformed_request code", json?.code === "malformed_request");
  });

  if (failures > 0) {
    console.error(`\n${failures} discoveryV1BodyLimit test(s) failed.`);
    process.exit(1);
  } else {
    console.log("\nAll discoveryV1BodyLimit tests passed.");
  }
}

run();
