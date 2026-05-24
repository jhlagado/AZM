# AZM Next Code Quality Findings

**Date:** 2026-05-24 (refreshed)  
**Review type:** Findings refresh + P1/P2/P3 implementation  
**Scope reviewed:** `src/` (~74 TypeScript files), `test/`, quality docs under `docs/`  
**Legacy oracle:** `legacy-root-azm/` (differential / lowered-program helpers only)  
**Standards:** [`docs/reference/code-quality-standard.md`](reference/code-quality-standard.md), [`docs/next/plan.md`](next/plan.md)

**Context:** Prior refresh (2026-05-23) recorded cutover-ready behavior and architecture alignment (#134–#139). P1 landed in #140. P2 and P3 backlog items completed or explicitly deferred in this refresh.

---

## Executive summary

AZM Next remains **cutover-ready**: differential parity 87/87, real-program acceptance passing, file-size enforce green, architecture map aligned. Transitional debt from P1 (diagnostic shim, legacy tooling AST re-exports, oversized integration test, public `Next` naming) is **resolved or documented**.

**P2 work completed in this refresh:**

- Unified public diagnostics on `src/model/diagnostic.ts`; removed `src/diagnosticTypes.ts` legacy shim.
- Dropped legacy `CompileEnv` and AST node exports from `@jhlagado/azm/tooling`; package smoke now type-checks Next tooling types (`LoadedProgram`, `AnalyzeProgramResult`, etc.).
- Stabilized public names: `compileSource`, `compileArtifacts`, `formatDiagnostic`, and compile-subpath type aliases are primary exports; `*Next` names retained as deprecated aliases.
- Split `test/integration/minimal-assembler.test.ts` (2,232 lines) into seven topic-focused files (largest: 751 lines).
- Added `test/unit/expansion/op-expansion.test.ts` before any op-expansion family split.

**P3 disposition:**

- **Deferred:** family-oriented Z80 encoder/parser splits (`encode.ts`, `parse-instruction.ts`) — allowlisted ceilings stable; lookup density still beats navigation benefit.
- **Monitored:** review-trigger files documented below; none crossed 750-line soft limit.
- **Done:** test diagnostic helpers migrated to `model/diagnostic` (`code` / `sourceName` shape).

**Remaining promoted shims (0):** none.

---

## Prioritized backlog

### P1 — Must fix (maintainability / safety / correctness)

| ID | Task | Status |
|----|------|--------|
| P1-1 | Extract shared quote-aware `stripLineComment` to `src/source/`; use in compile, op-expansion, parse-line, source-host, case-style | **Done** (#140) |
| P1-2 | Add unit tests for `stripLineComment` (string literals vs trailing `;`) | **Done** (#140) |
| P1-3 | Remove dead `legacyDefaultFormatWriters` from `src/formats/index.ts` | **Done** (#140) |
| P1-4 | Redirect legacy-oracle test helpers to `legacy-root-azm/`; delete orphan promoted shims | **Done** (#140) |
| P1-5 | Keep structured findings backlog in this doc (P1/P2/P3) | **Done** |

### P2 — Should fix soon

| ID | Task | Status |
|----|------|-------|
| P2-1 | Remove `src/diagnosticTypes.ts` shim; export `model/diagnostic.ts` on public API | **Done** |
| P2-2 | Drop `CompileEnv` and legacy AST exports from `@jhlagado/azm/tooling` | **Done** — Next `LoadedProgram` / `AnalyzeProgramResult` are the tooling contract |
| P2-3 | Stabilize public names — trim `Next` suffix with compat aliases | **Done** — `compileSource`, `compileArtifacts`, `formatDiagnostic` primary; `*Next` deprecated |
| P2-4 | Split `test/integration/minimal-assembler.test.ts` (~2,232 lines) by topic | **Done** — 7 files; largest 751 lines |
| P2-5 | Add focused unit tests before Z80/op-expansion family splits | **Done** — `test/unit/expansion/op-expansion.test.ts`; existing `test/unit/z80/parser-encoder.test.ts` covers encoder/parser |

### P3 — Nice to have / deferred

| ID | Task | Status |
|----|------|-------|
| P3-1 | Family-oriented Z80 encoder/parser splits | **Deferred** — allowlisted hard-cap files stable; split when navigation beats lookup density |
| P3-2 | Monitor review-trigger files (>500 lines) | **Monitored** — see table below; none exceed 750 soft limit |
| P3-3 | Migrate `test/helpers` off `diagnosticTypes` shim | **Done** (with P2-1) — legacy-oracle helpers still use `legacy-root-azm` types intentionally |

#### P3-2 review-trigger inventory (2026-05-24)

| File | Lines | Action |
|------|------:|--------|
| `src/outputs/write-asm80.ts` | 730 | Monitor — extract if >750 |
| `src/semantics/expression-evaluation.ts` | 699 | Monitor |
| `src/syntax/parse-expression.ts` | 655 | Monitor |
| `src/z80/effects.ts` | 629 | Monitor |
| `src/z80/encode.ts` | 1209 | Allowlisted hard cap — split deferred (P3-1) |
| `src/z80/parse-instruction.ts` | 1268 | Allowlisted hard cap — split deferred (P3-1) |
| `src/expansion/op-expansion.ts` | 1212 | Allowlisted hard cap — split deferred (P3-1) |

---

## Strengths (unchanged)

- Architecture map matches live code (`expansion/`, `semantics/`, `node/`, `cli/` populated).
- `check:source-file-sizes:enforce` passes; three allowlisted table-dense modules documented.
- Differential 87/87; tetro / pacmo / MON3 acceptance; register-care control-flow precision.
- Coordinators thin (`assemble-program.ts` 59 lines; `register-care/analyze.ts` 153 lines).

---

## Scoring (2026-05-24, post-P2/P3)

| Criterion | Score | Notes |
|-----------|-------|-------|
| Function responsibility | 4/5 | Coordinators split; shared comment helper added |
| Naming | 4/5 | Stable public names primary; `*Next` deprecated aliases remain |
| Comments and docs | 4/5 | Plan and standard align with tree |
| File size discipline | 4/5 | Enforce green; integration test split; review files stable |
| Module boundaries | 5/5 | No promoted shims; tooling API uses Next types |
| Duplication control | 4/5 | `stripLineComment` unified |
| Dead code | 5/5 | Transitional re-exports removed |
| Algorithms and data flow | 4/5 | Clear passes |
| Tooling gates | 4/5 | CI runs size enforce on Linux |
| Test coverage | 4/5 | Op-expansion unit lane added |
| **Overall** | **4.3/5** | Up from 4.1 after P2/P3 cleanup |

---

## Fallow audit (2026-05-24)

**Commands run:** `fallow:dead-code`, `fallow:dupes`, `fallow:health`, `fallow:audit`, `fallow` (umbrella).

### Baseline counts (main, pre-fix)

| Lane | Count | Notes |
|------|------:|-------|
| Dead code — unused files | 182 | 174 under `legacy-root-azm/`; 2 in promoted `src/` |
| Dead code — unused exports | 29 | 17 in `src/`, 12 in `test/` |
| Dead code — unused type exports | 61 | Mostly public `@jhlagado/azm` / `./tooling` surface |
| Dead code — duplicate exports | 1 | `CompileNextResult` in `api-compile.ts` vs `core/compile.ts` |
| Dead code — unresolved imports | 9 | All `legacy-root-azm/test/` script paths |
| Dupes — clone groups | 255 | 15.4% duplicated LOC; mirrored legacy ↔ promoted trees |
| Health score | 70 B | Duplication −10, complexity −8, dead files −7.6, dead exports −3.9 |

### Fixed in PR (promoted `src/` / `test/`)

| Change | Rationale |
|--------|-----------|
| Deleted `src/formats/index.ts` and `src/formats/types.ts` | Dead re-export shims; promoted code uses `outputs/` directly |
| Deleted `src/model/section.ts` | Unused `ByteRange` interface |
| Deleted `test/helpers/temp_source.ts`, `test/helpers/lowered_program_symbols.ts` | Orphan copies; promoted tests use `legacy-root-azm` helpers |
| Removed export from internal helpers (`placementOffset`, `placementBase`, `normalizeCarrierName`, `expandCarrier`, `lookupLabelValue`, `findExpectOutFixes`, `readPackageVersion`) | Module-private; no external consumers in promoted tree |
| Removed dead `findAcceptedOutputCandidatesFromHints` from `register-care/liveness.ts` | Only referenced in legacy oracle, not promoted analyze path |
| Renamed `core/compile` result type to `CompileSourceResult`; dropped root `CompileNextResult` re-export | Resolves duplicate export; program compile keeps `CompileNextResult` on `./compile` subpath |
| Updated `next/azm-package-shims.d.ts`, dropped stale `vitest` coverage exclude | Shim path → `outputs/index` |

### Post-fix counts

| Lane | Before → After |
|------|----------------|
| Unused files (promoted `src/`) | 2 → **0** |
| Unused exports (`src/`) | 17 → **9** |
| Duplicate exports | 1 → **0** |
| Health dead-files deduction | −7.6 → **−7.5**; duplication **15.4% → 15.0%** |

### Dismissed / deferred (needs no action now)

| Finding | Disposition |
|---------|-------------|
| 174+ unused files under `legacy-root-azm/` | Intentional oracle quarantine; not promoted surface |
| `api-tooling.ts` re-exports (`analyzeProgram`, `codeActionForOutputCandidate`, etc.) | Public `./tooling` package exports; Fallow cannot see npm consumers |
| 53 unused type exports in `src/` | Public API / compile-subpath types (`D8m*`, register-care tooling types) |
| `test/types/instruction-types.ts`, `test/types/tooling-types.ts` | Compile-time type assertions included via `tsconfig` `test/` glob |
| 255 dupes / mirrored directories | Expected legacy ↔ Next parity; consolidation deferred until oracle retirement |
| 9 unresolved imports in legacy tests | Script paths outside Fallow entry graph |
| Health complexity / large-function findings | P3 deferred (encoder/parser/op-expansion family splits) |

### Remaining items needing user decision

1. **Add `legacy-root-azm/**` to `fallow.toml` `ignorePatterns` or use `--production`** — reduces noise (96% of unused-file signal is oracle tree).
2. **Retire mirrored clone families** when differential oracle is no longer needed — largest duplication win.
3. **Public type surface trim** — audit whether all `D8m*` / register-care tooling types must stay exported on `./compile` and `./tooling`.

---

## Revision history

| Date | Change |
|------|--------|
| 2026-05-23 | Initial findings; refresh after #134–#139 |
| 2026-05-24 | P1/P2/P3 backlog; P1 implementation (stripLineComment, shim removal, doc structure) |
| 2026-05-24 | P2/P3 implementation: diagnostics unification, tooling API cleanup, naming stabilization, integration test split, op-expansion unit tests |
| 2026-05-24 | Fallow audit: removed promoted dead shims/helpers, resolved `CompileNextResult` duplicate export |
