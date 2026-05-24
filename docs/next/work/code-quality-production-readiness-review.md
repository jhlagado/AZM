# AZM Next Code Quality Production Readiness Review

Date: 2026-05-24

Status: work note. This document records the code-quality review of the current
AZM Next implementation and the relevance of the other `docs/next` documents.
It is intended to guide production-readiness cleanup, not to replace
`docs/next/plan.md`.

## Scope

Reviewed from the perspective of:

- modularization
- maintainability
- code-quality standard alignment
- feature parity evidence against the legacy AZM oracle
- production-readiness risks

Primary references:

- `docs/reference/code-quality-standard.md`
- `docs/next/plan.md`
- `docs/next/oracle-test-gap-analysis.md`
- `docs/code-quality-findings.md`
- live source tree under `src/`
- package scripts in `package.json`

## Current Evidence Snapshot

Commands that passed in the review environment:

```sh
npm run typecheck
npm run lint
npm run check:source-file-sizes
npm run check:source-file-sizes:enforce
npm run check:fixture-coverage
npm run check:asm80-coverage
```

Observed results:

- `check:fixture-coverage` passed for 87 fixture files.
- `check:asm80-coverage` passed for 90 files.
- `test/differential/unsupported-fixtures.ts` is empty.
- `src/` now broadly matches the intended architecture map in
  `docs/next/plan.md`.

Commands that could not be fully verified in this local environment:

```sh
npm run next:diff-current:all
npm run test:package
```

`next:diff-current:all` failed before running the actual differential comparison
because `tsx` could not open its IPC pipe in the sandbox:

```text
Error: listen EPERM ... tsx-501/...pipe
```

`test:package` successfully built the package but then failed during `npm pack`
because npm could not write to the local npm cache:

```text
npm error syscall open
npm error path /Users/johnhardy/.npm/_cacache/tmp/...
```

These look like local environment failures, not code failures, but production
readiness should not be claimed from this environment alone until both commands
are rerun in CI or a clean local shell.

## Relevance Review of `docs/next`

### `docs/next/plan.md`

Relevance: active and authoritative.

This is the main finalization plan. It says all P1 tasks are complete, including
user-visible assembly parity, BIN/HEX/listing/D8, real-program binary
acceptance, and lowered `.z80` / `emitAsm80` coverage. It also records that
intentional lowered-output differences are documented in
`test/differential/asm80-corpus-policy.ts`.

Keep this document. It should remain the high-level cutover reference.

Action needed:

- Keep the completion claims synchronized with actual CI evidence.
- If `next:diff-current:all` or `test:package` fails in CI, update the plan
  immediately and reopen the relevant task.
- Remove or revise any mention of `src/formats/` if the directory is no longer
  present in the live tree. The plan currently describes it as a compatibility
  re-export surface, but this should be checked against current package exports.

### `docs/next/oracle-test-gap-analysis.md`

Relevance: **active** for post-cutover test parity (complements `plan.md` Task 9).

Records asm80 gap root cause, full oracle audit (149 files, subagent `d2f954ef`), § 8 active
increment (pr207–pr210 + pr206/pr202/pr204/pr225), and § 10 **coverage-gap port policy** (not
“skip everything”). Key lesson: green CI ≠ per-message diagnostic matrices; corpus parity ≠
oracle resilience.

Action needed:

- Update § 8 when each matrix increment merges.
- Use § 10 checklist before every port PR.

### `docs/next/work/oracle-coverage-next-increment.md`

Relevance: active single-PR work note for the current oracle increment.

Points implementers at required matrices, optional `examples_compile`, validation commands, and
increment-completion checklist.

### `docs/next/work/`

Relevance: working notes only.

This directory should hold temporary review notes, handover notes, or cleanup
backlogs. It should not become a second plan source. If a work note changes the
actual cutover state, reflect that in `docs/next/plan.md`.

## Code Quality Assessment

Overall verdict: AZM Next is close to production-ready for **user-visible assembly and
artifacts**, but **oracle-depth test parity** is still catching up (ISA diagnostic matrices,
layout, includes). The rewrite is no longer structurally chaotic. It has a coherent module
layout, strong CLI/register-care/asm80 gates, explicit oracle comparison, and meaningful quality
gates. Remaining weaknesses: concentrated ISA diag gaps (see Task 9 in `plan.md`), stale reference
docs, and `write-asm80.ts` size.

### Strengths

- The live source tree now follows the intended module map much better than the
  earlier staged rewrite:
  - `src/expansion/`
  - `src/semantics/`
  - `src/node/`
  - `src/cli/`
  - `src/outputs/`
  - `src/register-care/`
- The old implementation is quarantined under `legacy-root-azm/` and used as an
  oracle rather than mixed into promoted compiler paths.
- Unsupported differential fixtures are empty.
- ASM80 lowering now has explicit coverage and no longer relies only on
  BIN/HEX parity.
- CLI, compile API, tooling API, register-care, D8, listing, and package-surface
  work have direct test lanes.
- The code-quality standard is concrete and enforced by a source-size script.

### Weaknesses

#### 1. Stale reference docs

`docs/reference/source-overview.md` still describes an older architecture with
`frontend/`, `lowering/`, and `formats/` paths. The live tree now uses
`syntax/`, `assembly/`, `outputs/`, `expansion/`, and `semantics/`.

This is a production-readiness issue because stale docs mislead future agents
and maintainers. It also conflicts with the project principle that documentation
should be a trustworthy map of live code.

Related stale references were also found in design/reference docs, including:

- `docs/design/azm-ops-subset.md`
- `docs/design/asm80-compatibility-baseline.md`
- `docs/design/azm-directive-aliases.md`
- `docs/reference/adding-z80-instructions.md`
- `docs/reference/tooling-api.md`

#### 2. `src/outputs/write-asm80.ts` is now a soft-limit file

Current line count observed:

```text
src/outputs/write-asm80.ts: 876
```

This file is now larger than many earlier hotspots and is not hard-cap
allowlisted. It is central to `emitAsm80`, which is now a cutover-critical
artifact. Fallow also reports high complexity in `formatInstruction` and
`formatLd`.

This should be the next real modularization target.

#### 3. Hard-cap files remain accepted debt

Hard-cap allowlisted files:

```text
src/z80/parse-instruction.ts: 1268
src/expansion/op-expansion.ts: 1213
src/z80/encode.ts: 1209
```

The allowlist reasons are plausible: dense parser/encoder tables and op
expansion logic can be more readable in one place until a family split is
designed. But this remains a debt category, especially
`parseZ80Instruction`, which Fallow reports as very high complexity.

#### 4. Fallow signal is too noisy

`fallow:dead-code` currently fails mostly because `legacy-root-azm/` is an
intentional oracle quarantine. This makes the dead-code lane poor as a routine
quality signal.

The project should either:

- ignore `legacy-root-azm/**` in normal Fallow runs, or
- create a production-only Fallow script, while keeping a separate oracle audit
  lane when needed.

#### 5. Legacy test helpers still import legacy lowering types

Some helpers under `test/helpers/` still import legacy lowering types and
formatting helpers. This may be intentional for oracle comparisons, but it
should be classified. Any helper used by promoted tests should not accidentally
depend on retired lowering APIs.

#### 6. Empty `.gitkeep` files remain in populated directories

The following populated directories still have `.gitkeep` files:

- `src/assembly/.gitkeep`
- `src/source/.gitkeep`
- `src/syntax/.gitkeep`
- `src/outputs/.gitkeep`
- `src/register-care/.gitkeep`
- `src/z80/.gitkeep`

This is minor, but it is a visible cleanup item after architecture alignment.

## Priority-Ordered Improvement Backlog

### P0 - Oracle ISA diagnostic matrices (Task 9a)

See `docs/next/work/oracle-coverage-next-increment.md` and `oracle-test-gap-analysis.md` § 8.

Port pr207–pr210 (+ pr206, pr202, pr204, pr225) before broad doc or `write-asm80` splits so
control-flow legality regressions cannot pass bin-only corpus.

### P0b - Verify production gates in clean CI or shell

Run and record:

```sh
npm run next:diff-current:all
npm run test:package
npm run next:guardrails
npm run test:ci:asm80-parity
```

Reason:

- The local review environment could not run two important gates because of
  environment permissions.
- The plan claims completion; those claims need current green evidence outside
  the sandbox failure mode.

Exit condition:

- All commands pass in CI or a clean local shell, or failures are documented as
  real tasks in `docs/next/plan.md`.

### P1 - Refresh stale architecture/reference docs

Update:

- `docs/reference/source-overview.md`
- `docs/reference/adding-z80-instructions.md`
- `docs/reference/tooling-api.md`
- `docs/design/azm-ops-subset.md`
- `docs/design/azm-directive-aliases.md`
- `docs/design/asm80-compatibility-baseline.md`

Reason:

- Current docs contain old `frontend/`, `lowering/`, and `formats/` references.
- Stale docs are now more misleading than missing docs because they point future
  work at deleted architecture.

Exit condition:

- Searching docs for old promoted-path references no longer points at live-code
  instructions unless the reference is explicitly historical:

```sh
rg -n "src/(frontend|lowering|formats)|frontend/|lowering/|formats/" docs
```

### P1 - Split `src/outputs/write-asm80.ts`

Suggested split:

- `src/outputs/asm80/expressions.ts`
- `src/outputs/asm80/directives.ts`
- `src/outputs/asm80/ld.ts`
- `src/outputs/asm80/alu.ts`
- `src/outputs/asm80/bit-rotate.ts`
- `src/outputs/asm80/control.ts`
- `src/outputs/write-asm80.ts` as a thin coordinator

Reason:

- The file is over 750 lines.
- It contains multiple instruction-family formatters plus directive and
  expression formatting.
- `emitAsm80` is now important enough to deserve a maintainable module shape.

Required validation:

```sh
npm run check:asm80-coverage
npm run test:ci:asm80-parity
npm run next:diff-current:all
npm run typecheck
npm run lint
npm run check:source-file-sizes
```

### P2 - Make Fallow useful for promoted code

Add either a new script or config profile that excludes the oracle tree from the
normal promoted-code lane.

Possible scripts:

```json
"fallow:production": "fallow --production"
```

or configure ignore patterns for:

```text
legacy-root-azm/**
```

Reason:

- Current Fallow output is dominated by intentional oracle quarantine.
- The tool should expose promoted-code risks without forcing maintainers to
  mentally filter hundreds of legacy findings.

### P2 - Plan family splits for parser and encoder

Target files:

- `src/z80/parse-instruction.ts`
- `src/z80/encode.ts`
- `src/z80/effects.ts`

Do not split blindly. Start by extracting one family only when tests clearly
cover it:

- control flow
- LD
- ALU
- CB bit/rotate
- I/O
- core zero-operand

Reason:

- These files are table-dense, so a bad split can make maintenance worse.
- A family split is worthwhile only if it improves navigation without
  duplicating operand rules.

### P2 - Split or document `src/expansion/op-expansion.ts`

Suggested split:

- registry and overload collection
- matcher comparison
- operand substitution
- template instantiation
- local-label/provenance handling

Reason:

- Visible `op` is a retained AZM feature.
- The file is above 1200 lines and high complexity.
- The feature is too important to leave as a large opaque module indefinitely.

### P3 - Classify legacy-dependent test helpers

Inspect:

- `test/helpers/lowered_program_*`
- `test/helpers/parser.ts`
- `test/helpers/cli/index.ts`

Classify each helper as:

- intentional oracle helper
- promoted test helper
- obsolete transitional helper

Reason:

- Oracle helpers are acceptable.
- Promoted tests depending on legacy lowering APIs would be a boundary leak.

### P3 - Remove stale `.gitkeep` files

Remove `.gitkeep` from populated directories after confirming no tooling expects
them.

Reason:

- Minor cleanup, but it reinforces that architecture alignment is done.

## Suggested Production-Readiness Score

Current score: 8/10.

Rationale:

- Feature parity evidence is strong.
- Module boundaries are much improved.
- Critical output artifacts now have coverage.
- Remaining issues are maintainability and documentation trust, not obvious
  missing assembler functionality.

Do not raise this to 9/10 until:

- stale docs are fixed
- `write-asm80.ts` is split or explicitly justified
- production gates are re-run cleanly outside the local permission failures

Do not raise this to 10/10 while parser/encoder/op-expansion hard-cap debt
remains accepted rather than structurally resolved.
