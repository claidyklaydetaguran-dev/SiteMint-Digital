/**
 * SiteMint marketing production server (release directive, 2026-09-07).
 *
 * Serves the VERIFIED, PRERENDERED web-agency dist as the public site at
 * sitemintdigital.com while leaving the existing production application
 * deployment byte-identical and reachable:
 *
 *  - static files from WA_DIST (immutable caching for hashed /assets, gzip)
 *  - prerendered route documents (/services -> services/index.html, ...)
 *  - real 404s: unknown paths serve 404.html with HTTP 404
 *  - www.sitemintdigital.com -> 301 https://sitemintdigital.com{path}
 *  - transparent reverse proxy for every non-marketing surface to the
 *    existing production deployment (UPSTREAM): /api (incl. Twilio/Stripe
 *    webhooks — bodies and headers pass through untouched; signature
 *    validation upstream uses env CRM_BASE_URL, not Host), the customer
 *    dashboard, the AI toolkit, and the internal admin SPA. Cookies are
 *    host-only on the public origin, so authenticated flows are unchanged.
 *
 * No secrets, no database, no state. Rollback = point the domain back at
 * the previous deployment; this server never modifies anything upstream.
 *
 * Usage: node marketing-server.mjs  (env: PORT, WA_DIST, UPSTREAM)
 */
import { createServer } from "node:http";
import { request as httpsRequest } from "node:https";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const WA_DIST = process.env.WA_DIST || join(here, "wa-dist");
const UPSTREAM = process.env.UPSTREAM || "sitemintdigital.replit.app";
const APEX = "https://sitemintdigital.com";

/** Path prefixes owned by the existing production application. */
const PROXY_PREFIXES = [
  "/api",
  "/ai-receptionist/dashboard",
  "/ai-toolkit",
  "/admin",
  "/app",
];

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm", ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml", ".woff2": "font/woff2", ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
};
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json", ".txt", ".xml", ".webmanifest"]);
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"]);

function proxy(req, res) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== "host") headers[k] = v;
  }
  headers["host"] = UPSTREAM;
  headers["x-forwarded-host"] = String(req.headers.host || "");
  headers["x-forwarded-proto"] = "https";
  const up = httpsRequest(
    { host: UPSTREAM, port: 443, path: req.url, method: req.method, headers },
    (upRes) => {
      const outHeaders = {};
      for (const [k, v] of Object.entries(upRes.headers)) {
        if (!HOP_BY_HOP.has(k.toLowerCase())) outHeaders[k] = v;
      }
      res.writeHead(upRes.statusCode || 502, outHeaders);
      upRes.pipe(res);
    },
  );
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end('{"error":"upstream_unavailable"}');
  });
  req.pipe(up);
}

async function serveFile(res, file, status = 200) {
  const body = await readFile(file);
  const ext = extname(file);
  const headers = {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": file.includes("assets") && status === 200
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "x-content-type-options": "nosniff",
  };
  if (COMPRESSIBLE.has(ext)) {
    headers["content-encoding"] = "gzip";
    res.writeHead(status, headers);
    res.end(gzipSync(body));
  } else {
    res.writeHead(status, headers);
    res.end(body);
  }
}

createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || "").toLowerCase();
    const url = new URL(req.url, "http://x");

    if (url.pathname === "/__health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, upstream: UPSTREAM }));
      return;
    }

    // www (and any alias host) permanently redirects to the apex.
    if (host.startsWith("www.")) {
      res.writeHead(301, { location: `${APEX}${req.url}`, "cache-control": "no-cache" });
      res.end();
      return;
    }

    if (PROXY_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
      proxy(req, res);
      return;
    }

    let path = normalize(decodeURIComponent(url.pathname)).replace(/\\/g, "/").replace(/^\/+/, "");
    if (path.includes("..")) { res.writeHead(400); res.end(); return; }

    let file = join(WA_DIST, path || "index.html");
    if (existsSync(file) && (await stat(file)).isDirectory()) file = join(file, "index.html");
    if (existsSync(file)) { await serveFile(res, file); return; }

    // File-shaped requests (an extension) missing from the marketing dist
    // fall through to the upstream app: the proxied admin/dashboard/toolkit
    // pages reference root-absolute, content-hashed files (/assets/...,
    // legacy root images) that live only in the previous deployment. Hashed
    // names cannot collide with this dist, so the fallback is unambiguous.
    if (extname(path)) { proxy(req, res); return; }

    // Prerendered route documents, then the real 404.
    const clean = path.replace(/\/+$/, "");
    const routeDoc = join(WA_DIST, clean, "index.html");
    if (clean && existsSync(routeDoc)) { await serveFile(res, routeDoc); return; }
    const nf = join(WA_DIST, "404.html");
    if (existsSync(nf)) { await serveFile(res, nf, 404); return; }
    await serveFile(res, join(WA_DIST, "index.html"));
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("server error");
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`marketing-server listening :${PORT} dist=${WA_DIST} upstream=${UPSTREAM}`);
});
