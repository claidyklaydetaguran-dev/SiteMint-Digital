---
name: Orval codegen Node.js 24 js-yaml patch
description: orval@8.9.1 fails on Node.js 24 with ESM/CJS interop error for js-yaml; requires one-line patch to the bundled config file.
---

## The problem

Running `pnpm --filter @workspace/api-spec run codegen` fails on Node.js 24 with:

```
SyntaxError: The requested module 'js-yaml' does not provide an export named 'default'
```

The bundled orval config file (`node_modules/.pnpm/orval@8.9.1_*/node_modules/orval/dist/config-DHMhmS0P.mjs`) uses `import yaml from "js-yaml"` which breaks under Node.js 24's stricter ESM/CJS named-export interop.

**Why:** Node.js 24 tightened how `import X from "cjs-module"` resolves for modules that use `module.exports` without an explicit `default` export key.

## The fix

Patch the bundled file using `sed`:

```bash
sed -i 's/^import yaml from "js-yaml";$/import { createRequire as _createRequire } from "node:module";\nconst yaml = _createRequire(import.meta.url)("js-yaml");/' \
  node_modules/.pnpm/orval@8.9.1_prettier@3.8.3_typescript@5.9.3/node_modules/orval/dist/config-DHMhmS0P.mjs
```

After the patch, run codegen normally:

```bash
cd lib/api-spec && node_modules/.bin/orval --config ./orval.config.ts
pnpm -w run typecheck:libs
```

**How to apply:** The patch must be re-applied whenever `pnpm install` is run (it overwrites node_modules). Consider a `postinstall` script or `.npmrc` patch approach to automate it.

**Scope:** Only affects the local dev environment; production builds use the pre-generated output files in `lib/api-client-react/src/generated/` and `lib/api-zod/src/generated/` which are committed to the repo.
