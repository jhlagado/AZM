# Oracle coverage — next increment

**Date:** 2026-05-24  
**Status:** complete (Task 9d merged); next: examples_compile + production gates  
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
**Weak Next areas:** pr132/pr136/pr137/pr126 (residual ISA), `examples_compile` (if not merged).

## This increment (one PR)

### Required

Add `test/integration/examples-compile.test.ts` — compile every `examples/*.asm` / `.z80` cleanly
and deterministically (oracle `examples_compile.test.ts` pattern).

### Out of scope (follow-on PRs)
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

**Preferred:** production gate verification (record in code-quality review).  
**Then:** stale doc refresh (`docs/reference/source-overview.md`).
