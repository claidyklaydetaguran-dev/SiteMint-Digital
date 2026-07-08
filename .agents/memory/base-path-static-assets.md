---
name: Static assets under BASE_PATH artifacts
description: Why absolute-root image/asset src paths silently fail once an artifact is served under a non-root previewPath, and the fix.
---

In this monorepo, each artifact is served under a `BASE_PATH` (e.g. `/ai-toolkit/`) rather than at the domain root. An `<img src="/foo.png">` resolves relative to the domain root, not the artifact's base path, so it 404s (or hits a different artifact's route) once deployed behind the shared proxy — even though it works when Vite happens to serve the artifact at `/` in isolation.

**Why:** Design subagents and hand-written pages often default to root-absolute paths for files in `public/`, which is the normal Vite convention but breaks under this repo's path-based multi-artifact routing.

**How to apply:** Always reference `public/` assets as `${import.meta.env.BASE_URL}foo.png` (or a relative path) instead of `/foo.png` in any artifact page. Check this specifically when reviewing design-subagent output that references files in `public/`.
