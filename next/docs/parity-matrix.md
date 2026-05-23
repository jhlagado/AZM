# AZM Next Parity Matrix

Status: Stage 15 closeout audit (2026-05-23)

This matrix tracks the observable behavior AZM Next must match before it can
replace the current implementation.

Legend:

- `not started`
- `scaffolded`
- `partial`
- `compatible`
- `intentionally different`

| Area                      | Status     | Oracle                                                                         |
| ------------------------- | ---------- | ------------------------------------------------------------------------------ |
| Source loading            | compatible | Stage 11 tooling API tests and include-dir fixture execution                   |
| Include provenance        | partial    | Stage 11/12 API tests; `pr950` include diagnostic still in unsupported roster |
| Logical line parsing      | compatible | Unit tests and 56 supported root differential fixtures (29 unsupported)      |
| Directive aliases         | compatible | Stage 6 evidence, alias/storage differential fixture, root corpus              |
| Labels and local labels   | compatible | Parser tests and root corpus differential suite                                |
| Immediate expressions     | compatible | Stage 4 expression tests and root corpus                                       |
| Current-location `$`      | compatible | Stage 4 expression tests and ASM80 baseline coverage in corpus                 |
| Forward equates           | compatible | Stage 4 fixup/expression tests and root corpus                               |
| Explicit fixup records    | compatible | Stage 4 fixup tests and root corpus                                          |
| Z80 operand parsing       | compatible | Stage 5 encoder tests and instruction-matrix fixtures in corpus              |
| Z80 encoding              | compatible | Stage 5 tests and HEX/BIN comparisons in 58 supported root fixtures          |
| `.org` / `ORG` alias      | partial    | Stage 4/6 tests; org+data placement parity tracked for Stage 16              |
| `.equ` / `EQU` alias      | compatible | Equate tests and root corpus                                                 |
| `.db` / `DB` alias        | compatible | Stage 6 evidence and root corpus                                             |
| `.dw` / `DW` alias        | compatible | Stage 4 fixup tests and root corpus                                          |
| `.ds` / `DS` alias        | compatible | Stage 6 storage tests and root corpus                                        |
| String directives         | compatible | Stage 6 evidence and root corpus                                             |
| Alignment                 | compatible | Stage 6 minimal-assembler tests and root corpus                              |
| Binary ranges             | compatible | Stage 6 `.binfrom`/`.binto` tests and root corpus                            |
| Enums                     | compatible | Stage 7 tests and enum/storage differential fixture                          |
| Layout declarations       | partial    | Stage 7 layout tests; pr274-type BIN span parity pending Stage 16 placement  |
| `sizeof`                  | compatible | Stage 7 layout expression tests and root corpus                            |
| `offset`                  | compatible | Stage 7 layout expression tests                                              |
| Layout casts              | compatible | Stage 15 evidence-backed layout-cast folding and rejection tests             |
| Visible `op` declarations | compatible | Stage 9 tests and root corpus (non-diagnostic fixtures)                      |
| Op overload matching      | partial    | Stage 9 tests; `pr268_op_no_match` diagnostic wording still unsupported      |
| Op expansion local labels | compatible | Stage 15 evidence-backed op-local-label expansion test                       |
| Register-care contracts   | compatible | Stage 14 CLI/API parse and `.asmi` interface validation                      |
| Register-care summaries   | compatible | Stage 14 register-care report tests                                          |
| Lowered `.z80` output     | partial    | Stage 15 passthrough lowering; no golden comparison to current ASM80 yet     |
| BIN output                | compatible | Writers, API tests, and 56 root differential fixtures                         |
| HEX output                | compatible | Sparse segment parity (Stage 16 Slice G) and root corpus                     |
| Listing output            | partial    | Stage 12 API evidence; limited golden listing comparison                     |
| D8 debug map              | partial    | Stage 12 API evidence; shape parity not corpus-gated yet                   |
| CLI flags                 | partial    | Stage 13 CLI façade tests; not every matrix flag has a contract test         |
| Public compile API        | compatible | Stage 12 API tests and stage-16 package smoke (local + root when available)  |
| Tooling API               | compatible | Stage 11/14 tooling API tests                                                |

## Remaining partial rows

- **Lowered `.z80`**: expanded-source passthrough is implemented; instruction-level
  normalization and external ASM80 validator parity are deferred.
- **Listing / D8**: emitted for API/CLI paths; full golden comparison against
  current listing/D8 corpora is not yet part of differential gates.
- **CLI flags**: core default artifact set and register-care flags are covered;
  exhaustive CLI contract matrix parity is tracked in root AZM tests, not fully
  mirrored in `next/test` yet.

## Unsupported root fixtures (29)

See `next/test/differential/unsupported-fixtures.ts` for the explicit roster and
evidence buckets (`diagnostic-wording`, `visible-op-diagnostic`, `include-directive`,
`hex-bin-layout`). These are intentional differential exclusions until wording or
scope is reconciled. Stage 16 placement work targets reducing `hex-bin-layout` gaps.

## Classification Rule

When AZM Next differs from current AZM, classify the difference as one of:

- AZM Next bug
- current AZM bug
- intentional spec tightening
- historical behavior outside the replacement target
- undefined behavior now made explicit

Only intentional differences should survive promotion.
