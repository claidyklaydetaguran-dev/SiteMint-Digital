# P1 — Foundation integration, CI, and governance

Phase 1 of the backend execution program (see the Backend Master Audit,
2026-08-30). Objective: one canonical, machine-guarded mainline so every later
phase inherits enforced gates.

## Scope

1. Merge PR #3 into `feature/ai-receptionist-visible-progress` (merge commit).
2. Consolidation PR `feature/ai-receptionist-visible-progress → main`; merge.
3. `phase/p1-ci`: GitHub Actions workflow running, on every PR and push to
   main: frozen install → typecheck → aggregate suite → disposable-database
   journal proofs → api-server build → disabled helpdesk build →
   built-output boundary scan → secret scan → whitespace check; plus the
   20-variant voice build-boundary matrix as a second required job.
4. Branch protection on `main`: PR required, both CI jobs required,
   force-push and deletion blocked.
5. Separate documentation-only PR fixing verified doc drift.

Out of scope: any staging/provider/deployment change; any feature code.

## Threat model

| Threat | Mitigation |
| --- | --- |
| Unreviewed push to main bypassing all gates (audit risk R1) | Branch protection: PR + required checks + no force-push/deletion |
| CI supply chain | Only first-party `actions/*` + `pnpm/action-setup`; `--frozen-lockfile`; `permissions: contents: read`; no repository secrets consumed |
| Credential committed to the public repo | Dependency-free secret scan, narrow high-signal rules, exact-path allowlist (each entry justified in-file); new hits fail CI |
| Disabled client build silently regaining provider capability | Built-output scan of the actual disabled artifact + strict 20-variant matrix, both required |
| Journal/migration regression | `test:journals` (58 disposable-database checks) runs on a throwaway Postgres service every PR |
| Windows/Linux toolchain drift | Runner pins Node 24.x + pnpm 10.26.1, mirroring the Linux QA candidate |

## Gates & evidence

- Consolidation merge forecast: `merge-tree` clean; result tree byte-identical
  to `ec5f28d5^{tree}` (`51e67c4e…`), on which the full Linux suite ran green
  (AR-001AL) — 21/21 vitest files (590 tests), 2,051 contract assertions,
  9/9 legacy files, journal proofs 58/58.
- CI must reproduce that suite on the runner before this phase's PR merges.

## Exit criteria

- `main` protected; both CI jobs green and required; protection JSON captured.
- No staging, provider, secret, flag, or deployment change (none occurs in
  this phase by construction).

## Rollback

Workflow and scripts are additive files — revert the PR. Protection is a
repository setting, reversible in one API call. Merges are history-preserving
merge commits; no rewrite is ever performed.
