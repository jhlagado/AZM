# AZM Next Code Quality Findings

**Date:** 2026-05-24 (refreshed)  
**Review type:** Findings refresh + P1 implementation  
**Scope reviewed:** `src/` (~74 TypeScript files), `test/`, quality docs under `docs/`  
**Legacy oracle:** `legacy-root-azm/` (differential / lowered-program helpers only)  
**Standards:** [`docs/reference/code-quality-standard.md`](reference/code-quality-standard.md), [`docs/next/plan.md`](next/plan.md)

**Context:** Prior refresh (2026-05-23) recorded cutover-ready behavior and architecture alignment (#134–#139). This refresh adds an explicit **P1 / P2 / P3 backlog** and implements all **P1** items on branch `code-quality/p1-shim-and-strip-comment`.

---

## Executive summary

AZM Next remains **cutover-ready**: differential parity 87/87, real-program acceptance passing, file-size enforce green, architecture map aligned. Residual debt is **transitional surface area** (public `Next` naming, legacy diagnostic re-export, oversized integration test) plus optional table splits.

**P1 work completed in this refresh:**

- Shared quote-aware `stripLineComment` in `src/source/strip-line-comment.ts` (replaces five duplicate helpers; fixes naive `;` handling outside strings).
- Removed **11** promoted re-export shims that only served legacy-oracle test helpers; helpers now import `legacy-root-azm/` directly.
- Removed dead `legacyDefaultFormatWriters` export from `src/formats/index.ts`.
- Pointed `api-tooling` legacy AST types at `legacy-root-azm` (no `src/frontend/` shim).

**Remaining promoted shims (2):** `diagnosticTypes.ts`, `diagnosticTypes` + `CompileEnv` on tooling API — tracked as **P2**.

---

## Prioritized backlog

### P1 — Must fix (maintainability / safety / correctness)

| ID | Task | Status |
|----|------|--------|
| P1-1 | Extract shared quote-aware `stripLineComment` to `src/source/`; use in compile, op-expansion, parse-line, source-host, case-style | **Done** |
| P1-2 | Add unit tests for `stripLineComment` (string literals vs trailing `;`) | **Done** |
| P1-3 | Remove dead `legacyDefaultFormatWriters` from `src/formats/index.ts` | **Done** |
| P1-4 | Redirect legacy-oracle test helpers to `legacy-root-azm/`; delete orphan promoted shims (`compile`, `pipeline`, `pathCompare`, `frontend/*`, `lowering/*`) | **Done** |
| P1-5 | Keep structured findings backlog in this doc (P1/P2/P3) | **Done** |

### P2 — Should fix soon

| ID | Task | Notes |
|----|------|-------|
| P2-1 | Remove `src/diagnosticTypes.ts` shim; export `model/diagnostic.ts` on public API | Breaking for consumers on legacy `{ id, file }` shape |
| P2-2 | Drop `CompileEnv` and legacy AST exports from `@jhlagado/azm/tooling` or provide AZM Next equivalents | `api-tooling.ts` still re-exports legacy types |
| P2-3 | Stabilize public names — `compileNext` → primary `compile` on root export; trim `Next` suffix | `index.ts` / `api-compile` already expose `compile` on `/compile` subpath |
| P2-4 | Split `test/integration/minimal-assembler.test.ts` (~2,232 lines) by topic | Matches 500-line review trigger in standard |
| P2-5 | Add focused unit tests before any family split of `z80/encode.ts`, `z80/parse-instruction.ts`, `expansion/op-expansion.ts` | Integration/differential coverage is strong today |

### P3 — Nice to have / deferred

| ID | Task | Notes |
|----|------|-------|
| P3-1 | Family-oriented Z80 encoder/parser splits | Plan defers until navigation beats lookup density |
| P3-2 | Monitor review-trigger files: `write-asm80.ts` (730), `expression-evaluation.ts` (699), `parse-expression.ts` (655), `effects.ts` (629) | Extract if any cross 750 |
| P3-3 | Optional: migrate `test/helpers` off `diagnosticTypes` shim to legacy or model types | Low drift risk while shim remains |

---

## Strengths (unchanged)

- Architecture map matches live code (`expansion/`, `semantics/`, `node/`, `cli/` populated).
- `check:source-file-sizes:enforce` passes; three allowlisted table-dense modules documented.
- Differential 87/87; tetro / pacmo / MON3 acceptance; register-care control-flow precision.
- Coordinators thin (`assemble-program.ts` 59 lines; `register-care/analyze.ts` 153 lines).

---

## Scoring (2026-05-24)

| Criterion | Score | Notes |
|-----------|-------|-------|
| Function responsibility | 4/5 | Coordinators split; shared comment helper added |
| Naming | 3/5 | Public `Next` + legacy diagnostics unchanged |
| Comments and docs | 4/5 | Plan and standard align with tree |
| File size discipline | 4/5 | Enforce green; review files stable |
| Module boundaries | 5/5 | Fewer promoted shims; helpers use explicit legacy paths |
| Duplication control | 4/5 | `stripLineComment` unified; micro duplication reduced |
| Dead code | 4/5 | 11 shims removed; 2 transitional re-exports remain |
| Algorithms and data flow | 4/5 | Clear passes |
| Tooling gates | 4/5 | CI already runs size enforce on Linux |
| Test coverage | 4/5 | + unit lane for comment stripping |
| **Overall** | **4.1/5** | Up from 4.0 after P1 shim/comment cleanup |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-05-23 | Initial findings; refresh after #134–#139 |
| 2026-05-24 | P1/P2/P3 backlog; P1 implementation (stripLineComment, shim removal, doc structure) |
