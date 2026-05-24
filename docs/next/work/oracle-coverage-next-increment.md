# Oracle coverage — next increment

**Date:** 2026-05-24  
**Status:** complete (Task 9b merged); next: 9c layout/semantics cluster  
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
**Weak Next areas:** pr132/pr136/pr137/pr126 (residual ISA), layout/semantics, includes,
`examples_compile`.

## This increment (one PR)

### Required

Port oracle **layout / semantics diagnostic matrices** for the env_edge_cases / layout_cast /
`pr769` / layout_edge_cases cluster (audit priorities in gap-analysis § 8).

Use the same integration pattern as `test/integration/pr203-ld-diag-matrix.test.ts`; assert via
`compile` / public API only — do not copy oracle helper modules.

### Out of scope (follow-on PRs)

- `sourceLoader_*`, `pr950_include_text_only`
- pr126 CB matrix (optional)
- pr132/pr136/pr137 residual ISA
- `examples_compile`
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

**Preferred:** layout/semantics cluster (env_edge_cases, layout_cast\_\*, pr769, layout_edge_cases).  
**Then:** `sourceLoader_*` + `pr950_include_text_only`; optional `examples_compile`.
