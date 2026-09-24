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
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { brotliCompress, constants as zlibConstants, gzip } from "node:zlib";
import { createHash, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const WA_DIST = process.env.WA_DIST || join(here, "wa-dist");
const UPSTREAM = process.env.UPSTREAM || "sitemintdigital.replit.app";
const APEX = "https://sitemintdigital.com";

/**
 * Surfaces that must never appear in search results.
 *
 * These are proxied from the previous deployment, which serves
 * `<meta name="robots" content="index, follow">` in its own HTML — measured
 * on production 2026-09-10 at /admin and /admin/crm/dashboard. That directly
 * contradicts robots.txt's `Disallow: /admin`. The upstream application is
 * out of scope for this release, but the edge is not, so the directive is
 * applied here.
 *
 * This is a search-visibility control, NOT an access control: authentication
 * is what protects the CRM and the customer dashboard, and it is unchanged.
 *
 * `/ai-toolkit` is deliberately absent — it is a public product microsite.
 */
const PRIVATE_PREFIXES = ["/admin", "/ai-receptionist/dashboard", "/app", "/portal", "/ai-receptionist/signup", "/thank-you"];
const isPrivateSurface = (pathname) =>
  PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));

/**
 * The only hostnames that are public addresses of this site. Anything else —
 * a Replit dev/preview URL, *.replit.app, an IP, a smoke-test on localhost —
 * is a copy, and a copy must not compete with the apex in search once
 * indexing is switched on.
 */
const CANONICAL_HOSTS = new Set(["sitemintdigital.com", "www.sitemintdigital.com"]);

/** Path prefixes owned by the existing production application. */
const PROXY_PREFIXES = [
  "/api",
  "/ai-receptionist/dashboard",
  "/ai-toolkit",
  "/admin",
  "/app",
  // The CRM customer portal (/portal/sign-in, /portal/accept, ...) is served
  // by the same upstream application as /admin. Without this prefix every
  // portal invitation link lands on the marketing 404.
  "/portal",
];

// Valid-but-not-prerendered SPA prefixes (written by prerender.mjs): these
// serve the SPA document with 200 — a legitimate route (receptionist
// signup, thank-you, admin) must never land on the prerendered 404.
let SPA_PREFIXES = [];
try {
  SPA_PREFIXES = JSON.parse(await readFile(join(WA_DIST, "spa-fallback.json"), "utf8")).spaPrefixes || [];
} catch {}

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

// `htmlIsMiss`: the upstream SPA answers unknown paths with its index.html
// (200); for a file-shaped fallback that means "no such file", so it becomes
// this site's real 404 rather than a stale HTML document under a .js/.map URL.
/**
 * Visitor identity for the upstream limiters (launch follow-up, 2026-09-24).
 * Behind this proxy every visitor reaches the API from this server's egress
 * address, so per-address limits collapsed into one shared bucket. The
 * address this server's own edge observed sits PLATFORM_HOPS entries from the
 * right of X-Forwarded-For: the Replit ingress writes three platform
 * addresses after the visitor (`<visitor>, <platform>, <platform>, <platform>`,
 * measured live 2026-09-24 from the chain the API logs on a tripped
 * honeypot), so the rightmost entries vary per request and anything left of
 * the visitor was written by the visitor and is forgeable. `PROXY_PLATFORM_HOPS`
 * (0–10) overrides the measured default of 3 if the platform topology
 * changes. A chain too short to contain the platform entries did not come
 * through the ingress, so the socket address is used. It is forwarded as
 * `x-sitemint-visitor` with an
 * HMAC-SHA256 signature over `PROXY_VISITOR_SECRET`; the API only honours a
 * valid signature, and any client-supplied copy of these headers is dropped
 * here first. Without the secret nothing is added and behaviour is unchanged.
 */
const VISITOR_SECRET = process.env.PROXY_VISITOR_SECRET || "";
const PLATFORM_HOPS = (() => {
  const raw = process.env.PROXY_PLATFORM_HOPS;
  if (raw === undefined || raw === "") return 3;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 10 ? n : 3;
})();
function observedVisitor(req) {
  const raw = req.headers["x-forwarded-for"];
  const chain = String(Array.isArray(raw) ? raw.join(",") : raw || "").split(",").map((s) => s.trim()).filter(Boolean);
  const idx = chain.length - 1 - PLATFORM_HOPS;
  return idx >= 0 ? chain[idx] : (req.socket.remoteAddress || "");
}

function proxy(req, res, { htmlIsMiss = false } = {}) {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const key = k.toLowerCase();
    if (HOP_BY_HOP.has(key) || key === "host" || key === "x-sitemint-visitor" || key === "x-sitemint-visitor-sig") continue;
    headers[k] = v;
  }
  headers["host"] = UPSTREAM;
  headers["x-forwarded-host"] = String(req.headers.host || "");
  headers["x-forwarded-proto"] = "https";
  if (VISITOR_SECRET) {
    const visitor = observedVisitor(req).slice(0, 64);
    if (visitor) {
      headers["x-sitemint-visitor"] = visitor;
      headers["x-sitemint-visitor-sig"] = createHmac("sha256", VISITOR_SECRET).update(visitor).digest("hex");
    }
  }
  const up = httpsRequest(
    { host: UPSTREAM, port: 443, path: req.url, method: req.method, headers },
    (upRes) => {
      if (htmlIsMiss && /text\/html/i.test(String(upRes.headers["content-type"] || ""))) {
        upRes.resume();
        serveNotFound(res, req).catch(() => { if (!res.headersSent) res.writeHead(404); res.end(); });
        return;
      }
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

/**
 * In-memory file cache (launch audit, 2026-09-24).
 *
 * The dist is immutable for the life of the process (a publish restarts it),
 * so every file is read, hashed and compressed exactly once, off the event
 * loop, instead of being re-read and gzipped synchronously on every request
 * (the 2026-09-07 server blocked the loop for each 400 KB chunk and measured
 * ~1.1 s document TTFB in Lighthouse). Entries hold the identity body plus
 * gzip and brotli variants for compressible types; the response picks the
 * best encoding the client accepts and carries `Vary` and a strong ETag so
 * revalidation of `no-cache` documents answers 304 without a body.
 *
 * Bounded: files above CACHE_MAX_BYTES are served from disk each time and
 * never retained (only the largest brand films exceed the limit today).
 */
const CACHE_MAX_BYTES = 8 * 1024 * 1024;
const cache = new Map(); // file -> Promise<entry>

function loadEntry(file) {
  let pending = cache.get(file);
  if (pending) return pending;
  pending = (async () => {
    const body = await readFile(file);
    const ext = extname(file);
    const entry = {
      body,
      ext,
      etag: `"${createHash("sha256").update(body).digest("base64url").slice(0, 27)}"`,
      gzip: null,
      br: null,
    };
    if (COMPRESSIBLE.has(ext) && body.length > 512) {
      const [gz, br] = await Promise.all([
        gzipAsync(body, { level: 9 }),
        brotliAsync(body, {
          params: {
            [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
            [zlibConstants.BROTLI_PARAM_SIZE_HINT]: body.length,
          },
        }),
      ]);
      // Only keep a variant that actually helps.
      if (gz.length < body.length) entry.gzip = gz;
      if (br.length < body.length) entry.br = br;
    }
    if (body.length > CACHE_MAX_BYTES) cache.delete(file);
    return entry;
  })();
  cache.set(file, pending);
  pending.catch(() => cache.delete(file));
  return pending;
}

/** Pre-warm every compressible file so the first visitor after a restart
 *  never pays the compression cost. Runs after listen(); failures are
 *  logged and ignored (the request path compresses lazily anyway). */
async function warmCache(dir) {
  let count = 0;
  const walk = async (d) => {
    for (const name of await readdir(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) await walk(p);
      else if (COMPRESSIBLE.has(extname(p))) { await loadEntry(p); count++; }
    }
  };
  try {
    await walk(dir);
    console.log(`marketing-server warmed ${count} compressible files`);
  } catch (e) {
    console.warn(`marketing-server warm-up skipped: ${String(e && e.message || e)}`);
  }
}

/** Client-preferred encoding among the variants this entry actually has. */
function chooseEncoding(acceptEncoding, entry) {
  const accepted = String(acceptEncoding || "")
    .split(",")
    .map((token) => token.trim().split(";")[0].toLowerCase())
    .filter(Boolean);
  if (entry.br && accepted.includes("br")) return "br";
  if (entry.gzip && (accepted.includes("gzip") || accepted.includes("*"))) return "gzip";
  return null;
}

async function serveFile(res, file, status = 200, rangeHeader, req) {
  const entry = await loadEntry(file);
  const { body, ext } = entry;
  const headers = {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": file.includes("assets") && status === 200
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    // Baseline browser hardening for the marketing origin. The proxied
    // application surfaces set their own headers upstream and are untouched.
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "SAMEORIGIN",
    "permissions-policy": "camera=(), geolocation=(), payment=(), usb=()",
  };
  if (status === 200) {
    headers["etag"] = entry.etag;
    if (req && req.headers["if-none-match"] === entry.etag) {
      if (COMPRESSIBLE.has(ext)) headers["vary"] = "Accept-Encoding";
      res.writeHead(304, headers);
      res.end();
      return;
    }
  }
  // Single-range byte serving. Safari (desktop and iOS) probes media with a
  // Range request and refuses playback when the server answers with a full
  // 200 — which is what shipped on 2026-09-07 and kept the brand films from
  // ever starting there. Ranges are served identity-encoded (never gzip).
  if (rangeHeader && status === 200) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(rangeHeader).trim());
    if (m && (m[1] !== "" || m[2] !== "")) {
      const size = body.length;
      let start, end;
      if (m[1] === "") {
        start = Math.max(0, size - Number(m[2]));
        end = size - 1;
      } else {
        start = Number(m[1]);
        end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
      }
      if (start >= size || start > end) {
        res.writeHead(416, { ...headers, "content-range": `bytes */${size}` });
        res.end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": end - start + 1,
      });
      res.end(body.subarray(start, end + 1));
      return;
    }
  }
  if (COMPRESSIBLE.has(ext)) {
    headers["vary"] = "Accept-Encoding";
    const encoding = chooseEncoding(req && req.headers["accept-encoding"], entry);
    const payload = encoding === "br" ? entry.br : encoding === "gzip" ? entry.gzip : body;
    if (encoding) headers["content-encoding"] = encoding;
    headers["content-length"] = payload.length;
    res.writeHead(status, headers);
    res.end(req && req.method === "HEAD" ? undefined : payload);
  } else {
    headers["content-length"] = body.length;
    res.writeHead(status, headers);
    res.end(req && req.method === "HEAD" ? undefined : body);
  }
}

async function serveNotFound(res, req) {
  const nf = join(WA_DIST, "404.html");
  if (existsSync(nf)) { await serveFile(res, nf, 404, undefined, req); return; }
  await serveFile(res, join(WA_DIST, "index.html"), 200, undefined, req);
}

createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || "").toLowerCase();
    const url = new URL(req.url, "http://x");

    // Applied before every response path (static, prerendered, proxied, 404)
    // so no surface can miss it. Set via setHeader so it survives the
    // writeHead calls further down.
    if (isPrivateSurface(url.pathname) || !CANONICAL_HOSTS.has(host.split(":")[0])) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

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
    if (existsSync(file)) { await serveFile(res, file, 200, req.headers.range, req); return; }

    // File-shaped requests (an extension) missing from the marketing dist
    // fall through to the upstream app: the proxied admin/dashboard/toolkit
    // pages reference root-absolute, content-hashed files (/assets/...,
    // legacy root images) that live only in the previous deployment. Hashed
    // names cannot collide with this dist, so the fallback is unambiguous.
    if (extname(path)) { proxy(req, res, { htmlIsMiss: true }); return; }

    // Prerendered route documents, then SPA prefixes, then the real 404.
    const clean = path.replace(/\/+$/, "");
    const routeDoc = join(WA_DIST, clean, "index.html");
    if (clean && existsSync(routeDoc)) { await serveFile(res, routeDoc, 200, undefined, req); return; }
    if (SPA_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(p + "/"))) {
      await serveFile(res, join(WA_DIST, "index.html"), 200, undefined, req);
      return;
    }
    await serveNotFound(res, req);
  } catch (e) {
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
    res.end("server error");
  }
}).listen(PORT, "0.0.0.0", () => {
  console.log(`marketing-server listening :${PORT} dist=${WA_DIST} upstream=${UPSTREAM}`);
  // Off the request path: the port is already open, so a health probe or a
  // first visitor is never delayed by warm-up.
  void warmCache(WA_DIST);
});
