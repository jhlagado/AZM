# Handover One: AZM Native Assembler Surface

Status: active handover
Date: 2026-05-20
Branch: `codex/azm-native-lowering-increment`
Base: `main`

## Purpose

This handover captures the current AZM direction, what has been completed on
this branch, what remains directly ahead, and the longer plan for removing all
ZAX-facing behavior once AZM has a complete assembler-shaped surface.

The goal is for AZM to become an ASM80-class Z80 assembler with a small set of
explicit extensions:

- ASM80-style flat source: `org`, labels, Z80 instructions, `.db`/`.dw`/`.ds`,
  `.equ`, includes, and fixups.
- Register-care and AZMDoc / `.azmi` contracts.
- Visible `op` expansion.
- Directive aliases where they normalize existing assembler vocabulary.
- Layout metadata used only for compile-time constants: `type`, `union`,
  `sizeof`, `offset`, and layout-cast address constants.

AZM native source should not be a high-level language. It should not hide
runtime work behind typed assignment, structured control, function frames,
typed storage declarations, or named section blocks.

## Product Boundary

AZM keeps:

- `.asm` / `.z80` ASM80-compatible input paths for the corpus foundation.
- `.azm` native flat assembler modules.
- Z80 instruction encoding, labels, relative and absolute fixups, and artifact
  writers.
- `op` declarations as visible macro-instruction expansion.
- Register-care analysis and reporting.
- Layout constants as compile-time expression support.

AZM removes from native `.azm`:

- `func` and `export func`.
- `section code ...` / `section data ...` named blocks.
- `:=` typed assignment.
- Structured control (`if`, `while`, `repeat`, `select`) as language syntax.
- Typed `data`, `var`, `globals`, and typed `extern func`.
- Runtime typed effective-address lowering.
- Any generated stack frame, argument marshalling, or typed memory pipeline.

The compatibility lane remains temporary:

- `.zax` keeps old structured-assembler behavior until tests are quarantined,
  rewritten, or deleted.
- `.asm` / `.z80` remain assembler compatibility inputs and are not part of the
  ZAX removal target.

## What Landed Before This Branch

PR #7 established the first flat AZM surface:

- Layout-cast constants fold at compile time.
- `.azm` rejects `func` and named `section` blocks.
- Flat labels and Z80 instructions parse at module scope.
- AZM700 diagnostics mark remaining inherited ZAX constructs.
- Alpha guardrails exist through `npm run test:azm:alpha`.
- The removal inventory and expression/visibility design docs define the
  product boundary:
  - `docs/audits/azm-removal-inventory.md`
  - `docs/design/azm-expression-and-visibility.md`
  - `docs/superpowers/plans/2026-05-20-azm-native-lowering-increment.md`

## Work Completed On This Branch

### Commit `55a2113`: native AZM instruction lowering

This commit made flat `.azm` compile through the same instruction capability
used by function bodies, but without creating function behavior.

Key files:

- `src/lowering/nativeAsmLowering.ts`
- `src/lowering/functionLoweringPhases.ts`
- `src/lowering/programLoweringTraversal.ts`

Behavior:

- Module-scope `.azm` `AsmInstruction` no longer goes directly through only
  `lowerClassicInstruction`.
- Native `.azm` instructions now get:
  - visible `op` expansion,
  - full `ld` and effective-address handling where it remains constant-safe,
  - existing Z80 encoding and fixup behavior.
- The native path uses `runNativeModuleAsmFramePhase`, which deliberately does
  not initialize a ZAX function frame. There is no prologue, epilogue,
  synthetic return label, local storage, or typed call boundary.

Tests moved toward native `.azm`:

- `test/registerCare/opExpansion.integration.test.ts`
  - the binary expansion test now uses `.azm`, not a `.zax` wrapper.
- `test/semantics/layout_cast_constants_azm.test.ts`
  - layout-cast compile tests now use flat `.azm`.
- `test/semantics/layout_constants_azm.test.ts`
  - layout constant tests now use labels and `ret`, not `export func`.

### Commit `55a2113`: parser and surface hardening

The same commit also moved the surface away from warn-and-continue behavior.

Key files:

- `src/frontend/azmDeprecations.ts`
- `src/frontend/parseAzmAsmStream.ts`
- `src/frontend/parseAzmClassicModuleLine.ts`
- `src/frontend/parseModuleItemDispatch.ts`
- `scripts/dev/run-azm-alpha-guardrails.mjs`

Behavior:

- AZM700 diagnostics for inherited ZAX constructs are now errors for native
  `.azm`.
- Typed assignment, structured control, typed effective addresses, typed
  storage, and typed extern declarations stop compilation in `.azm`.
- Unsupported `Unimplemented` asm parse results now produce a diagnostic
  instead of being silently dropped.
- `parseAzmClassicModuleLine.ts` adds flat native parsing for ASM80-style
  module directives:
  - `.db` / `.dw` / `.ds`
  - `.equ`
  - `org` / `.org`
  - `align`
  - `binfrom` / `binto`
  - `end`
- The alpha guardrail script now includes the native AZM frontend and layout
  tests.

### Commit `8a0e6cf`: flat AZM `org` data placement

This commit made the north-star flat assembler layout work without named
sections.

Key files:

- `src/lowering/classicDirectiveLowering.ts`
- `src/lowering/programLoweringTraversal.ts`
- `test/frontend/azm_flat_module_asm.test.ts`

Behavior:

- `org` now applies to the active placement section rather than always forcing
  `code`.
- For native `.azm`, traversal looks ahead after an `org`:
  - if the next meaningful item is raw data, the `org` targets `data`;
  - otherwise, it targets `code`.
- Labels between `org` and raw data are skipped during this lookahead.

The covered north-star shape now compiles:

```asm
type Sprite
  x: byte
  y: byte
  flags: byte
end

org $2000
SPRITES:
  ds sizeof(Sprite[16])

org $0100
main:
  ld a,(<Sprite[16]>SPRITES[0].flags)
  ret
```

## Current Verification

At the end of the branch work:

```sh
npm run test:azm:alpha
```

passes with:

- 21 test files
- 240 tests

Focused tests that were run during the increments:

- `test/frontend/azm_flat_module_asm.test.ts`
- `test/frontend/azm_native_boundary.test.ts`
- `test/frontend/azm_source_mode_deprecations.test.ts`
- `test/semantics/layout_cast_constants_azm.test.ts`
- `test/semantics/layout_constants_azm.test.ts`
- `test/registerCare/opExpansion.integration.test.ts`

## Important Clarification: "Lowering" In The Codebase

The word `lowering` currently means two different things.

Implementation lowering is still needed:

- choosing Z80 encodings,
- emitting bytes,
- recording label fixups,
- placing sections,
- resolving symbols,
- producing binary/hex/listing artifacts.

That is normal assembler backend work, even if the directory is named
`src/lowering`.

ZAX-style hidden lowering should be removed from native AZM:

- generated function frames,
- typed call argument marshalling,
- typed assignment,
- runtime address materialization,
- structured control expansion,
- named section block layout,
- typed storage initialization.

Do not delete the entire backend just because it is called `lowering`. The
right end state is either:

1. keep the assembler backend but rename/reorganize it around emission, or
2. delete only the ZAX-specific lowering subsystems once compatibility tests are
   quarantined or removed.

## Direct Roadmap Ahead

### 1. Finish native flat assembler surface

Immediate goal: make `.azm` feel like a strict assembler with the approved
extensions.

Tasks:

- Keep hard errors for rejected ZAX constructs.
- Add or tighten tests for:
  - typed `data` / `var` / `globals` rejection,
  - typed `extern func` rejection,
  - structured control rejection at module scope,
  - unsupported asm syntax diagnostics,
  - `org` + labels + `.db` / `.dw` / `.ds` combinations.
- Confirm `.equ` aliases, directive aliases, and includes are covered in native
  or ASM80 guardrails.
- Decide whether native `.azm` should accept leading-dot directives only,
  bare directives only, or both. Current behavior accepts both in the relevant
  places where supported.

### 2. Track C: quarantine ZAX tests

Goal: default CI should represent AZM, not the inherited ZAX language.

Tasks:

- Use `docs/audits/zax-test-retirement-map.md` as the source of truth.
- Move or mark old high-level tests into a compatibility lane:
  - `func` frame tests,
  - structured control lowering tests,
  - typed assignment tests,
  - typed data / var / extern tests,
  - hidden typed EA runtime tests.
- Keep or rewrite tests that protect AZM foundations:
  - Z80 encoders,
  - ASM80 directives,
  - includes,
  - register-care,
  - layout constants,
  - ops.
- Make default PR CI run:
  - typecheck/build,
  - `npm run test:azm:alpha`,
  - lint if enabled.
- Put `.zax` compatibility tests in a named optional lane, such as
  `zax-compat`, until deletion is approved.

### 3. Track D: register-care after op expansion

Goal: register-care should describe what emitted instructions do, not only what
the source call site says.

Current known issue:

- A routine containing `clear_a` should be analyzed as if it contains `xor a`
  after visible op expansion.

Tasks:

- Decide analysis source:
  - walk a post-expansion instruction stream, or
  - consume the lowered asm stream.
- Update `test/registerCare/opExpansion.integration.test.ts` so expanded
  effects are reflected in inferred summaries.
- Ensure routine discovery remains label-based for flat `.azm`.
- Keep the no-hidden-code rule: register-care can inspect visible expansions,
  not ZAX-only generated runtime code.

### 4. Corpus guardrails

Goal: keep AZM useful as an assembler while deleting ZAX.

Tasks:

- Keep Tetro / Pacmo / MON3-style ASM80 corpus checks available.
- Document when to run corpus tests locally and in PRs.
- Add workflow-dispatch or optional CI for corpus if it is too heavy for every
  PR.
- Ensure `.asm` / `.z80` behavior is not accidentally broken while `.zax`
  behavior is retired.

## Final ZAX Removal Plan

Removal should happen only after native AZM guardrails and compatibility
quarantine are stable.

### Phase 1: remove ZAX from `.azm`

This is mostly done.

End condition:

- `.azm` has no accepted `func`.
- `.azm` has no accepted named `section` block.
- `.azm` errors on typed assignment and structured control.
- `.azm` errors on typed storage and typed extern declarations.
- `.azm` only permits layout casts that fold to constants.

### Phase 2: split compatibility tests

End condition:

- AZM default test lane is green without high-level ZAX behavior.
- Remaining `.zax` tests are explicitly marked compatibility or retired.
- No test named `azm_*` depends on `func`, named `section`, or typed lowering.

### Phase 3: delete ZAX-only parser branches

Candidate deletions or rewrites:

- top-level `func` parsing for the AZM-only build,
- named section parsing for native AZM,
- structured control parsing outside `.zax`,
- typed storage and typed extern parsing outside `.zax`,
- parser recovery that exists only to preserve ZAX syntax.

If `.zax` compatibility still ships, isolate these under an explicit
compatibility parser path. Do not let them leak into `.azm`.

### Phase 4: delete ZAX-only lowering

Candidate subsystems once `.zax` compatibility is removed:

- `functionFrameSetup` and function frame orchestration,
- typed call lowering and argument materialization,
- synthetic epilogue/prologue logic,
- structured control range lowering,
- typed assignment lowering,
- runtime effective-address materialization,
- typed data / var / storage initialization,
- named section contribution layout.

Keep assembler emission:

- classic Z80 instruction encoding,
- native AZM instruction emission,
- op expansion,
- fixup queues,
- symbol resolution,
- placement,
- artifact writers.

### Phase 5: remove ZAX naming

After behavior is gone, clean names.

Tasks:

- Rename package, CLI messages, diagnostics, docs, and comments that still say
  ZAX when they mean AZM or generic assembler behavior.
- Rename `src/lowering` only if useful. A better long-term name may be
  `src/emission`, `src/assembler`, or `src/backend`.
- Rename diagnostic IDs where appropriate. For example, AZM-native deprecation
  errors should eventually become direct AZM syntax errors rather than
  "deprecated ZAX construct" diagnostics.
- Audit generated listings and user-facing output for `zax` labels such as
  synthetic names, artifact metadata, and comments.

## Risks And Watch Points

- `org` section inference is intentionally simple: it looks ahead to decide
  whether an `org` targets data or code. If more directive forms are added, this
  heuristic may need to become an explicit parser-level section marker or a
  clearer placement model.
- `src/lowering` still contains shared function-body machinery reused by
  native instruction emission. The current native frame avoids function
  behavior, but future deletion should separate the reusable assembler emitter
  from the ZAX function scaffolding.
- AZM700 currently carries both the historical "deprecated ZAX" meaning and
  new hard-error behavior. Eventually split this into direct AZM syntax
  diagnostics.
- Register-care currently needs follow-up work so visible `op` expansion is the
  truth for effects.
- `.zax` compatibility may mask dead code. The test quarantine must come before
  deletion, or deletion will look more dangerous than it is.

## Suggested Next Commit

The next implementation chunk should be one of:

1. Add explicit rejection tests for every ZAX-only syntax still mentioned in the
   removal inventory.
2. Start Track C by moving the most obvious `.zax`-only tests into a
   compatibility lane.
3. Start Track D by making register-care analyze expanded `op` instructions.

The highest leverage next step is Track C, because it creates the safety boundary
needed for real deletion.

## Code Organization Review Notes

These notes are not a second handover. They are review guidance for agents
working from this canonical handover.

### Current structure

The repository still has a ZAX compiler shape:

```text
src/
  compile.ts              top-level compile orchestration
  moduleLoader.ts          file loading, include expansion, import traversal
  analysis.ts              semantic-analysis wrapper
  frontend/                parsing and AST construction
  semantics/               environment, type layout, validation
  lowering/                old ZAX lowering plus assembler backend work
  z80/                     pure Z80 instruction encoding and effects
  registerCare/            register clobber/liveness analysis and tooling
  formats/                 output writers
```

The desired cleanup is not "delete lowering". Normal assembler backend work is
still needed: instruction encoding, fixups, placement, symbol resolution, and
artifact generation. The cleanup target is the ZAX-specific hidden runtime
lowering that should not be active in native `.azm`.

### Source-mode ownership

`src/frontend/sourceMode.ts` currently distinguishes `azm`, `zax`, and `asm80`.
Agents should keep changes mode-explicit:

- `.azm` is the native flat assembler surface.
- `.asm` / `.z80` are ASM80-compatible corpus inputs.
- `.zax` is the temporary compatibility lane for inherited structured ZAX.

Do not make a `.zax` compatibility behavior accidentally active for native
`.azm`.

### AST boundary issue

`src/frontend/ast.ts` currently mixes old ZAX constructs and flat assembler
constructs in the same broad unions. This is useful for incremental migration,
but it makes ownership blurry. Future cleanup should split parser and AST
ownership by mode where practical, while keeping shared source spans,
expressions, labels, instructions, and operands reusable.

### Lowering boundary issue

`src/lowering/` currently mixes:

- ZAX function frames, typed calls, typed assignment, structured control, and
  runtime effective-address materialization;
- assembler backend responsibilities such as Z80 emission, fixups, placement,
  lowered ASM streams, and artifact preparation;
- AZM-visible `op` expansion.

When touching this area, prefer small extractions that separate reusable
assembler emission from ZAX compatibility scaffolding. A future layout may use
names such as `src/assembler`, `src/emission`, `src/backend`, and
`src/zaxCompat`, but behavior-preserving boundaries matter more than immediate
renames.

### Register care

`src/registerCare/` is comparatively well aligned with AZM because it analyzes
ordinary assembly instead of hiding machine effects. Review register-care work
for:

- register-pair decomposition into 8-bit carriers;
- explicit flag modeling;
- conservative handling of unknown calls, indirect calls, and external effects;
- the distinction between callee clobbers and caller-side live values;
- generated comments that do not overwrite human prose unexpectedly;
- effects based on visible `op` expansion, as called out in Track D.

### Ops and directive aliases

AZM keeps `op` as AST-level visible expansion, not text macros. Directive
aliases normalize directive heads only. Review changes in these areas for:

- no arbitrary text substitution;
- no expression rewriting by directive aliases;
- no hidden typed-memory lowering through op parameters;
- emitted instruction streams remaining inspectable in listings.

### Layout constants versus typed access

Keep layout metadata and compile-time constants:

- `type`, `union`, arrays, `sizeof`, `offset`, and layout-cast constants.

Avoid native `.azm` behavior that revives:

- typed storage declarations as emitted storage abstractions;
- implicit typed field/index access;
- typed `ld` transfer pipelines;
- runtime value materialization not visible in source.

### Review checklist

For future PRs, ask:

1. Which mode does this affect: `azm`, `asm80`, `zax`, or shared?
2. Does it preserve assembler-visible machine behavior?
3. Does it introduce hidden runtime codegen in native `.azm`?
4. Does it route flat assembler behavior through old function-frame or typed-EA
   paths?
5. Are layout features compile-time constants rather than typed memory access?
6. Are register-care diagnostics based on the instruction stream the programmer
   can inspect?
7. Are tests placed in the correct lane: AZM alpha, ASM80 corpus, ZAX
   compatibility, register care, frontend, or semantics/layout?
