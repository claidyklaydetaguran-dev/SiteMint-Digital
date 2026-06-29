---
name: DISC ranked-array crash
description: Root cause and fix for "Cannot read properties of undefined (reading 'bgColor')" crash in CrmLeadDetail when DISC profile is displayed.
---

## The rule
Never use `Object.keys(normalized)` to build the `ranked` array in `computeDiscProfile`. Always use an explicit capitalized list.

**Why:** `Object.keys({ driver, expressive, amiable, analytical })` returns lowercase strings. TypeScript's `as DiscStyle[]` cast is a lie — at runtime the values are `"driver"` not `"Driver"`. Then `DISC_META["driver"]` returns `undefined`, and `DISC_META["driver"].bgColor` crashes instantly. All downstream UI that renders `DISC_META[discProfile.primaryStyle]` will throw.

**How to apply:** In `discEngine.ts` `computeDiscProfile`, the fixed line is:
```ts
const ranked: DiscStyle[] = (["Driver", "Expressive", "Amiable", "Analytical"] as const)
  .slice()
  .sort((a, b) => normalized[b.toLowerCase() as keyof DiscNormalized] - normalized[a.toLowerCase() as keyof DiscNormalized]);
```

The `.toLowerCase()` in the sort comparator is still correct — it maps `"Driver"` → `"driver"` to index into `normalized` which uses lowercase keys. The sorted array itself stays capitalized.

## Defensive guard
In `CrmLeadDetail.tsx`, all `DISC_META[r.style]` accesses on `discProfile.reasons` should use optional chaining (`?.`) as defense-in-depth, since `r.style` is typed but could theoretically hold a stale value.
