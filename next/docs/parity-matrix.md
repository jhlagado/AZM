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

| Area                      | Status      | Oracle                                           |
| ------------------------- | ----------- | ------------------------------------------------ |
| Source loading            | partial     | Current include tests and source loader behavior |
| Include provenance        | not started | Listing and diagnostic source spans              |
| Logical line parsing      | partial     | Current parser tests and ASM80 corpus            |
| Directive aliases         | partial     | AZM alpha guardrails                             |
| Labels and local labels   | partial     | Parser, lowering, and corpus fixtures            |
| Immediate expressions     | partial     | Expression and directive tests                   |
| Current-location `$`      | partial     | ASM80 expression and equate tests                |
| Forward equates           | partial     | ASM80 equate alias tests                         |
| Explicit fixup records    | not started | Fixup tests and corpus HEX comparison            |
| Z80 operand parsing       | not started | Instruction parser tests                         |
| Z80 encoding              | not started | Encoder tests and corpus HEX comparison          |
| `.org` / `ORG` alias      | partial     | ASM80 baseline tests                             |
| `.equ` / `EQU` alias      | partial     | Equate and symbol tests                          |
| `.db` / `DB` alias        | partial     | Data directive fixtures                          |
| `.dw` / `DW` alias        | partial     | Data directive fixtures                          |
| `.ds` / `DS` alias        | partial     | Storage and Tetro acceptance behavior            |
| String directives         | not started | `.cstr`, `.pstr`, `.istr` tests                  |
| Alignment                 | not started | AZM alpha guardrails                             |
| Binary ranges             | not started | BIN output and Tetro checks                      |
| Enums                     | not started | Enum guardrail tests                             |
| Layout declarations       | not started | Layout constant tests                            |
| `sizeof`                  | not started | Layout expression tests                          |
| `offset`                  | not started | Layout expression tests                          |
| Layout casts              | not started | Exact-size layout tests                          |
| Visible `op` declarations | not started | Op expansion tests                               |
| Op overload matching      | not started | Op matcher tests                                 |
| Op expansion local labels | not started | Expansion and register-care tests                |
| Register-care contracts   | not started | Register-care audit tests                        |
| Register-care summaries   | not started | Register-care report tests                       |
| Lowered `.z80` output     | not started | Current lowered output fixtures                  |
| BIN output                | partial     | Output writer tests                              |
| HEX output                | partial     | Corpus comparisons                               |
| Listing output            | not started | Listing fixtures                                 |
| D8 debug map              | not started | D8 writer tests                                  |
| CLI flags                 | not started | CLI tests                                        |
| Public compile API        | not started | Package smoke tests                              |
| Tooling API               | not started | Tooling tests                                    |

## Classification Rule

When AZM Next differs from current AZM, classify the difference as one of:

- AZM Next bug
- current AZM bug
- intentional spec tightening
- historical behavior outside the replacement target
- undefined behavior now made explicit

Only intentional differences should survive promotion.
