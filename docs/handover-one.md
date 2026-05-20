# Handover One: AZM Native Assembler Surface

Status: active handover
Date: 2026-05-20
Branch: `codex/azm-good-assembler-level`
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

AZM is not ZAX 0.4, and there are no existing AZM users whose old experiments
need a backward-compatibility promise. The product boundary is ASM80 baseline
compatibility plus the kept AZM features above. Everything else inherited from
ZAX should be rejected, quarantined in temporary `.zax` lanes, or deleted.

AZM native source should not be a high-level language. It should not hide
runtime work behind typed assignment, structured control, function frames,
typed storage declarations, or named section blocks.

## Product Boundary

AZM keeps:

- `.asm` / `.z80` ASM80-compatible input paths for the corpus foundation.
- `.azm` native flat assembler source files.
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
- ZAX-style modules/imports, locals, and formal arguments.

The ZAX removal lane remains temporary:

- `.zax` holds old structured-assembler tests only while they are rewritten or
  deleted.
- `.asm` / `.z80` remain assembler compatibility inputs and are not part of the
  ZAX removal target.

## What Landed Before This Branch

PR #7 established the first flat AZM surface:

- Layout-cast constants fold at compile time.
- `.azm` rejects `func` and named `section` blocks.
- Flat labels and Z80 instructions parse at source-file top level.
- AZM700 diagnostics mark remaining inherited ZAX constructs.
- Alpha guardrails exist through `npm run test:azm:alpha`.
- The removal inventory and expression/visibility design docs define the
  product boundary:
  - `docs/audits/azm-removal-inventory.md`
  - `docs/design/azm-expression-and-visibility.md`

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

- `src/frontend/azmNativeRemovals.ts`
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
  source-file directives:
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
- `test/frontend/azm_source_mode_removals.test.ts`
- `test/semantics/layout_cast_constants_azm.test.ts`
- `test/semantics/layout_constants_azm.test.ts`
- `test/registerCare/opExpansion.integration.test.ts`

## Handover Two Delta

Status on 2026-05-20: this branch has the native AZM lowering, flat `org`
data-placement, test-lane quarantine, corpus guardrail repair, and
register-care/op expansion work described below.

### Native `.azm` shape

Native `.azm` source is flat assembler source at source-file top level. The
accepted shape is:

- labels and local labels;
- Z80 instructions;
- `org` / `.org` placement;
- raw data directives `.db`, `.dw`, `.ds` and their supported bare forms;
- `.equ` constants;
- includes and directive aliases where they normalize legacy assembler
  vocabulary;
- `type` / `union`, `sizeof`, `offset`, and layout-cast address constants;
- `op` declarations and visible call-site expansion.

Native AZM uses ASM80-style textual includes, not the inherited ZAX `import`
module system. Included text is part of the same assembly unit. Any future
symbol-visibility experiment should be treated as a later feature, not as part
of this native-surface increment.

Native `.azm` rejects inherited ZAX high-level syntax:

- `func` and `export func`;
- named `section code` / `section data` blocks;
- `:=` typed assignment;
- structured control such as `if`, `while`, `repeat`, and `select`;
- typed `data`, `var`, `globals`, and typed `extern func` declarations;
- runtime typed effective-address lowering or register-indexed layout paths;
- generated stack frames, argument marshalling, and typed call boundaries.

### Test lanes

Current landed lanes:

- `npm test` / `npm run test:azm:alpha` builds the project and runs the AZM alpha guardrails:
  register-care, native flat AZM frontend tests, AZM hard-removal boundary tests,
  layout-constant tests, directive aliases, ASM80 directives, includes, and op
  expansion coverage.
- CI coverage core excludes the explicit `.zax` retirement test list for the
  same reason: old high-level ZAX behavior should stay measurable without
  defining whether AZM itself is green.
- `npm run test:zax:retirement` runs a temporary removal batch for old `.zax`
  behavior: typed reinterpretation, typed storage migration diagnostics, typed
  assignment lowering, typed EA assignment, record data initializers, aggregate
  locals/params, and typed address-of behavior.

The `.zax` lane is not a compatibility promise. Passing it should help organize
removal work, not block deliberate deletion of ZAX-only behavior.

ZAX `import` tests, function/frame tests, named-section tests, and
structured-control lowering tests should either be rewritten into AZM/ASM80
guardrails or deleted with the subsystem they exercise.

### Corpus guardrail

- `npm run test:azm:corpus` is optional and local. It expects a built CLI, finds
  `asm80`, runs known read-only Tetro and Pacmo entry points, emits temporary
  HEX files, and compares AZM output against ASM80 output with only final
  newline differences normalized.
- Missing repositories, missing entries, or missing `asm80` skip with a clear
  message. MON3 remains skipped until a known entry is configured.
- Run this guardrail before parser, directive, include, or emission changes that
  could affect real ASM80-family source.

### Register-care and `op` expansion

- Native `.azm` instruction emission performs visible `op` expansion.
- Register-care analyzes post-expansion instructions for visible ops. A routine
  that invokes `clear_a` is summarized as the emitted `xor a`, including
  register and flag effects, with no synthetic call boundary.

### Deletion readiness

Ready now:

- Keep enforcing hard `.azm` boundaries for `func`, named `section` blocks,
  ZAX `import`, typed assignment, structured control, typed storage, typed
  externs, and runtime layout paths.
- Delete or isolate documentation that teaches those features as AZM-native
  once replacement docs exist.

Blocked until lane results are verified in the integration commit:

- Do not delete ZAX-only parser branches or lowering subsystems until both
  `npm run test:azm:alpha` and `npm run test:zax:retirement` are green in the final
  combined workspace.
- Do not treat MON3 as protected by `npm run test:azm:corpus` until its known
  entry point is configured.

Next deletion candidates after the lanes are green:

- native-mode parser paths for `func`, named `section`, `:=`, structured
  control, ZAX `import`, typed storage, and typed extern declarations;
- generated function-frame setup, typed argument materialization, typed
  assignment lowering, runtime effective-address materialization, and named
  section layout code that has no `.zax` retirement owner;
- ZAX naming in diagnostics, package metadata, listings, and docs after the
  behavior boundary is stable.

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
2. delete the ZAX-specific lowering subsystems once AZM/ASM80 guardrails do not
   need them.

## Direct Roadmap Ahead

### 1. Finish native flat assembler surface

Immediate goal: make `.azm` feel like a strict assembler with the approved
extensions.

Tasks:

- Keep hard errors for rejected ZAX constructs.
- Add or tighten tests for:
  - typed `data` / `var` / `globals` rejection,
  - typed `extern func` rejection,
  - structured control rejection at source-file top level,
  - unsupported asm syntax diagnostics,
  - `org` + labels + `.db` / `.dw` / `.ds` combinations.
- Confirm `.equ` aliases, directive aliases, and includes are covered in native
  or ASM80 guardrails.
- Decide whether native `.azm` should accept leading-dot directives only,
  bare directives only, or both. Current behavior accepts both in the relevant
  places where supported.

### 2. Track C: delete or rewrite ZAX tests

Goal: default CI should represent AZM, not the inherited ZAX language.

Tasks:

- Use `docs/audits/zax-test-retirement-map.md` as the source of truth.
- Move old high-level tests into the temporary removal lane only while deleting
  or rewriting them:
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
- Keep `.zax` removal tests in `npm run test:zax:retirement` only while they help
  organize the deletion work.

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
- Remaining `.zax` tests are explicitly marked quarantine/retirement or deleted.
- No test named `azm_*` depends on `func`, named `section`, or typed lowering.

### Phase 3: delete ZAX-only parser branches

Candidate deletions or rewrites:

- top-level `func` parsing for the AZM-only build,
- named section parsing for native AZM,
- ZAX `import` parsing outside `.zax`,
- structured control parsing outside `.zax`,
- typed storage and typed extern parsing outside `.zax`,
- parser recovery that exists only to preserve ZAX syntax.

If the `.zax` retirement lane still ships, isolate these under an explicit
retirement parser path. Do not let them leak into `.azm`.

### Phase 4: delete ZAX-only lowering

Candidate subsystems once the `.zax` retirement lane is removed:

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
- Rename diagnostic IDs where appropriate. AZM-native hard-removal errors may
  eventually become direct AZM syntax errors rather than a broad AZM700 bucket.
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
- AZM700 currently marks inherited ZAX constructs that native AZM rejects.
  Eventually split this into direct AZM syntax diagnostics.
- Register-care currently needs follow-up work so visible `op` expansion is the
  truth for effects.
- `.zax` tests may mask dead code. Use the removal map to make deletion
  deliberate and reviewable.

## Suggested Next Commit

The next implementation chunk should be one of:

1. Add explicit rejection tests for every ZAX-only syntax still mentioned in the
   removal inventory.
2. Start Track C by deleting or rewriting the most obvious `.zax`-only tests.
3. Start Track D by making register-care analyze expanded `op` instructions.

The highest leverage next step is Track C, because it creates the safety boundary
needed for real deletion.
