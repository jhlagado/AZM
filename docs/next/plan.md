# AZM Next Completion Plan

Status: active referent for cutover and finalization work

This is the single `docs/next` plan document. It replaces the older staged
implementation plans, parity matrix, promotion criteria, source-of-truth notes,
architecture sketch, and stage evidence files.

## Current State

AZM Next has been promoted to the repository-root implementation under `src/`.
The old implementation is quarantined under `legacy-root-azm/` and remains the
oracle for differential tests.

The original Stages 1-16 are complete as historical delivery slices. Current
work is finalization: closing remaining compatibility gaps, making the public
CLI and artifact contracts unsurprising, and aligning the physical source tree
with the documented architecture.

## Source of Truth

AZM Next is a greenfield implementation, not a greenfield language design.
Observable behavior must be derived in this order:

1. Current repository tests and fixtures.
2. Current AZM implementation behavior, especially through differential tests.
3. Existing docs and AZM book examples.
4. Explicit user-approved decisions for intentional differences.

Treat unsupported or uncertain behavior as unsupported until evidence proves it
belongs in the retained AZM surface. Mark inferences as inferences in PR notes.

Only intentional differences should survive cutover. Classify every mismatch as
one of:

- AZM Next bug
- current AZM bug
- intentional spec tightening
- historical behavior outside the replacement target
- undefined behavior now made explicit

## Architecture Target

The target is a flat ASM80-class Z80 assembler with retained AZM extensions:
directive aliases, AZMDoc metadata, register-care contracts, visible `op`
expansion, enums, and compile-time layout constants.

Everything accepted by the compiler should be one of:

- visible assembly
- compile-time metadata
- output serialization

Hidden typed memory operations, generated frames, structured high-level control
flow, and module/function lowering are not part of AZM Next.

The intended module map is:

```text
src/
  core/           compile orchestration and public contracts
  source/         source files, logical lines, include expansion, provenance
  syntax/         parsing, directive aliases, expressions, operands
  model/          shared data structures with no compiler dependencies
  semantics/      constants, layouts, symbols, validation
  expansion/      op registry, matching, substitution, local-label handling
  assembly/       directives, instruction assembly, sections, fixups, images
  z80/            instruction model, encoder, effects, formatting
  register-care/  AZMDoc contracts, routine model, effects, summaries
  outputs/        BIN, HEX, listing, D8, lowered Z80 writers
  node/           filesystem host and Node-specific integration
  cli/            command-line argument parsing and process adapter
```

Current known drift from that map:

- `src/core/op-expansion.ts` still owns expansion logic intended for
  `src/expansion/`.
- layout and validation logic still partly lives in
  `src/assembly/expression-evaluation.ts` and compile orchestration instead of
  `src/semantics/`.
- Node host responsibilities still live in `src/tooling/source-host.ts`.
- the CLI still lives in root `src/cli.ts` instead of `src/cli/`.
- `src/formats/` still re-exports legacy format types while `src/outputs/`
  owns the promoted artifact writers.

These are finalization tasks. They are not a reason to invent new behavior.

## Parity Status

Compatible rows:

- Source loading
- Include provenance
- Logical line parsing
- Directive aliases
- Labels and local labels
- Immediate expressions
- Current-location `$`
- Forward equates
- Explicit fixup records
- Z80 operand parsing
- Z80 encoding
- `.org` / `ORG`
- `.equ` / `EQU`
- `.db` / `DB`
- `.dw` / `DW`
- `.ds` / `DS`
- String directives
- Alignment
- Binary ranges
- Enums
- Layout declarations
- `sizeof`
- `offset`
- Layout casts
- Visible `op` declarations
- Op overload matching
- Op expansion local labels
- Register-care contracts
- Register-care summaries
- BIN output
- HEX output
- CLI flags
- Public compile API
- Tooling API

Partial rows:

- Lowered `.z80` output: expanded-source passthrough exists, but there is no
  golden comparison to current AZM or external ASM80 validator parity.
- Listing output: emitted for API and CLI paths, but full golden comparison
  against current listing output is not in the differential gate.
- D8 debug map: emitted and shape-tested, but not corpus-gated for full content
  parity.

Current differential status:

- Supported root differential fixtures: 66.
- Unsupported root fixtures: 21.
- Unsupported roster: `test/differential/unsupported-fixtures.ts`.
- Remaining buckets: `diagnostic-wording` and `visible-op-diagnostic`.

## Remaining Tasks

### 1. CLI Contract Closure

Goal: remove surprise from the cutover CLI surface.

Status: complete.

Completed tasks:

- Inspect legacy CLI contract tests and promoted CLI tests.
- Add contract coverage for remaining documented flags.
- Lock down default artifact emission and output path behavior.
- Lock down register-care CLI flag handling.
- Ensure package smoke and public-surface tests match the documented CLI/API
  contracts.

Current proven sub-slice:

- `test/cli` is restored as an active slow-reliability lane.
- `--aliases <file>` is accepted by the CLI, passed through the compile API as
  `directiveAliasFiles`, and supports project directive aliases that extend the
  built-in `azm` profile.
- Project alias files reject collisions with built-in AZM aliases.
- Built-in aliases remain active by default.
- `--case-style` linting is restored across CLI, compile API, and tooling
  analysis. It emits warnings without failing assembly and preserves the legacy
  boundary that labels and hex immediates are not linted as mnemonic/register
  tokens.
- The restored `test/cli` lane now mirrors the source-extension and failure
  contract surface for missing files, source diagnostics, range diagnostics,
  parse-error usage text, uppercase output extensions, and rejected non-source
  entry extensions.
- Register-care CLI flag handling remains covered by the promoted Stage 14 CLI
  integration tests.

Exit condition:

- Met. `CLI flags` moved from partial to compatible.

### 2. Listing and D8 Output Parity

Goal: make listing and D8 emitted artifacts evidence-backed contracts, not only
available outputs.

Tasks:

- Add golden comparisons or corpus-backed checks for listing output.
- Add shape and content parity checks for D8 debug metadata.
- Extend differential tooling if artifact comparison belongs there.

Current proven sub-slice:

- Listing writer tests now preserve the legacy deterministic byte-dump contract
  for sparse bytes, full-line sparse gap compression, and sparse segment edge
  rendering.
- D8 writer tests now preserve the legacy debug-map contract for sparse global
  segments, deterministic symbol sorting, source-attributed per-file segments,
  and fallback per-file ownership when no addressed symbol claims a segment.
- The shared emitted-byte map model carries source-attributed D8 segments, and
  promoted assembly now populates high-confidence code/data/directive segments
  from emitted source spans for compile API D8 output.
- Full Listing/D8 compatibility still needs corpus-backed artifact comparison
  before the rows can move to compatible.

Exit condition:

- `Listing output` and `D8 debug map` can move from partial to compatible.

### 3. Lowered `.z80` Validation

Goal: close the last major emitted-artifact parity gap before real-program
validation.

Tasks:

- Compare lowered `.z80` output against the current AZM path.
- Add validator-backed or corpus-backed checks where available.
- Document any approved boundary if exact parity is intentionally not required.

Exit condition:

- `Lowered .z80 output` moves to compatible, or an explicit approved boundary
  is recorded here.

### 4. Unsupported Fixture Burn-Down

Goal: reduce the unsupported differential roster until only explicitly accepted
exceptions remain.

Tasks:

- Burn down `visible-op-diagnostic` fixtures where behavior can be matched or
  intentionally tightened.
- Burn down `diagnostic-wording` fixtures where current AZM wording is retained.
- For every fixture left unsupported, write the accepted reason in
  `test/differential/unsupported-fixtures.ts` and in this plan.

Exit condition:

- The unsupported roster is empty or reduced to an explicitly approved residue.

### 5. Register-Care Precision Closure

Goal: preserve register-care as a first-class AZM feature, beyond the already
compatible contract parsing and summary surface.

Current compatible boundary:

- `.asmi` interface validation.
- register-care contract parsing through CLI and compile API.
- register-care report summaries for the currently tested routine model.
- register-care tooling diagnostics and code actions for the implemented output
  candidate checks.

Remaining tasks:

- Complete control-flow-aware auto-fix classification for output candidates.
- Improve multi-path and value-flow precision where the current analysis is
  intentionally conservative.
- Fill incomplete Z80 effect coverage so unsupported or weakly modeled
  mnemonics do not silently miss register conflicts.
- Extend `registerCareProfile` handling beyond the current RST boundary naming
  behavior when evidence from existing AZM behavior requires it.
- Add tests for any precision upgrade before changing diagnostics or fix
  behavior.

Exit condition:

- Remaining register-care limitations are either covered by tests and fixed, or
  explicitly classified here as accepted conservative behavior.

### 6. Architecture Map Alignment

Goal: make the physical source tree match the architecture target, or update
this plan where the physical layout is intentionally different.

Tasks:

- Move/split op expansion responsibility from `src/core/op-expansion.ts` into
  `src/expansion/`.
- Extract layout and validation logic into `src/semantics/`.
- Move filesystem host responsibilities into `src/node/`.
- Split CLI adapter responsibilities into `src/cli/`.
- Resolve `src/outputs/` versus `src/formats/` duplication.
- Remove empty placeholder directories once they are either populated or
  declared unnecessary.

Exit condition:

- A maintainer can use the architecture map above to find the live code they
  need without hitting empty placeholders or transition duplicates.

### 7. Large-File Decomposition

Goal: reduce concentrated maintenance risk in oversized coordinator files.

Current size pressure:

- `src/core/op-expansion.ts`: above hard cap, allowlisted as a temporary
  finalization bridge.
- `src/z80/encode.ts`: above hard cap, allowlisted as a dense encoder table.
- `src/z80/parse-instruction.ts`: above hard cap, allowlisted as a dense parser
  table.
- `src/register-care/analyze.ts`: soft-limit warning.
- `src/assembly/assemble-program.ts`: soft-limit warning.
- `src/cli.ts`: review-trigger warning.
- `src/syntax/parse-expression.ts`: review-trigger warning.
- `src/assembly/expression-evaluation.ts`: review-trigger warning.

Tasks:

- Split `src/core/op-expansion.ts` as part of the architecture alignment work.
- Split `src/register-care/analyze.ts` by analysis phase.
- Split `src/assembly/assemble-program.ts` by address planning and emission.
- Split `src/cli.ts` into parse/run/process adapter pieces.
- Keep `src/z80/encode.ts` and `src/z80/parse-instruction.ts` allowlisted only
  while their table density is more readable than family splits.

Exit condition:

- Remaining large files are either split or deliberately justified in
  `scripts/source-file-size-allowlist.json`.

### 8. Real-Program Validation

Goal: prove the cutover against real programs after feature-completeness
blockers are closed.

Run in this order:

1. tetro
2. paco
3. MON3 monitor ROM software

Compare generated binary output against the legacy AZM assembler. If validation
finds a missing retained feature, return that item to this plan before cutover.

## Cutover Blockers

Do not attempt the final cutover claim while any of these remain unclosed or
unapproved:

- Any partial parity row that affects source loading, visible assembly meaning,
  CLI behavior, or emitted artifact contracts.
- The unsupported root fixture roster, unless it is reduced to an explicitly
  accepted residue.
- Module-boundary drift large enough to make this architecture map misleading.
- Transition duplication that obscures which implementation surface is real.
- Unjustified hard-cap source files.

## Validation Commands

Use narrow checks first, then broader gates.

Core local checks:

```sh
npm run typecheck
npm run lint
npm run check:source-file-sizes
npm run check:fixture-coverage
npm run test:ci:coverage-core
npm run test:ci:slow-reliability
npm run next:diff-current:all
npm run test:package
```

For broad finalization PRs:

```sh
npm run next:guardrails
```

Optional external corpus checks:

```sh
npm run test:azm:corpus
npm run test:asm80:baseline
npm run test:asm80:tetro
```

## PR Process

Each finalization slice must:

- close one clear gap or one tightly related group of gaps
- update this plan when parity or blocker status changes
- include tests that prove the behavior boundary
- run the narrow relevant validation first, then the broader guardrail lane
- receive a subagent review focused on regressions, hidden scope growth, and
  evidence coverage before merge
- merge before the next stage begins

## Definition of Ready for Cutover Attempt

AZM is ready for the cutover attempt only when:

- no unapproved cutover blocker remains in this plan
- user-visible parity rows are compatible
- the unsupported differential roster is explicitly accepted or empty
- CLI, package, listing, D8, and lowered `.z80` contracts have evidence-backed
  validation
- quality and architecture docs are trustworthy maps of the live codebase
- real-program validation for tetro, paco, and MON3 is queued next
