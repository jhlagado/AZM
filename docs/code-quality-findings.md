# Code Quality Findings: AZM Native Rework

Status: active review note
Date: 2026-05-20

## Purpose

This note is for the coding agent working on the AZM native rework. It records
the current code-quality reading after pulling the latest `main`, with emphasis
on clarity, ownership boundaries, and safe cleanup direction.

The product direction is captured in `docs/design/azm-language-direction.md`,
`docs/design/azm-expression-and-visibility.md`, and
`docs/audits/azm-removal-inventory.md`. This file translates the current state
into review findings and code-organization guidance.

## Executive summary

The latest `main` is directionally sound:

- `.azm` is now a flat assembler surface at source-file top level.
- High-level ZAX syntax is rejected in native `.azm`.
- `npm run test:azm:alpha`, `npm run test:zax:retirement`, and
  `npm run test:azm:corpus` now describe separate risk lanes.
- Register-care sees visible `op` expansion rather than treating expanded ops as
  opaque calls.
- The active design docs distinguish assembler backend work from hidden
  ZAX-style lowering.

The main code-quality problem is not the direction. The problem is that several
new AZM-native capabilities are still implemented by threading through ZAX-era
structures. This was a reasonable bridge, but it should not become the permanent
shape.

## Finding 1: Native AZM emission still depends on function-shaped machinery

Files:

- `src/lowering/nativeAsmLowering.ts`
- `src/lowering/functionLoweringPhases.ts`
- `src/lowering/programLoweringTraversal.ts`

Current state:

- `lowerNativeAsmInstruction()` now enters an assembler-named facade,
  `createNativeAssemblerEmissionFrame()`.
- The facade still builds a private bridge context so it can reuse
  `prepareFunctionLoweringSetupPhase`, `createNativeAssemblerFramePhase`, and
  `createAssemblerInstructionEmitters`.
- The synthetic function-shaped context is now isolated behind an explicitly
  named bridge helper in `asmEmissionFrame.ts`.
- `createNativeAssemblerFramePhase` correctly avoids frame setup, prologue,
  epilogue, locals, and typed call behavior.

Why this is acceptable now:

- It allowed native `.azm` to reuse existing instruction emission, `ld` support,
  fixups, and visible `op` expansion quickly.
- It preserves the no-hidden-frame rule for native AZM.

Quality risk:

- The code still communicates "native AZM is a fake function" to future
  maintainers if they follow the bridge inward.
- Function-phase types expose structured-control and frame concepts to a path
  that should eventually be assembler-native.
- Future edits could accidentally reintroduce function assumptions into native
  emission because the helper names and data shapes make that easy.

Recommended direction:

1. Keep the current bridge until tests and deletion lanes are stable.
2. Extract the reusable instruction-emission bundle out of
   `functionLoweringPhases.ts`.
3. Give that extracted API an assembler-facing name, such as
   `createAsmInstructionEmitters` or `createAssemblerEmissionFrame`.
4. Make function lowering depend on the assembler emitter, not the other way
   around.
5. Delete the synthetic `FuncDecl` bridge once native emission no longer needs a
   function-shaped context.

Review rule:

> New native `.azm` behavior should not deepen the dependency on fake function
> declarations. If a change needs more of `FunctionLoweringContext`, consider
> extracting an assembler-level context first.

## Finding 2: Parser dispatch is carrying too many mode responsibilities

Files:

- `src/frontend/parseModuleItemDispatch.ts`
- `src/frontend/parseAzmAsmStream.ts`
- `src/frontend/parseAzmClassicModuleLine.ts`
- `src/frontend/azmNativeUnsupported.ts`
- `src/frontend/asm80/parseClassicModule.ts`

Current state:

- `parseModuleItemDispatch.ts` is now about 700 lines and owns:
  - top-level ZAX dispatch,
  - section-body behavior,
  - AZM-native top-level asm parsing,
  - AZM-native classic directive parsing,
  - native-mode unsupported ZAX construct diagnostics,
  - raw data special cases.
- `parseAzmClassicModuleLine.ts` is a useful new boundary for native flat
  directives, but it still converts into `Classic*` nodes.

Why this is acceptable now:

- It keeps existing AST and lowering paths working.
- It makes native `.azm` practical without a full frontend rewrite.

Quality risk:

- The dispatch file is becoming a mode multiplexer rather than a clean parser
  component.
- Native `.azm` directive parsing is conceptually assembler-native, but its AST
  output uses classic compatibility node names.
- More feature work in this file will make source-mode behavior harder to audit.

Recommended direction:

1. Keep `parseModuleItemDispatch.ts` as the coordinator, but move mode-specific
   decisions out of it.
2. Extract a native source-file parser helper that owns this sequence:
   - try AZM flat directive,
   - try AZM top-level asm item,
   - emit unsupported native diagnostic,
   - manage pending raw-data labels.
3. Consider renaming or wrapping `Classic*` directive nodes when they are used
   as native AZM IR. The behavior can stay the same, but the code should not
   force readers to ask whether native directives are "classic compatibility" or
   "AZM core".
4. Keep `.asm` / `.z80` classic parsing separate from `.azm` native parsing even
   when they share directive grammar.

Review rule:

> If a frontend change touches `parseModuleItemDispatch.ts`, check whether it is
> adding another mode branch that belongs in an AZM-native, ASM80, or ZAX
> compatibility helper.

## Finding 3: Register-care has a second op-expansion implementation

Files:

- `src/registerCare/programModel.ts`
- `src/lowering/opMatching.ts`
- `src/lowering/opExpansionExecution.ts`
- `src/lowering/opSubstitution.ts`
- `src/lowering/loweredAsmStreamRecording.ts`

Current state:

- Register-care now expands visible ops before building routine summaries.
- This matches the product direction: analysis should see what visible op
  expansion emits.
- The expansion stream used by register-care now lives in
  `src/lowering/opExpansionStream.ts`, outside the register-care subsystem.

Why this is acceptable now:

- It fixes the important semantic issue: register-care summaries now reflect
  expanded instructions such as `clear_a -> xor a`.
- It avoids treating visible ops as opaque call boundaries.
- The stream helper gives emission and analysis a shared boundary to converge
  on, instead of leaving register-care to own op expansion internals.

Quality risk:

- Emission still uses orchestration helpers directly, so full convergence is not
  complete yet.
- If emission-side op expansion and register-care op expansion drift, diagnostics
  can disagree with emitted code.
- Local-label handling, parameter binding, and matcher behavior are especially
  sensitive to drift.

Recommended direction:

1. Keep the current register-care behavior covered by tests.
2. Extract a pure "expand op body to instruction stream" service shared by
   emission and analysis.
3. Keep that service independent of byte emission and independent of
   register-care summaries.
4. Let register-care consume the shared expanded instruction stream.
5. Add tests that compare at least one emitted lowered-ASM expansion with the
   instruction heads seen by register-care.

Review rule:

> Any op syntax or matcher change must update both emitted expansion tests and
> register-care expansion tests, or better, move the shared expansion semantics
> behind one API.

## Finding 4: `Classic*` nodes are doing double duty

Files:

- `src/frontend/ast.ts`
- `src/frontend/parseAzmClassicModuleLine.ts`
- `src/frontend/asm80/parseClassicModule.ts`
- `src/lowering/classicDirectiveLowering.ts`
- `src/lowering/classicTraversalHelpers.ts`

Current state:

- Native `.azm` flat directives lower through `ClassicOrg`,
  `ClassicRawData`, `ClassicEqu`, and related helpers.
- ASM80 compatibility input uses the same node family.

Why this is acceptable now:

- The directive semantics overlap.
- Reusing the classic path reduced implementation risk.

Quality risk:

- The AST name now describes provenance poorly. A native `.azm` `.db` directive
  is not just a classic compatibility artifact; it is core AZM syntax.
- Future compatibility-specific behavior may accidentally affect native AZM, or
  vice versa.

Recommended direction:

1. Introduce neutral assembler directive nodes, or a wrapper layer, before
   broadening directive support.
2. Keep ASM80 compatibility parsing as one producer of those nodes.
3. Keep native `.azm` parsing as another producer of those nodes.
4. Keep compatibility-only quirks outside the neutral directive representation.

Review rule:

> When a change modifies `Classic*` behavior, ask whether the change is intended
> for ASM80 compatibility, native AZM, or both.

## Finding 5: Test lanes are now a strong architectural boundary

Files:

- `package.json`
- `scripts/dev/run-azm-alpha-guardrails.mjs`
- `scripts/dev/run-zax-retirement-tests.mjs`
- `scripts/dev/run-azm-corpus-guardrails.mjs`
- `docs/reference/testing-verification-guide.md`
- `docs/audits/zax-test-retirement-map.md`

Current state:

- `npm run test:azm:alpha` is the default AZM foundation lane.
- `npm run test:zax:retirement` explicitly quarantines old high-level ZAX behavior.
- `npm run test:azm:corpus` is optional and read-only for local ASM80-family
  corpora.

Quality opportunity:

- These lanes should now drive code organization. If a subsystem is protected
  only by `test:zax:retirement`, it is a retirement subsystem unless proven
  otherwise.
- If a behavior is part of native `.azm`, it belongs in alpha guardrails.
- If a behavior protects real ASM80 source compatibility, it belongs in corpus
  or ASM80 baseline guardrails.

Review rule:

> Do not delete or refactor ZAX-looking code solely because it looks old. First
> identify which lane protects it. Then either move it behind a compatibility
> boundary or add native AZM coverage before deletion.

## Finding 6: Native AZM should stay include-first, not import/module based

Files:

- `src/moduleLoader.ts`
- `src/moduleLoaderIncludePaths.ts`
- `src/zaxImportResolution.ts`
- `src/frontend/parseModuleItemDispatch.ts`
- `docs/audits/azm-removal-inventory.md`
- `docs/audits/zax-test-retirement-map.md`

Current state:

- Native `.azm` is documented as a flat source file with ASM80-style textual
  `.include` / `include`.
- ZAX `import` remains compatibility behavior, not native AZM structure.
- The first `test:zax:retirement` batch covers typed high-level behavior. It does
  not yet cover every import/function/section compatibility test.

Quality risk:

- Future work may read old "module" vocabulary as permission to build native
  AZM around semantic import graphs.
- ZAX import behavior may look unowned if it is not clearly listed as
  compatibility-only.

Recommended direction:

1. Keep native multi-file assembly on textual includes.
2. Reject or quarantine ZAX `import` in native `.azm`.
3. Add import/function/section tests to `test:zax:retirement` before deleting those
   compatibility paths.
4. Rename comments and helper descriptions that say "module" when they mean a
   source file plus textual includes.

Review rule:

> New native AZM loader work should talk about source files and textual includes.
> Use "ZAX import" when referring to the old semantic import graph.

## Finding 7: `src/lowering` needs vocabulary cleanup, not blind deletion

Files:

- `src/lowering/**`

Current state:

- The handover correctly says "lowering" currently means both normal assembler
  backend work and hidden ZAX-style code generation.
- Native AZM still needs byte emission, fixups, placement, lowered ASM streams,
  and artifact preparation.

Quality risk:

- Agents may over-correct and try to delete or bypass backend code because it
  lives under `lowering`.
- Other agents may under-correct and continue adding native assembler features
  to function/typed-lowering files because those files already work.

Recommended direction:

1. Split by responsibility when touching files:
   - assembler emission,
   - symbols and fixups,
   - placement,
   - visible op expansion,
   - ZAX compatibility lowering.
2. Prefer small extractions over broad renames.
3. When a helper is shared by native AZM and ZAX compatibility, name it for the
   assembler/backend concept rather than the function/typed concept.

Review rule:

> The right cleanup is to separate assembler backend code from ZAX compatibility
> code. It is not to remove backend code, and it is not to keep native AZM
> permanently dependent on ZAX function concepts.

## Priority order for the coding agent

1. **Keep guardrails green.**
   - Run `npm run test:azm:alpha` for native changes.
   - Run `npm run test:zax:retirement` before touching inherited high-level
     behavior.
   - Run `npm run test:azm:corpus` before parser, directive, include, or
     emission changes when local corpora/tools are available.

2. **Avoid deepening bridge dependencies.**
   - Native AZM may currently use function-shaped helpers as a bridge.
   - New code should move toward assembler-level APIs.

3. **Extract shared semantics before adding variants.**
   - Especially for op expansion, directive parsing, and instruction emission.

4. **Use naming as a quality tool.**
   - Names should tell readers whether a helper belongs to native AZM, ASM80
     compatibility, ZAX compatibility, or shared assembler backend.

5. **Delete only after quarantine.**
   - The explicit `.zax` retirement lane is the safety mechanism for old
     behavior. Use it before removing parser or lowering paths.

## Suggested next code-quality slices

These are intentionally scoped as cleanup-enabling slices, not broad rewrites.

### Slice A: Native assembler emission facade

Create an assembler-facing facade around the reusable parts of function
instruction emission. The first step can be only a rename/extraction with no
behavior change:

- input: `LoweringContext` plus `AsmInstructionNode`;
- output/effect: same emitted bytes/fixups/lowered-ASM records as today;
- forbidden: creating synthetic function semantics in the public API.

Status: partially complete. Native `.azm` lowering now calls an
assembler-named facade and has a test covering no hidden function prologue,
epilogue, frame labels, or local-frame instructions. Deeper backend reuse still
uses a private bridge context and remains a later cleanup.

### Slice B: Shared op expansion stream

Extract pure op expansion to a shared service:

- input: instruction, visible op declarations, matcher helpers;
- output: expanded labels/instructions;
- consumers: byte emission and register-care.

This reduces semantic drift risk.

### Slice C: Native flat directive node boundary

Introduce neutral directive terminology for `.org`, `.equ`, `.db`, `.dw`, and
`.ds` so native AZM and ASM80 compatibility can share behavior without
communicating that native directives are merely "classic" nodes.

### Slice D: Parser dispatch thinning

Move native `.azm` top-level parsing into a dedicated helper that owns
pending raw labels, flat directives, top-level asm items, and native
unsupported diagnostics.

This will make `parseModuleItemDispatch.ts` easier to review.

## Bottom line

The current branch has made the right product turn. The remaining quality work
is to make the code say the same thing as the product:

- AZM native is flat assembly plus explicit extensions.
- ASM80 compatibility is a corpus-preserving lane.
- ZAX compatibility is temporary and quarantined.
- The backend is an assembler backend, not inherently ZAX.
- Hidden runtime lowering should have an explicit compatibility owner or be
  retired.

Use that framing when reviewing or writing the next implementation slice.
