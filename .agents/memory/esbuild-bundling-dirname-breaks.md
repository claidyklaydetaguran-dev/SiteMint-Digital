---
name: esbuild bundling breaks __dirname-relative asset loading
description: A dependency that resolves files via path.resolve(__dirname, ...) at runtime (e.g. SQL/config files shipped alongside its JS) breaks silently when esbuild bundles it into the app's single output file.
---

If an npm package loads adjacent non-JS assets (migration `.sql` files, templates, etc.) via `__dirname`-relative paths, bundling that package into the app's esbuild output (`bundle: true`, not in `external`) breaks it in production while working fine in dev.

**Why:** esbuild's CJS/ESM shim banners override `globalThis.__dirname` to point at the *app's own* dist directory, not the original package's directory inside `node_modules`. The package's relative path then resolves to a nonexistent folder in the app bundle. Dev environments that run TS directly (no bundling) don't hit this, so the bug only appears after deploying/publishing — a classic "works in dev, silently broken in prod" gap.

**Symptom pattern:** production-only failure where the dependency's own initialization throws (e.g. "relation does not exist" because a migration runner couldn't find its SQL files), while the exact same code path works in dev. Health checks may fail repeatedly and the platform may kill/restart the container, which can look like a flaky infra issue but is actually deterministic.

**How to apply:** if a dependency ships its own migrations/assets next to its compiled JS (check its `package.json` `files`/`build` script for `cp -r ... dist/`), add it to the esbuild `external` array instead of letting it get bundled. This keeps it as a real `node_modules` import at runtime so its own `__dirname` resolution stays correct. Example culprit: `stripe-replit-sync`'s `runMigrations()`.
