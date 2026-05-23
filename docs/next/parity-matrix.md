# AZM Next Parity Matrix

Status: post-promotion differential closeout (2026-05-23)

For the live completion backlog and cutover blocker list, use
`docs/next/finalization-plan.md`.

This matrix tracks the observable behavior AZM Next must match before it can
replace the current implementation.

Legend:

- `not started`
- `scaffolded`
- `partial`
- `compatible`
- `intentionally different`

| Area                      | Status     | Oracle                                                                        |
| ------------------------- | ---------- | ----------------------------------------------------------------------------- |
| Source loading            | compatible | Stage 11 tooling API tests and include-dir fixture execution                  |
| Include provenance        | compatible | Stage 11/12 API tests and `pr950` root-fixture differential parity            |
| Logical line parsing      | compatible | Unit tests and 63 supported root differential fixtures (24 unsupported)       |
| Directive aliases         | compatible | Stage 6 evidence, alias/storage differential fixture, root corpus             |
| Labels and local labels   | compatible | Parser tests and root corpus differential suite                               |
| Immediate expressions     | compatible | Stage 4 expression tests and root corpus                                      |
| Current-location `$`      | compatible | Stage 4 expression tests and ASM80 baseline coverage in corpus                |
| Forward equates           | compatible | Stage 4 fixup/expression tests and root corpus                                |
| Explicit fixup records    | compatible | Stage 4 fixup tests and root corpus                                           |
| Z80 operand parsing       | compatible | Stage 5 encoder tests and instruction-matrix fixtures in corpus               |
| Z80 encoding              | compatible | Stage 5 tests and HEX/BIN comparisons in 63 supported root fixtures           |
| `.org` / `ORG` alias      | compatible | Stage 4/6 tests, code/data placement parity (Stage 16 Slice I), root corpus   |
| `.equ` / `EQU` alias      | compatible | Equate tests and root corpus                                                  |
| `.db` / `DB` alias        | compatible | Stage 6 evidence and root corpus                                              |
| `.dw` / `DW` alias        | compatible | Stage 4 fixup tests and root corpus                                           |
| `.ds` / `DS` alias        | compatible | Stage 6 storage tests and root corpus                                         |
| String directives         | compatible | Stage 6 evidence and root corpus                                              |
| Alignment                 | compatible | Stage 6 minimal-assembler tests and root corpus                               |
| Binary ranges             | compatible | Stage 6 `.binfrom`/`.binto` tests and root corpus                             |
| Enums                     | compatible | Stage 7 tests and enum/storage differential fixture                           |
| Layout declarations       | compatible | Stage 7 layout tests and pr274-type fixtures (Stage 16 Slice I placement)     |
| `sizeof`                  | compatible | Stage 7 layout expression tests and root corpus                               |
| `offset`                  | compatible | Stage 7 layout expression tests                                               |
| Layout casts              | compatible | Stage 15 evidence-backed layout-cast folding and rejection tests              |
| Visible `op` declarations | compatible | Stage 9 tests and root corpus (non-diagnostic fixtures)                       |
| Op overload matching      | partial    | Stage 9 tests; `pr268_op_no_match` diagnostic wording still unsupported       |
| Op expansion local labels | compatible | Stage 15 evidence-backed op-local-label expansion test                        |
| Register-care contracts   | compatible | Stage 14 CLI/API parse and `.asmi` interface validation                       |
| Register-care summaries   | compatible | Stage 14 register-care report tests                                           |
| Lowered `.z80` output     | partial    | Stage 15 passthrough lowering; no golden comparison to current ASM80 yet      |
| BIN output                | compatible | Writers, API tests, 62 root differential fixtures, code/data placement        |
| HEX output                | compatible | Sparse segment parity (Stage 16 Slice G) and root corpus                      |
| Listing output            | partial    | Stage 12 API evidence; limited golden listing comparison                      |
| D8 debug map              | partial    | Stage 12 API evidence; shape parity not corpus-gated yet                      |
| CLI flags                 | partial    | Stage 13 CLI façade tests; not every matrix flag has a contract test          |
| Public compile API        | compatible | Stage 12 API tests and stage-16 package smoke (local + root when available)   |
| Tooling API               | compatible | Stage 11/14 tooling API tests                                                 |

## Remaining partial rows

- **Lowered `.z80`**: expanded-source passthrough is implemented; instruction-level
  normalization and external ASM80 validator parity are deferred.
- **Listing / D8**: emitted for API/CLI paths; full golden comparison against
  current listing/D8 corpora is not yet part of differential gates.
- **CLI flags**: core default artifact set and register-care flags are covered;
  exhaustive CLI contract matrix parity is tracked in root AZM tests, but not
  every matrix row has a dedicated promoted-root contract test yet.

## Unsupported root fixtures (24)

See `test/differential/unsupported-fixtures.ts` for the explicit roster and
evidence buckets (`diagnostic-wording`, `visible-op-diagnostic`).
These are intentional differential exclusions until wording or scope is reconciled.

## Classification Rule

When AZM Next differs from current AZM, classify the difference as one of:

- AZM Next bug
- current AZM bug
- intentional spec tightening
- historical behavior outside the replacement target
- undefined behavior now made explicit

Only intentional differences should survive promotion.
