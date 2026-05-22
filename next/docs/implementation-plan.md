# AZM Next Greenfield Implementation Plan

Status: active implementation plan

## Goal

Build `next/` into a complete AZM workalike that can replace the current
implementation after differential verification against current AZM tests,
fixtures, and corpus comparisons.

## Architecture

AZM Next is a flat assembler pipeline:

```text
source text
  -> logical lines
  -> parsed source items
  -> semantic symbols/constants/layouts
  -> canonical visible assembly
  -> assembly image
  -> serialized outputs
```

The current AZM implementation is the behavioral oracle. Its internal module
structure is not copied.

## Replacement Scope

AZM Next keeps:

- ASM80-class flat Z80 assembly
- directive aliases
- AZMDoc metadata
- register-care contracts
- visible `op` expansion
- enums
- compile-time layout constants
- BIN, HEX, listing, D8, and lowered Z80 output

AZM Next does not keep high-level ZAX source behavior: functions, modules,
imports, generated stack frames, typed assignment, structured control, or
runtime typed effective-address lowering.

## Stage 1: Compatibility Harness

Status: implemented skeleton. The current-AZM runner is an explicit placeholder
and the first differential test is skipped until the runner invokes current AZM.

Purpose: make current AZM usable as the oracle for AZM Next.

Files:

- `next/test/differential/compare-results.ts`
- `next/test/differential/current-azm-runner.ts`
- `next/test/differential/next-azm-runner.ts`
- `next/test/differential/minimal.fixture.test.ts`
- `next/scripts/diff-against-current.mjs`

Completed:

- [x] Defined a comparison result shape.
- [x] Added the AZM Next runner wrapper.
- [x] Added the current AZM runner interface.
- [x] Added the first skipped differential fixture.
- [x] Verified with `npm run next:check`.

Next work:

- [ ] Implement the current AZM runner by invoking the current CLI or package
      API in an isolated temp directory.
- [ ] Unskip the first differential fixture once current output is captured.

## Stage 2: Source and Logical Lines

Status: implemented initial scanner for in-memory source text.

Purpose: convert source text into logical lines with stable source names and
line numbers.

Files:

- `next/src/source/source-file.ts`
- `next/src/source/source-span.ts`
- `next/src/source/logical-lines.ts`
- `next/test/unit/source/logical-lines.test.ts`

Completed:

- [x] Added the source file model.
- [x] Added the source span model.
- [x] Added logical-line scanning with CRLF/CR normalization.
- [x] Added unit coverage for line numbers and trailing newline handling.
- [x] Verified with `npm run next:check`.

Next work:

- [ ] Add include expansion with provenance.
- [ ] Add richer source spans for parsed tokens.

## Stage 3: Minimal Flat Assembler

Status: implemented initial slice.

Purpose: prove the replacement architecture with a small real assembler path.

Files:

- `next/src/model/expression.ts`
- `next/src/model/source-item.ts`
- `next/src/model/symbol.ts`
- `next/src/model/section.ts`
- `next/src/syntax/parse-expression.ts`
- `next/src/syntax/parse-line.ts`
- `next/src/assembly/assemble-program.ts`
- `next/src/outputs/hex.ts`
- `next/src/core/compile.ts`
- `next/test/integration/minimal-assembler.test.ts`

Completed:

- [x] Added parser support for blank lines, comments, labels, canonical `.org`,
      `.equ`, `.db`, `.dw`, `.ds`, `NOP`, `RET`, and `LD A,n`.
- [x] Added built-in alias normalization for `ORG`, `EQU`, `DB`, `DW`, and
      `DS` before canonical directive parsing.
- [x] Preserved strict case sensitivity for programmer-defined symbols while
      accepting mixed-case directive aliases and instruction mnemonics.
- [x] Added expression support for decimal, trailing-`H` hex, `0x` hex, and
      symbol references.
- [x] Added assembly support for symbols, emitted bytes, and the first HEX
      writer.
- [x] Added diagnostics for unsupported source lines and unknown symbols.
- [x] Verified the first milestone fixture:

```asm
        .org 0100H
VALUE   .equ 42
START:
        LD A,VALUE
        RET
```

Expected bytes:

```text
3E 2A C9
```

Expected symbols:

```text
VALUE = 42
START = 0100H
```

Next work:

- [ ] Add forward references through explicit fixups.
- [ ] Add range diagnostics for byte values and storage sizes.
- [ ] Split parser responsibilities further as the surface grows.

## Stage 4: Expressions, Symbols, and Fixups

Status: explicit fixup slice implemented for the minimal Stage 4 surface.

Purpose: make expression evaluation and symbol resolution robust enough for real
assembler source.

Evidence:

- `next/docs/stage-4-evidence.md`

Completed:

- [x] Inspected current AZM tests, fixtures, docs, and AZM book examples for
      expression, symbol, forward-reference, and fixup behavior.
- [x] Documented proven behavior and the staged implementation plan.
- [x] Added expression parsing for decimal, `$` hex, `%` binary, `0x`, `0b`,
      trailing `H`/`B`, one-character quoted literals, unary operators, binary
      operators, parentheses, and current location `$`.
- [x] Added expression evaluation for the existing minimal assembler path.
- [x] Added deferred resolution for forward equates and labels in `.db`, `.dw`,
      `.equ`, `.ds`, `.org`, and `LD A,n`.
- [x] Added diagnostics for unknown symbols, recursive symbols, divide by zero,
      and modulo by zero.
- [x] Added `next/src/model/fixup.ts` with explicit ABS16 and REL8 records.
- [x] Added forward-reference patching for `.dw`, `JP`, `CALL`, `JR`,
      conditional `JR`, and `DJNZ`.
- [x] Added unresolved-symbol fixup diagnostics and REL8 `-128..127` range
      diagnostics.
- [x] Verified with `npm run next:check`.

Planned work:

- Add byte-value and storage-size range diagnostics for directives.
- Add sparse image/range handling before supporting multiple `.org` regions.
- Extend fixups only as each additional instruction family is proven by current
  AZM tests or corpus fixtures.

## Stage 5: Z80 Instruction Parser and Encoder

Status: complete for the retained Stage 5 instruction surface.

Purpose: build the Z80 subsystem as a pure instruction library.

Planned work:

- Add instruction and operand models under `next/src/z80/`.
- Add instruction-family encoders for LD, ALU, control, bit, I/O, and core ops.
- Add parser coverage for Z80 operand forms.
- Keep encoder API pure: instruction in, bytes/fixups/diagnostics out.
- Port behavior through tests rather than copying current modules directly.

Completed first slice:

- [x] Inspected current AZM tests, fixtures, docs, and AZM book examples for the
      retained Z80 instruction surface.
- [x] Documented the proven surface and first implementation boundary in
      `next/docs/stage-5-evidence.md`.
- [x] Added a pure `next/src/z80` instruction model, parser, and byte-template
      encoder for `NOP`, `RET`, `LD A,n`, `JP`, `CALL`, `JR`, conditional `JR`,
      and `DJNZ`.
- [x] Wired the minimal assembler through the pure Z80 encoder while leaving
      expression evaluation and fixup patching in the assembly layer.
- [x] Added the first LD parser/encoder slice for `ld r,n`, `ld r,r`,
      `ld rr,nn`, `ld r,(hl)`, `ld (hl),r`, and accumulator-only `(BC)/(DE)`
      forms.
- [x] Added the first ALU parser/encoder slice for `SUB`, `AND`, `OR`, `XOR`,
      and `CP` with register, immediate, and `(HL)` operands.
- [x] Added the explicit accumulator parser/encoder slice for `ADD`, `ADC`,
      and `SBC` with register, immediate, and `(HL)` source operands.
- [x] Added the 16-bit `HL` arithmetic parser/encoder slice for `ADD HL,ss`,
      `ADC HL,ss`, and `SBC HL,ss`.
- [x] Added the first core-ops parser/encoder slice for `DI`, `EI`, `SCF`,
      `CCF`, `CPL`, `EX DE,HL`, `EX (SP),HL`, `EXX`, and `HALT`.
- [x] Added the IM/RST interrupt-state parser/encoder slice for `IM 0/1/2`,
      numeric constant `RST` vectors, `RETI`, and `RETN`.
- [x] Added the conditional control-flow and indirect `JP` parser/encoder slice
      for `RET cc`, `JP cc,nn`, `CALL cc,nn`, and `JP (HL/IX/IY)`.
- [x] Added the non-displacement `INC`/`DEC`/`PUSH`/`POP` core-ops
      parser/encoder slice, including half-index registers and `IX`/`IY`
      stack pairs.
- [x] Added the indexed addressing foundation slice for `(IX+d)` / `(IY+d)`
      memory operands across the first `LD`, ALU, `INC`, and `DEC` forms.
- [x] Added the indexed `LD` half-register and direct-register slice for
      `IXH`/`IXL`/`IYH`/`IYL`, `LD IX/IY,nn`, and `LD SP,HL/IX/IY`.
- [x] Added the absolute-memory `LD` and `I`/`R` transfer slice for
      `A`/`HL`/`BC`/`DE`/`SP`/`IX`/`IY` absolute loads and stores plus
      `LD I,A`, `LD A,I`, `LD R,A`, and `LD A,R`.
- [x] Added the first non-indexed CB-family bit/rotate/shift slice for
      `BIT`/`RES`/`SET b,r/(HL)` and single-operand
      `RLC`/`RRC`/`RL`/`RR`/`SLA`/`SRA`/`SLL`/`SLS`/`SRL r/(HL)`.
- [x] Added the indexed CB-family bit/rotate/shift and result-copy slice for
      `DDCB`/`FDCB` `BIT`, `RES`, `SET`, `RLC`, `RRC`, `RL`, `RR`, `SLA`,
      `SRA`, `SLL`/`SLS`, and `SRL` forms using `(IX+d)` / `(IY+d)`.
- [x] Added the remaining zero-operand ED/block and accumulator-rotate slice
      for `DAA`, `RLCA`, `RRCA`, `RLA`, `RRA`, `NEG`, `RRD`, `RLD`, block
      transfer/search/I/O mnemonics, plus evidence-backed `IN`/`OUT` port
      forms.
- [x] Added the indexed 16-bit `ADD` and remaining `EX` slice for
      `ADD IX/IY,rr`, `EX AF,AF'`, and `EX (SP),IX/IY`.
- [x] Added the half-index ALU slice for `IXH`/`IXL`/`IYH`/`IYL` operands in
      accumulator `ADD`/`ADC`/`SBC` forms and single-operand
      `SUB`/`AND`/`OR`/`XOR`/`CP` forms.
- [x] Completed the Stage 5 diagnostic parity closeout sweep for the retained
      instruction surface, including malformed `ADC`/`SBC` destination and
      `HL` register-pair diagnostics.

## Stage 6: Directives, Storage, Strings, Ranges, and Image

Status: complete for the evidence-backed Stage 6 closeout surface.

Purpose: support real ASM80-style source files and stable output images.

Evidence:

- `next/docs/stage-6-evidence.md`

Completed:

- [x] Extended directive aliases for `CSTR`, `PSTR`, `ISTR`, `ALIGN`, `END`,
      `BINFROM`, and `BINTO`.
- [x] Implemented `.cstr`, `.pstr`, and `.istr` string storage forms.
- [x] Implemented `.db` quoted string fragments while preserving quoted
      one-character expressions.
- [x] Implemented `.ds` reserve storage, `.ds` fill values, and trailing
      reserve-only binary trimming.
- [x] Implemented `.align` zero padding.
- [x] Implemented `.end` emission cutoff with post-`.end` binary range controls.
- [x] Implemented `.binfrom` and inclusive `.binto` output range selection and
      zero padding.
- [x] Replaced append-only emission with an address-keyed assembly image so
      multiple `.org` blocks are placed by address rather than source order.
- [x] Verified BIN-compatible `bytes` and HEX output against the selected image
      range.

Planned follow-up:

- Add directive range diagnostics for negative `.ds`, invalid fill bytes, and
  invalid binary bounds when current AZM behavior is pinned down.
- Start differential checks for simple ASM80 programs once the current-AZM
  runner is wired.

## Stage 7: Enums and Layout Constants

Status: enum constant and first layout-size slices implemented.

Purpose: add retained AZM compile-time metadata without recreating a type
system.

Planned work:

- [x] Inspect current AZM tests, fixtures, docs, and AZM book examples for
      retained enum and layout behavior.
- [x] Document proven behavior in `next/docs/stage-7-evidence.md`.
- [x] Implement enum constants and qualified enum members for `.equ`,
      instruction immediates, `.db`, `.dw`, and `.ds`.
- [x] Reject unqualified enum member references.
- [x] Implement first layout-size slice for `.type` blocks with `.field n`,
      `.byte`, `.word`, and `.addr` fields.
- [x] Implement `sizeof(byte/word/addr)`, `sizeof(NamedRecord)`, and simple
      `offset(NamedRecord, field)` constants.
- Implement `.union`, `.field NamedType`, arrays, nested offsets, and `.ds`
  type expressions.
- Implement layout casts as constant folding only.
- Reject runtime typed memory behavior.

## Stage 8: Source Compatibility and Diagnostic Hardening

Status: complete for the evidence-backed Stage 8 boundary.

Purpose: harden the retained Stage 7 surface without changing AZM semantics.

Evidence:

- `next/docs/stage-8-evidence.md`

Completed:

- [x] Preserved strict case sensitivity for programmer-defined labels,
      constants, enums, layouts, and fields.
- [x] Preserved case-insensitive mnemonics, registers, conditions, and
      canonical directive aliases where evidence supports them.
- [x] Added diagnostics for malformed retained syntax rather than accepting
      generic assembler guesses.
- [x] Verified with `npm run next:check`.

## Stage 9: Visible `op` Expansion

Status: complete for the current AZM Next visible-op boundary.

Purpose: expand retained `op` declarations into canonical visible assembly.

Evidence:

- `next/docs/stage-9-evidence.md`

Completed:

- [x] Parsed visible `op` declarations and matcher parameters.
- [x] Selected overloads deterministically.
- [x] Substituted operands into op bodies.
- [x] Fed expanded items into the same canonical stream used by assembly.
- [x] Documented deferred register-care-specific behavior in the Stage 9
      evidence file.
- [x] Verified with `npm run next:check`.

## Stage 10: First Output/API Parity Slice

Status: complete.

Purpose: establish the first evidence-backed in-memory output surface before
adding filesystem or package entry points.

Evidence:

- `next/docs/stage-10-evidence.md`

Completed:

- [x] Inspected current AZM CLI, compile API, output writer, and public API
      tests.
- [x] Added `compileNextArtifacts()` for in-memory BIN and HEX artifacts.
- [x] Added independent BIN/HEX suppression.
- [x] Added no-artifacts-on-error behavior.
- [x] Added current CLI-style diagnostic formatting for AZM Next diagnostics.
- [x] Added integration tests and updated the parity matrix.
- [x] Verified with `npm run next:check`.

## Remaining Stage Control

Status: locked planning rule.

The remaining replacement work is limited to Stages 11-16 below. New evidence
may change the contents of a stage, but it must not create a new stage without
explicit approval. If a missing requirement is discovered, classify it as one of:

- belongs in an existing Stage 11-16 scope
- out of replacement scope
- blocker requiring user approval before the plan changes

Each remaining stage must finish by committing, opening a PR, review with an
agent when the thread/tool limit allows it, merging if clear, and suggesting the
next goal.

## Stage 11: Source Host and Programming Load API Parity

Status: first evidence-backed tooling API slice implemented.

Purpose: make AZM Next usable as a programming library for source loading and
analysis setup, not only as a CLI.

Evidence to inspect:

- `docs/reference/tooling-api.md`
- `test/public_api_surface.test.ts`
- `test/sourceLoader_asm_include.test.ts`
- current `src/api-tooling.ts`
- current `src/sourceLoader.ts`
- current package export tests for `@jhlagado/azm/tooling` and root re-exports
- include-related CLI failure tests
- `next/docs/stage-11-evidence.md`

Planned work:

- [x] Implement a Node filesystem source host under `next/src`.
- [x] Implement entry-file loading with explicit include directories.
- [x] Support preloaded entry text for editor/Debug80-style unsaved buffers.
- [x] Preserve source names, line numbers, and included-file provenance in
      diagnostics.
- [x] Add the AZM Next equivalent of `loadProgram()` for the retained source model.
- [x] Add the first AZM Next equivalent of `analyzeProgram()` only for behavior
      already backed by current tests.
- [x] Match current public `loadProgram()` option/type commitments where retained:
      `entryFile`, `includeDirs`, `preloadedText`, `signal?: AbortSignal`, loaded
      program shape, diagnostics, and exported tooling types.
- [x] Assign package export parity for `@jhlagado/azm/tooling` and root re-exports
      of `loadProgram()` and `analyzeProgram()` to this stage.
- [x] Update or add public tooling API docs/tests for the implemented Stage 11
      library slice.
- [x] Keep this API independent from CLI argument parsing.
- [x] Update the parity matrix for source loading, include provenance, and tooling
      API status.

Justification:

The CLI is only one entry point. Debug80, editors, tests, and other tools need a
library interface that can load and analyze source without writing files.

## Stage 12: Compile API and Complete Public Artifact Parity

Status: in progress, evidence-backed implementation in place.

Purpose: make AZM Next usable as a programming library for full assembly and
artifact generation.

Evidence to inspect:

- `docs/reference/tooling-api.md`
- `test/public_api_surface.test.ts`
- `test/determinism_artifacts.test.ts`
- `test/pr39_listing.test.ts`
- `test/backend/d8m*`
- `test/backend/pr1048_write_asm80_unit.test.ts`
- `test/backend/pr991_asm80_comment_preservation.test.ts`
- `test/cli/pr990_asm80_emitter_validation.test.ts`
- current `src/api-compile.ts`
- current `src/compile.ts`
- current `src/formats/*`
- current package export tests for `@jhlagado/azm/compile` and root re-exports

Planned work:

- Define the AZM Next compile API shape that maps to current `compile()`:
  diagnostics plus in-memory artifacts.
- Export `compile`, `defaultFormatWriters`, `FormatWriters`, artifact types, and
  D8 types from the future `@jhlagado/azm/compile` public surface.
- Assign package export parity for `@jhlagado/azm/compile` and root compile
  re-exports to this stage.
- Complete artifact kinds needed for replacement: BIN, HEX, listing, D8, and
  lowered `.z80`.
- Preserve artifact determinism across repeated compiles.
- Support artifact suppression options through the programming API.
- Preserve D8 constants versus addressable labels shape.
- Preserve lowered `.z80` comment behavior where current tests prove it.
- Update or add public compile API docs/tests for the implemented Stage 12
  library slice.
- Update the parity matrix for BIN, HEX, listing, D8, lowered `.z80`, and
  public compile API status.

Justification:

The programming compile API is a public contract. It must be planned and tested
as a first-class path rather than treated as a side effect of CLI work.

## Stage 13: CLI Parity Thin Wrapper

Status: in progress.

Purpose: implement the command-line entry point as a thin wrapper around the
Stage 11 source host and Stage 12 compile API.

Evidence to inspect:

- `docs/reference/cli.md`
- `test/cli/cli_contract_matrix.test.ts`
- `test/cli/cli_artifacts.test.ts`
- `test/cli/cli_failure_contract_matrix.test.ts`
- `test/cli/cli_determinism_contract.test.ts`
- `test/cli/cli_source_extension.test.ts`
- `test/cli/cli_path_parity_contract.test.ts`
- `test/cli/cli_acceptance_matrix_strictness.test.ts`
- current package export tests for `@jhlagado/azm/cli` and `bin.azm`
- current `src/cli.ts`

Planned work:

- Implement documented CLI option parsing for retained flags.
- Enforce entry argument count and entry-last ordering.
- Validate source extensions exactly where current CLI tests prove rejection,
  including non-entry `.asmi` handling.
- Resolve default output paths and `--type hex|bin` extension behavior.
- Normalize uppercase `.HEX` and `.BIN` output extensions to canonical lowercase
  output paths where current tests prove that behavior.
- Preserve relative versus absolute path artifact payload parity.
- Create nested output directories before writing artifacts.
- Pin the default CLI artifact set to current evidence: `.hex`, `.bin`, `.lst`,
  and `.d8.json`; lowered `.z80`, `.regcare.txt`, and `.asmi` remain flag-gated.
- Preserve strict artifact payload parity across `--type`, `--nobin`, `--nohex`,
  `--nod8m`, and `--nolist` combinations.
- Write artifacts to disk using the compile API's in-memory artifacts.
- Print the primary output path to stdout on success.
- Return current-compatible exit codes for success, source diagnostics, and CLI
  usage errors.
- Preserve current-style diagnostic stderr formatting.
- Assign package export parity for `@jhlagado/azm/cli` and `bin.azm` to this
  stage.
- Update the parity matrix for CLI flags and output paths.

Current slice completed:

- Parse register-care CLI options and aliases in `next/src/cli.ts`.
- Parse/validate `--accept-out` and `.asmi` interface inputs in `next/src/api-compile.ts`.
- Added unit/integration evidence-backed tests for malformed mappings, malformed interfaces,
  non-`.asmi` interface extension handling, and accept-output validation.
- Added `next/docs/stage-14-evidence.md`.

Remaining Stage 14 scope:

- Register-care summary/report emission in-memory artifacts.
- Contract merge/inference and routine effect/liveness analysis.
- Source annotation and fixup pipelines.
- Register-care artifact output handling in CLI artifact writer.

Justification:

The CLI should not own assembler semantics. It should prove that the library
API can be driven through the same user-facing command contract as current AZM.

## Stage 14: AZMDoc and Register-Care Parity

Status: in progress.

Purpose: finish retained AZM-specific register-care behavior as a high-priority
public feature.

Evidence to inspect:

- `docs/spec/azmdoc.md`
- `docs/reference/tooling-api.md`
- `test/registerCare/*`
- current register-care implementation and CLI tests
- current `.asmi` interface tests and register-care artifact tests
- Stage 9 visible-op evidence

Planned work:

- Parse retained AZMDoc register-care contracts.
- Parse and load external `.asmi` register-care interfaces.
- Merge explicit `.asmi` contracts with source-local AZMDoc contracts.
- Detect routine boundaries from canonical visible assembly.
- Share Z80 effect metadata with the encoder rather than duplicating opcode
  knowledge.
- Analyze expanded `op` bodies through the canonical visible stream.
- Match retained register-care tooling and CLI audit behavior.
- Add programmatic register-care tooling output for editor/Debug80 use.
- Match retained source mutation behavior for generated contracts,
  conservative `--fix` edits, and caller `expects out` hints.
- Keep Stage 13 responsible only for register-care CLI flag plumbing; this stage
  owns register-care semantics and generated artifact content.
- Update the parity matrix for register-care contracts and summaries.

Justification:

Register-care is one of AZM's most important and unique features. No shortcuts
are allowed here: every behavior must be pinned to current AZM tests, docs,
fixtures, or observable current implementation behavior before it is ported.
This stage must preserve subtle current behavior rather than replacing it with a
generic register linter.

## Stage 15: Retained Language Parity Closeout

Status: in progress.

Purpose: close the remaining partial or not-started retained language behavior
before corpus burn-in.

Evidence to inspect:

- `docs/design/asm80-compatibility-baseline.md`
- `docs/spec/azm-assembly-baseline.md`
- current ASM80, directive, enum, layout, op, expression, and diagnostic tests
- AZM book examples in the sibling `debug80-docs` checkout when available

Planned work:

- Audit every `partial` and `not started` language row in
  `next/docs/parity-matrix.md`.
- Finish or explicitly classify directive aliases, string directives,
  alignment, binary ranges, layout casts, local-label behavior, expressions,
  fixup diagnostics, and visible `op` edge cases.
- Preserve the strict case policy: symbols and user names are case-sensitive;
  mnemonics, registers, conditions, and proven directive aliases are
  case-insensitive.
- Reject generic assembler features unless current AZM evidence brings them
  into scope.
- Update each parity row to `compatible`, `intentionally different`, or a
  named blocker.

Current slice completed:

- Lowered ASM80/source emission slice:
  - Added artifact writer and API/CLI plumbing needed for `--asm80` output.
  - Emits normalized expanded source text with file provenance markers for all
    included files.
  - Added evidence-backed integration test for lowered output artifact generation.
  - Added/updated stage-15 evidence documentation with boundary.

Justification:

This is the anti-hallucination stage. It forces every retained language feature
to be traced to current AZM evidence before the replacement is treated as real.

## Stage 16: Differential Burn-In and Promotion

Status: not started.

Purpose: prove replacement readiness and perform the mechanical cutover only
after observable parity is documented.

Evidence to inspect:

- `next/docs/source-of-truth.md`
- `next/docs/promotion-criteria.md`
- current AZM alpha guardrails
- current fixture and corpus comparison scripts
- local ASM80 corpora when available

Planned work:

- Implement the current-AZM runner for differential tests.
- Unskip the first differential fixture.
- Add AZM Next equivalents for the current guardrail suites.
- Run fixture and corpus comparisons for retained behavior.
- Run or port the public API/package smoke tests, including package export map,
  root re-exports, `./tooling`, `./compile`, `./cli`, `./package.json`, and
  `bin.azm`.
- Run lowered `.z80` external validation where the current test suite proves it.
- Run quality gates from `docs/reference/code-quality-standard.md`, including
  lint, Fallow where applicable, and source-file-size checks.
- Classify every mismatch as AZM Next bug, current AZM bug, intentional spec
  tightening, historical out-of-scope behavior, or unresolved blocker.
- Confirm every promotion criterion is either satisfied or explicitly
  classified.
- Prepare the mechanical promotion plan for moving `next/src`, `next/test`,
  `next/scripts`, and relevant docs to the root.
- Do not promote until the user approves the cutover.

Justification:

This is the proof stage. It prevents replacing the old implementation on trust,
intent, or isolated unit tests.

## Verification Baseline

Run after each stage:

```sh
npm run next:check
npx prettier -c "next/**/*.{md,json,ts,mjs}"
git diff --check -- next
```

When a stage touches compatibility behavior, also run the stage's differential
tests and update `next/docs/parity-matrix.md`.
