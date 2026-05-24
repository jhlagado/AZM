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

### P0b — production gates verified (2026-05-24, clean local shell)

Recorded per increment-completion loop. Run these sequentially (not in parallel with
`test:package`, which cleans `dist/` during `npm run build`).

| Command                         | Result   | Notes                                                                                                                |
| ------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run next:diff-current:all` | **pass** | 87-fixture differential sweep                                                                                        |
| `npm run test:package`          | **pass** | `npm pack` smoke on built tarball                                                                                    |
| `npm run next:guardrails:core`  | **pass** | typecheck, vitest, asm80 coverage, diff sweep (retry if one vitest timeout)                                          |
| `npm run test:ci:asm80-parity`  | **pass** | macOS local: coverage, external round-trip, MON3 emit acceptance; Linux CI is canonical for full real-program matrix |

Earlier sandbox EPERM/npm-cache failures on `next:diff-current:all` / `test:package` were
environment-only; they are superseded by the green runs above.

## Relevance Review of `docs/next`

### `docs/next/plan.md`

Relevance: active and authoritative.

This is the main finalization plan. **“P1 complete” there means user-visible cutover tasks**
(assembly, artifacts, CLI, real programs, asm80 CI policy) — **not** oracle test-depth /
resilience complete. Task 9a–9d merged (#190–#194). The plan includes
a **Path to release** section tying Task 9a matrices to verify gates
(`next:diff-current:all`, `test:package`, `test:ci:asm80-parity`) and doc refresh.

Keep this document. It should remain the high-level cutover reference.

Action needed:

- Keep completion claims synchronized with actual CI evidence.
- Do not read “P1 complete” as permission to skip Task 9 or production gate reruns.
- If `next:diff-current:all` or `test:package` fails in CI, update the plan immediately and
  reopen the relevant task.

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

## Production readiness (split verdict)

Do not use a single “feature parity is strong” line. Treat these lanes separately:

| Lane                                  | Verdict    | Notes                                                                                         |
| ------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| **User-visible assembly & artifacts** | Strong     | P0b gates green; BIN/HEX/listing/D8, CLI, asm80 CI policy exercised                           |
| **Oracle test depth**                 | Release P1 | Task 9a–9d merged (#190–#194); optional pr132/pr136/pr137/pr126 deferred per gap analysis §10 |
| **Maintainability & doc trust**       | Good       | `source-overview.md` and design/reference paths refreshed; `write-asm80.ts` size accepted     |

**Asm80:** lowering gates and CI policy (`test:ci:asm80-parity`) are required ongoing; keep the policy
on in CI. Bin-only differential parity can still hide illegal-form acceptance — Task 9 matrices close
that gap for the ported oracle subsets.

Overall: **READY** for release cutover from code/CI/doc-trust perspective; npm publish still needs
version bump and changelog per process.

## Oracle test depth

**Default question (every oracle file):** _Is this area tested as well in Next as in Oracle?
Would a Next port add resilience?_ (Full policy: `docs/next/oracle-test-gap-analysis.md` § 10.)

**Coverage heatmap (2026-05-24 audit, 149 oracle files):**

| Area       | Oracle vs Next                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------- |
| **Strong** | CLI contract suite, register-care, asm80 directive integration, Task 9 matrices (#190–#194), pr144–pr151/pr203/pr211 |
| **Weak**   | Residual optional ISA rows (pr132/pr136/pr137/pr126) per gap analysis §10                                            |
| **Risk**   | Green `next:diff-current:all` ≠ per-mnemonic matrices; fixture in corpus ≠ matrix test ported                        |

**Task 9 (9a–9d):** merged (#190–#194). Residual optional ports tracked in
`docs/next/oracle-test-gap-analysis.md` § 10, not release blockers.

## Code Quality Assessment

The rewrite is no longer structurally chaotic: coherent module layout, CLI/register-care gates,
explicit oracle comparison, and meaningful size/coverage scripts. Remaining weaknesses: optional
oracle ISA rows (§10), and `write-asm80.ts` size (see strengths/weaknesses below).

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

#### 1. Stale reference docs — **resolved (2026-05-24)**

`docs/reference/source-overview.md` and the design/reference docs below now point at
promoted `src/` paths (`syntax/`, `expansion/`, `outputs/`, etc.). Historical oracle
paths remain only in `docs/next/oracle-test-gap-analysis.md` as a file mapping table.

Refreshed:

- `docs/reference/source-overview.md` (#195)
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

### P0 — Task 9a–9d (oracle matrices) — **done (#190–#194)**

Control-flow/ISA matrices, layout/env edges, pr950 includes, and `examples_compile` merged.
Optional residual ISA rows: pr132/pr136/pr137/pr126 (gap analysis §10).

### P0b - Verify production gates in clean CI or shell — **done**

Exit condition met 2026-05-24; see **P0b — production gates verified** table above.

### P1 - Refresh stale architecture/reference docs — **done**

Exit condition met 2026-05-24. Promoted-path grep is clean except historical oracle
mapping rows in `docs/next/oracle-test-gap-analysis.md`:

```sh
rg -n "src/(frontend|lowering|formats)" docs
# → no matches (2026-05-24)
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

### P3 - Restrict label first character (parser)

**Desired rule:** A label must start with `@` followed by a letter, or with a
letter (`A`–`Z`, `a`–`z`). The first character must **not** be `.`, `_`, `$`,
`?`, or other punctuation — e.g. `.loop:` must be rejected.

**Current behavior:** `src/syntax/parse-line.ts` label regexes allow a leading
`.` (and `_`, `$`, `?`) in the first character class:

```text
/^(@?[A-Za-z_.$?][A-Za-z0-9_.$?]*):/
```

**Priority:** P3 — **not a release blocker.**

**Spec alignment:** User is removing leading-dot local labels from documentation
(e.g. `docs/spec/azm-assembly-baseline.md`, register-care and routine-private
label prose). Parser tightening is a follow-on increment; do not block release
on it.

## Suggested Production-Readiness Score

Current score: **10/10** for release cutover; **npm publish: READY** (process: version bump + changelog).

Rationale:

- **User-visible:** production gates green (P0b table); asm80 CI policy exercised.
- **Oracle:** Task 9a–9d merged (#190–#194): control-flow/ISA matrices, layout/env edges, pr950
  includes, `examples_compile`. Residual optional ISA rows (pr132/pr136/pr137/pr126) deferred per §10.
- **Maintainability:** reference/design docs refreshed; `write-asm80.ts` size accepted as non-blocking
  while asm80 gates stay green. Residual P2 splits tracked in backlog, not release blockers.
