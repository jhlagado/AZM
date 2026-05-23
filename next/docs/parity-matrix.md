# AZM Next Parity Matrix

Status: initial tracker

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
| Source loading            | partial    | Current include tests, source loader behavior, and Stage 11 evidence           |
| Include provenance        | partial    | Listing, diagnostic source spans, and Stage 11 evidence                        |
| Logical line parsing      | partial    | Current parser tests and ASM80 corpus                                          |
| Directive aliases         | partial    | AZM alpha guardrails                                                           |
| Labels and local labels   | partial    | Parser, lowering, and corpus fixtures                                          |
| Immediate expressions     | partial    | Expression and directive tests                                                 |
| Current-location `$`      | partial    | ASM80 expression and equate tests                                              |
| Forward equates           | partial    | ASM80 equate alias tests                                                       |
| Explicit fixup records    | partial    | Fixup tests and corpus HEX comparison                                          |
| Z80 operand parsing       | partial    | Instruction parser tests                                                       |
| Z80 encoding              | partial    | Encoder tests and corpus HEX comparison                                        |
| `.org` / `ORG` alias      | partial    | ASM80 baseline tests                                                           |
| `.equ` / `EQU` alias      | partial    | Equate and symbol tests                                                        |
| `.db` / `DB` alias        | partial    | Data directive fixtures                                                        |
| `.dw` / `DW` alias        | partial    | Data directive fixtures                                                        |
| `.ds` / `DS` alias        | partial    | Storage and Tetro acceptance behavior                                          |
| String directives         | partial    | `.cstr`, `.pstr`, `.istr` tests and Stage 6 evidence                           |
| Alignment                 | partial    | AZM alpha guardrails and Stage 6 evidence                                      |
| Binary ranges             | partial    | BIN output, Tetro checks, and Stage 6 evidence                                 |
| Enums                     | partial    | Enum guardrail tests                                                           |
| Layout declarations       | partial    | Layout constant tests                                                          |
| `sizeof`                  | partial    | Layout expression tests                                                        |
| `offset`                  | partial    | Layout expression tests                                                        |
| Layout casts              | compatible | Stage 15 evidence-backed layout-cast folding and rejection tests               |
| Visible `op` declarations | partial    | Op expansion tests and Stage 9 evidence                                        |
| Op overload matching      | partial    | Op matcher tests and Stage 9 evidence                                          |
| Op expansion local labels | compatible | Stage 15 evidence-backed op-local-label expansion test                         |
| Register-care contracts   | compatible | CLI/API parse and `.asmi` interface validation                                 |
| Register-care summaries   | compatible | Added register-care report tests under evidence-backed routine summaries slice |
| Lowered `.z80` output     | partial    | Stage 15 evidence-backed lowering scaffolding and source-expansion emit path   |
| BIN output                | compatible | Output writer tests, Stage 10 evidence, and Stage 12 API tests                 |
| HEX output                | compatible | Corpus comparisons, Stage 10 evidence, and Stage 12 API tests                  |
| Listing output            | partial    | Listing fixtures and Stage 12 API evidence                                     |
| D8 debug map              | partial    | Stage 12 API evidence and D8 writer tests                                      |
| CLI flags                 | partial    | Stage 13 CLI façade tests and documented CLI contracts                         |
| Public compile API        | partial    | Package smoke tests, Stage 10 evidence, and Stage 12 evidence                  |
| Tooling API               | partial    | Tooling tests and Stage 11 evidence                                            |

## Classification Rule

When AZM Next differs from current AZM, classify the difference as one of:

- AZM Next bug
- current AZM bug
- intentional spec tightening
- historical behavior outside the replacement target
- undefined behavior now made explicit

Only intentional differences should survive promotion.
