# Oracle coverage — next increment

**Date:** 2026-05-24  
**Status:** complete (Task 9a merged); next: 9b pr129–pr131/pr133/pr134/pr240  
**Authoritative policy:** `docs/next/oracle-test-gap-analysis.md` §§ 8, 10  
**Full audit:** subagent `d2f954ef` (149 oracle files)

## Context

User-visible P1 tasks in `docs/next/plan.md` are complete (through PR #184 / pr151 matrix).
**Test parity with the oracle is not complete.** Green CI and differential corpus parity do not
replace per-message diagnostic matrices or layout/include semantics tests.

## Audit summary

| Metric                    | Value |
| ------------------------- | ----: |
| Oracle test files         |   149 |
| PORT (gap — plan to port) |   ~44 |
| SKIP (redundant / done)   |   ~59 |
| DEFER (P2)                |   ~36 |
| DO NOT PORT (legacy API)  |   ~10 |

**Strong Next areas:** CLI, register-care, asm80 directives, pr477/pr1140/pr203/pr144–pr151/pr211.  
**Weak Next areas:** pr202–pr210/pr225/pr240, pr129–pr137 (residual), layout/semantics, includes,
`examples_compile`.

## This increment (one PR)

### Required

Port oracle **control-flow and I/O diagnostic matrices** using existing invalid fixtures and the
same integration pattern as `test/integration/pr203-ld-diag-matrix.test.ts`:

1. `pr207_jp_indirect_legality_diag_matrix`
2. `pr208_call_indirect_legality_diag_matrix`
3. `pr209_jp_cc_indirect_legality_diag_matrix`
4. `pr210_jp_call_condition_vs_imm_diag_matrix`
5. `pr206_in_out_indexed_reg_diag_matrix`
6. `pr202_add_diag_matrix`
7. `pr204_adc_sbc_diag_matrix`
8. `pr225_indexed_rotate_destination_diag_matrix`

**Do not** copy oracle helper modules; assert diagnostics via `compileNext` / public API only.

### Optional (same PR if small)

- `examples_compile.test.ts` → `test/integration/examples-compile.test.ts` (compile every
  `examples/*.asm` / documented example entry).

### Out of scope (follow-on PRs)

- pr129–pr131, pr133–pr137, pr240, pr126 CB matrix
- `semantics/*`, `pr769`, include path matrices
- D8/listing hardening (pr39, pr119, pr200)
- `write-asm80.ts` modularization (see code-quality review)

## Validation

```sh
npm run typecheck
npm run lint
npm run test:ci:coverage-core
# new integration tests only, then:
npm run next:guardrails:core
```

## PR checklist (increment-completion)

- [ ] No other open PRs before start
- [ ] Subagent review on diff
- [ ] Update `docs/next/oracle-test-gap-analysis.md` § 8 when merged
- [ ] `gh pr checks` green before merge

## Next task (after merge)

**Preferred:** pr129–pr131 + pr133/pr134/pr240 (arity / register-target matrices) in one PR.  
**Parallel lanes (one PR):** Lane A pr129–pr131; Lane B pr133/pr134/pr240; Lane C pr126 CB.  
**Then:** layout semantics cluster + `sourceLoader_*` / `pr950` includes.
