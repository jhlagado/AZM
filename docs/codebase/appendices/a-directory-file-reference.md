---
layout: default
title: 'Appendix A - Directory and File Reference'
parent: 'Appendices'
grand_parent: 'AZM Engineering Manual'
nav_order: 1
---

[<- Verification and Maintenance](../06-verification-and-maintenance.md) | [Appendix B ->](b-compile-flow-reference.md)

# Appendix A - Directory and File Reference

This appendix is the file-by-file map of the AZM implementation. Use it when
you need to find the owner of a behaviour quickly.

## Root Source Files

| File                            | Role                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/index.ts`                  | Main package export surface. Re-exports compile, tooling, diagnostics, register contract and D8 map types.               |
| `src/api-compile.ts`            | File-backed public compile API. Coordinates loading, analysis, register contracts, assembly and artifact writers.        |
| `src/api-artifacts.ts`          | Assembly artifact helper for the compile API. Builds BIN, HEX, D8 and lowered ASM80 artifacts from assembled output.     |
| `src/api-register-contracts.ts` | Register contract helper for the compile API. Loads `.asmi` interfaces, runs analysis and converts results to artifacts. |
| `src/api-tooling.ts`            | Public tooling API re-export layer. Keeps editor-facing imports stable.                                                  |
| `src/cli.ts`                    | CLI executable entry. Calls `runCli()` and sets process exit code.                                                       |

## `src/assembly/`

| File                  | Role                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `assemble-program.ts` | Assembly coordinator. Builds address state, emits program image and returns assembled result data.           |
| `address-planning.ts` | Defines labels, equates, enum members, layouts and type aliases; calculates directive and instruction sizes. |
| `address-symbols.ts`  | Symbol-definition helpers for labels, equates and enums.                                                     |
| `placement.ts`        | Tracks placement state plus origin and address movement for code and data.                                   |
| `program-emission.ts` | Writes bytes into the emitted image and records source segments.                                             |
| `fixup-emission.ts`   | Resolves symbolic instruction fragments such as ABS16, IMM8 and REL8.                                        |

## `src/cli/`

| File                 | Role                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `artifact-files.ts`  | Writes in-memory artifacts to disk paths.                                                |
| `parse-args.ts`      | Parses CLI switches and validates command shape.                                         |
| `run.ts`             | Runs the CLI: parse args, compile, print diagnostics, write artifacts and return status. |
| `usage.ts`           | CLI help text.                                                                           |
| `write-artifacts.ts` | Maps parsed options to compile options and calculates output stems.                      |

## `src/core/`

| File                      | Role                                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `compile.ts`              | In-memory source-item parsing path and legacy compile helpers.          |
| `compile-artifacts.ts`    | Artifact-oriented compile helpers used by older or lower-level callers. |
| `conditional-assembly.ts` | `.if` / `.else` / `.endif` filtering before final source-item parsing.  |

## `src/diagnostics/`

| File        | Role                                                |
| ----------- | --------------------------------------------------- |
| `format.ts` | Formats structured diagnostics for CLI text output. |

## `src/expansion/`

| File                              | Role                                                         |
| --------------------------------- | ------------------------------------------------------------ |
| `op-expansion.ts`                 | Coordinates op collection, invocation parsing and expansion. |
| `op-operands.ts`                  | Op parameter and operand model.                              |
| `op-operand-splitting.ts`         | Splits invocation operands for overload matching.            |
| `op-selection.ts`                 | Selects the matching op overload.                            |
| `op-expand-selected.ts`           | Expands the selected overload.                               |
| `op-instruction-instantiation.ts` | Substitutes operands into op body instructions.              |
| `op-local-labels.ts`              | Rewrites expansion-local labels to unique generated labels.  |
| `op-constant-expression.ts`       | Constant-expression support for op expansion.                |

## `src/model/`

| File             | Role                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| `diagnostic.ts`  | Diagnostic severity, IDs and common diagnostic shape.                                |
| `expression.ts`  | Expression and type-expression AST types.                                            |
| `fixup.ts`       | Fixup fragment model for symbolic byte emission.                                     |
| `source-item.ts` | Parsed source item model shared by parser, assembly, outputs and register contracts. |
| `symbol.ts`      | Symbol table type.                                                                   |

## `src/node/`

| File             | Role                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `source-host.ts` | File-backed source loading, entry extension checks, include expansion, source text capture and comment maps. |

## `src/outputs/`

| File                             | Role                                                         |
| -------------------------------- | ------------------------------------------------------------ |
| `types.ts`                       | Artifact, byte map, source segment, symbol and D8 map types. |
| `index.ts`                       | Default writer set used by the compile API.                  |
| `range.ts`                       | Written-range helpers for sparse byte maps.                  |
| `hex.ts`                         | Low-level Intel HEX record writer.                           |
| `write-bin.ts`                   | Flat binary artifact writer.                                 |
| `write-hex.ts`                   | HEX artifact writer around `hex.ts`.                         |
| `write-d8.ts`                    | Debug80 map writer and source segment grouping.              |
| `write-asm80.ts`                 | Lowered ASM80-compatible source writer.                      |
| `d8-files.ts`                    | D8 source-file and path helpers.                             |
| `d8-helpers.ts`                  | D8 segment and symbol helpers.                               |
| `asm80-expressions.ts`           | ASM80 expression lowering helpers.                           |
| `asm80-expression-evaluation.ts` | ASM80-side constant evaluation for lowering.                 |
| `asm80-instruction-operands.ts`  | ASM80 instruction operand lowering helpers.                  |
| `asm80-instructions.ts`          | ASM80 instruction lowering helpers.                          |
| `asm80-ld-operands.ts`           | ASM80 `ld` operand lowering helpers.                         |
| `asm80-strings.ts`               | ASM80 string rendering helpers.                              |

## `src/register-contracts/`

| File                         | Role                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- |
| `analyze.ts`                 | Main register contract analysis coordinator.                                                            |
| `analyze-helpers.ts`         | Shared helpers for analysis orchestration.                                                              |
| `programModel.ts`            | Builds routines, labels, instructions and direct call boundaries from source items.                     |
| `programModel-boundaries.ts` | Routine-boundary detection helpers.                                                                     |
| `programModel-routines.ts`   | Routine construction helpers.                                                                           |
| `smartComments.ts`           | Parses AZMDoc comments and `.asmi` interface contracts.                                                 |
| `smartCommentBlocks.ts`      | Groups generated and hand-written smart-comment blocks.                                                 |
| `smartCommentParsing.ts`     | Parses smart-comment tokens into contract facts.                                                        |
| `interfaceContracts.ts`      | Parses external `.asmi` interface contracts.                                                            |
| `summary.ts`                 | Infers a routine summary from instruction effects and contracts.                                        |
| `summary-boundary.ts`        | Summary behaviour at routine boundaries.                                                                |
| `summary-contract.ts`        | Contract-to-summary helpers.                                                                            |
| `summary-result.ts`          | Summary result construction.                                                                            |
| `summary-state.ts`           | Mutable summary state helpers.                                                                          |
| `summary-token-transfer.ts`  | Token transfer helpers used during summary inference.                                                   |
| `routine-summaries.ts`       | Computes routine summaries to a fixed point and applies external contracts.                             |
| `summaries.ts`               | Builds summary lookup tables, profile summaries, unknown-boundary diagnostics and candidate fixability. |
| `liveness.ts`                | Computes live register contract units and detects caller/callee conflicts.                              |
| `constants.ts`               | Shared register contract constants.                                                                     |
| `instruction-head.ts`        | Extracts instruction heads for analysis.                                                                |
| `instruction-operands.ts`    | Extracts operands for analysis.                                                                         |
| `instruction-predicates.ts`  | Instruction shape predicates used by analysis.                                                          |
| `operand-register-name.ts`   | Converts operand names into register contract register names.                                           |
| `carriers.ts`                | Normalizes register contract carrier names and expands register pairs.                                  |
| `controlFlow.ts`             | Successor logic for routine instruction flow.                                                           |
| `profiles.ts`                | Built-in external routine profiles such as MON-3.                                                       |
| `report.ts`                  | Renders `.regcontracts.txt`, `.asmi` and compact source contract blocks.                                |
| `annotate.ts`                | Inserts or replaces generated contract blocks near routine labels.                                      |
| `annotations.ts`             | Builds source annotation artifact data.                                                                 |
| `fix.ts`                     | Finds and applies conservative expected-output fixes.                                                   |
| `accept-output.ts`           | Parses user-accepted output candidate options.                                                          |
| `tooling.ts`                 | Editor-friendly register contract diagnostics and code actions.                                         |
| `types.ts`                   | Register contract unit, routine, effect, summary, contract and report types.                            |
| `sourceText.ts`              | Source line splitting and joining helpers for text edits.                                               |
| `boundaryHints.ts`           | Small helpers for naming external service boundaries.                                                   |

## `src/semantics/`

| File                         | Role                                                                      |
| ---------------------------- | ------------------------------------------------------------------------- |
| `expression-evaluation.ts`   | Coordinates expression evaluation against the assembler-time environment. |
| `binary-operators.ts`        | Binary arithmetic, bitwise, comparison and logical operators.             |
| `unary-operators.ts`         | Unary numeric operators.                                                  |
| `constant-operator-types.ts` | Shared constant-operator typing.                                          |
| `constant-operators.ts`      | Constant-operator dispatch.                                               |
| `byte-functions.ts`          | Byte extraction helpers such as `LSB` and `MSB`.                          |
| `layout-evaluation.ts`       | Layout type expression, `sizeof` and `offset` evaluation.                 |
| `layout-format.ts`           | Layout name formatting for diagnostics.                                   |
| `layout-path.ts`             | Field and array path evaluation for layout casts.                         |
| `diagnostics.ts`             | Shared semantic diagnostics.                                              |

## `src/source/`

| File                      | Role                                                     |
| ------------------------- | -------------------------------------------------------- |
| `source-file.ts`          | Creates source file records from name and text.          |
| `logical-lines.ts`        | Splits source text into logical line records.            |
| `source-span.ts`          | Defines source span shape.                               |
| `line-comment-scanner.ts` | Finds semicolon comments while respecting quoted text.   |
| `instruction-chain.ts`    | Splits spaced-backslash instruction lines into segments. |
| `strip-line-comment.ts`   | Removes semicolon comments while respecting quoted text. |

## `src/syntax/`

| File                           | Role                                                  |
| ------------------------------ | ----------------------------------------------------- |
| `parse-line.ts`                | Parses single logical lines into source items.        |
| `expression-tokenizer.ts`      | Tokenizes expression text.                            |
| `parse-token-expression.ts`    | Parses tokenized expressions into ASTs.               |
| `parse-expression.ts`          | Public expression parse wrapper.                      |
| `parse-directive-statement.ts` | Parses directive statements with structured operands. |
| `parse-layout-declarations.ts` | Parses layout declaration forms.                      |
| `parse-layout-expression.ts`   | Parses layout type expressions.                       |
| `parse-diagnostics.ts`         | Shared parse diagnostic helpers.                      |
| `directive-aliases.ts`         | Built-in and project directive alias policy.          |

## `src/tooling/`

| File            | Role                                                                  |
| --------------- | --------------------------------------------------------------------- |
| `api.ts`        | `loadProgramNext()` and `analyzeProgramNext()` for tooling consumers. |
| `case-style.ts` | Mnemonic, register and op-head case-style linting.                    |

## `src/z80/`

| File                     | Role                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `instruction.ts`         | Z80 instruction and operand type model.                                |
| `parse-instruction.ts`   | Dispatches instruction parsing by instruction family.                  |
| `parse-basic.ts`         | Parses basic one-head instruction forms.                               |
| `parse-branch.ts`        | Parses branch and call forms.                                          |
| `parse-conditions.ts`    | Parses condition-code operands.                                        |
| `parse-exchange.ts`      | Parses exchange forms.                                                 |
| `parse-io-control.ts`    | Parses I/O and control forms.                                          |
| `parse-ld.ts`            | Parses `ld` forms.                                                     |
| `parse-operands.ts`      | Parses and classifies instruction operands.                            |
| `operand-split.ts`       | Splits operands while respecting parentheses, strings and expressions. |
| `operand-split-state.ts` | State machine helpers for operand splitting.                           |
| `ld-support.ts`          | Shared `ld` form support.                                              |
| `encode.ts`              | Dispatches encoding by instruction family.                             |
| `encode-core.ts`         | Core encoder helpers.                                                  |
| `encode-ld.ts`           | `ld` encoder.                                                          |
| `encode-ld-helpers.ts`   | Shared `ld` encoder helpers.                                           |
| `effects.ts`             | Describes register and flag effects for Z80 instructions.              |
| `effect-groups.ts`       | Shared effect groups.                                                  |
| `effect-units.ts`        | Effect unit definitions.                                               |

## `test/`

| Directory                              | Role                                             |
| -------------------------------------- | ------------------------------------------------ |
| `test/unit/syntax/`                    | Parser and expression unit tests.                |
| `test/unit/source/`                    | Source-line and comment helpers.                 |
| `test/unit/z80/`                       | Z80 parser and encoder tests.                    |
| `test/unit/outputs/`                   | Artifact writer tests.                           |
| `test/unit/expansion/`                 | Op expansion tests.                              |
| `test/unit/register-contracts/`        | Register contract analysis units.                |
| `test/integration/`                    | Cross-stage compiler tests.                      |
| `test/integration/register-contracts/` | End-to-end register contract tests.              |
| `test/cli/`                            | CLI option, artifact and exit-code contracts.    |
| `test/asm80/`                          | ASM80 compatibility, real-program acceptance and chained-line behaviour. |
| `test/differential/`                   | Differential comparison fixtures and runners.    |
| `test/fixtures/`                       | Source fixture programs.                         |
| `test/helpers/`                        | Shared test setup and helpers.                   |
| `test/types/`                          | Public TypeScript surface checks.                |

## `docs/`

| Directory        | Role                                          |
| ---------------- | --------------------------------------------- |
| `docs/codebase/` | Maintained engineering manual and appendices. |

## `scripts/`

| Directory       | Role                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/ci/`   | CI checks and policy scripts.                                                                                                      |
| `scripts/dev/`  | Developer utilities for alpha guardrails, corpus checks, ASM80 parity, binary mismatch analysis, package smoke tests and coverage. |
| `scripts/` root | General maintenance scripts such as source-size checks and grammar generation.                                                     |
