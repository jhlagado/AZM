# Issue: raise automated test coverage to 80% (labels: designer, developer, reviewer)

Context

- Current coverage (v8): Stmts 72.84 / Branch 77.48 / Funcs 92.02 / Lines 72.84.
- Large gaps: `src/semantics/layout.ts`, `src/lowering/emit.ts` tail, `src/z80/encode.ts`, `src/lintCaseStyle.ts`, `scripts/ci/change-classifier.js`.

Goal

- Restore overall coverage to ≥80% while keeping expectations aligned with v0.2 semantics.

Initial steps (this PR)

- Add targeted unit tests for layout sizing/offsetof and CI change-classifier to regain some coverage.

Follow-ups

- Add focused tests for `layout.ts` complex paths (arrays/records/unions), `emit.ts` edge cases (runtime-atom budget, epilogue rewrites), and `encode.ts` gap areas.
- Re-enable or replace high-value ISA/lowering matrix suites that were pruned during codegen shifts.
- Decide case-style lint coverage strategy (keyword/register/mnemonic variants).

Owners/labels

- Please apply labels: designer, developer, reviewer. Tag designer for approval of coverage plan/priorities.
