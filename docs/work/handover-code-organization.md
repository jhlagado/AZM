# Handover: AZM code organization and review direction

Status: active handover note
Date: 2026-05-19

## Purpose

This note gives incoming agents the current architectural reading of the
codebase. It is intended to prevent agents from following older ZAX-shaped
implementation signals when the active project direction is now AZM: an
ASM80-style Z80 assembler with stronger, assembly-first syntax and analysis.

The short version:

- Treat the old ZAX compiler as inherited implementation machinery.
- Treat ASM80-style flat assembly as the native baseline being built forward.
- Keep AZM extensions machine-visible unless a design note explicitly says
  otherwise.
- Quarantine or retire ZAX features that generate hidden runtime code.

## Important correction to older active-stream notes

`docs/work/current-stream.md` is outdated for the current AZM direction. It
still describes a typed-assignment stream where `:=`, typed scalar paths, and
`step` are central. That was valid for the earlier ZAX-oriented language work,
but it is not the direction agents should use for AZM-native work.

For current direction, prefer these documents:

- `docs/design/azm-language-direction.md`
- `docs/audits/zax-feature-retirement-audit.md`
- `docs/design/azm-register-care-safety.md`
- `docs/design/asm80-first-language-track.md`
- `docs/design/azm-ops-subset.md`
- `docs/design/azm-expression-and-visibility.md`

## Current product direction

AZM is being shaped as an assembler first. The useful baseline is ASM80-style
Z80 source:

- labels
- instructions
- `call`, `ret`, `jp`, `jr`, `djnz`
- constants and equates
- `.org`, `.equ`, `.db`, `.dw`, `.ds`, and compatibility aliases where
  documented
- includes
- ordinary subroutine structure
- comments and AZMDoc register-contract metadata

The stronger AZM features should remain assembly-facing:

- register-care analysis and clobber diagnostics
- typed memory layout as compile-time metadata
- `sizeof`, `offset`, and explicit layout constants
- explicit layout-cast address expressions that fold to constants
- AST-level `op` expansion for visible instruction idioms
- directive alias normalization, not text rewriting

Inherited ZAX features to deprecate, quarantine, or avoid in AZM-native work:

- `func` declarations
- formal parameters and function-local variable blocks
- typed `var`, `globals`, and `data`
- typed assignment with `:=`
- typed `ld` or effective-address lowering that emits hidden runtime code
- compiler-lowered structured control flow such as `while`, `select`, and
  function-body `if`
- named ZAX `section` blocks as the native placement model

The guiding rule is: if source text looks like an instruction stream, generated
output should stay visibly related to that instruction stream. AZM may help
with constants, contracts, fixups, layout, diagnostics, and explicit `op`
expansion, but it should not silently synthesize runtime address calculation or
function-frame machinery in native mode.

## Current code organization

The repository still has a ZAX compiler shape:

```text
src/
  compile.ts              top-level compile orchestration
  moduleLoader.ts          file loading, include expansion, import traversal
  analysis.ts              semantic-analysis wrapper
  frontend/                parsing and AST construction
  semantics/               environment, type layout, validation
  lowering/                old ZAX lowering plus classic assembler emission
  z80/                     pure Z80 instruction encoding and effects
  registerCare/            register clobber/liveness analysis and tooling
  formats/                 output writers
```

This structure works, but it is not yet a clean AZM assembler architecture. The
main cleanup task is to separate:

1. flat assembler core behavior,
2. AZM-native assembly extensions,
3. ZAX compatibility behavior,
4. analysis/tooling layers such as register care.

## Source modes

`src/frontend/sourceMode.ts` currently defines:

```ts
export type SourceMode = 'azm' | 'zax' | 'asm80';
```

Mode inference is:

- `.azm` -> `azm`
- `.asm` / `.z80` -> `asm80`
- otherwise -> `zax`

This is a useful foundation, but ownership is not yet clean. The pipeline still
pushes all modes toward a shared `ProgramNode` / `ModuleFileNode` shape. Classic
ASM80 files are parsed by `src/frontend/asm80/parseClassicModule.ts`, then their
classic nodes are mixed into the broad `ModuleItemNode` union.

When adding behavior, agents should be explicit about which mode they are
touching. Do not make a ZAX compatibility behavior accidentally active for
native `.azm` unless there is an approved design note.

## AST issue

`src/frontend/ast.ts` currently carries both old ZAX constructs and newer
classic/flat assembler constructs in the same unions. This is convenient for the
existing pipeline, but it weakens architectural boundaries.

Examples of mixed concepts in the same `ModuleItemNode` union include:

- `FuncDecl`
- `DataBlock`
- `VarBlock`
- `NamedSection`
- `OpDecl`
- `ClassicItemNode`
- `AsmLabel`
- `AsmInstruction`
- `AsmControlNode`

Future cleanup should consider splitting AST ownership into clearer layers,
such as:

```text
frontend/shared/
frontend/asm80/
frontend/azm/
frontend/zaxCompat/
```

Shared nodes can still exist for source spans, expressions, labels, instructions,
and operands. The important point is to make it clear whether a node is native
AZM, classic ASM80 compatibility, or preserved ZAX compatibility.

## Lowering issue

`src/lowering/` is the largest organizational problem. It currently mixes:

- old ZAX function lowering
- generated frames and locals
- function calls and return-register handling
- typed assignment lowering
- typed effective-address materialization
- value-materialization step pipelines
- typed `ld` transfer planning
- `op` matching and expansion
- classic ASM80 directive/instruction lowering
- section placement
- fixup queues
- lowered-ASM stream recording
- final byte-map placement

This makes the folder hard to reason about, and it encourages new work to reuse
old high-level lowering paths even when native AZM should avoid them.

A cleaner future split would be along these lines:

```text
src/assembler/
  directives/
  expressions/
  symbols/
  fixups/
  emission/

src/azm/
  ops/
  layout/
  directives/

src/zaxCompat/
  functions/
  typedStorage/
  structuredControl/
  typedAssignment/

src/registerCare/
  ...

src/z80/
  ...
```

This does not need to happen in one large move. Prefer small extractions that
make ownership clearer without changing behavior.

## Analysis pipeline issue

`src/analysis.ts` is still biased toward ZAX-era semantics. It builds the
compile environment, validates typed assignment, validates `step`, and supports a
`requireMain` check that looks for a ZAX `FuncDecl` named `main`.

That is not a good long-term fit for flat assembler source. Future work should
move toward mode-aware analysis:

- classic/ASM80 analysis for labels, constants, directives, fixups, and opcode
  validity
- AZM-native analysis for layout constants, ops, register contracts, and
  assembly-first diagnostics
- ZAX compatibility analysis for retained old structured features

Avoid adding more AZM-native assumptions to the old ZAX semantic path unless
there is no practical alternative.

## Register care

`src/registerCare/` is comparatively well isolated and aligns with the current
AZM direction. It analyzes ordinary assembly rather than hiding machine effects.

Important files and responsibilities:

- `src/z80/effects.ts`: instruction effect data
- `src/registerCare/programModel.ts`: routine/program model
- `src/registerCare/liveness.ts`: caller-side liveness and care
- `src/registerCare/summary.ts`: routine summaries
- `src/registerCare/smartComments.ts`: AZMDoc-style metadata parsing
- `src/registerCare/report.ts`: human-readable report/interface output
- `src/registerCare/annotate.ts`: generated source annotations
- `src/registerCare/tooling.ts`: tooling API helpers

Review register-care work for:

- correct register-pair decomposition into 8-bit carriers
- explicit flag modeling
- conservative handling of unknown calls, indirect calls, and external effects
- clear distinction between callee clobbers and caller-side live values
- generated comments that do not overwrite human prose unexpectedly
- diagnostics that are useful without becoming noisy

## Ops

AZM keeps `op` as an AST-level expansion system, not a text macro system.

Review `op` work for these rules:

- expansion should produce visible instruction streams
- no arbitrary text substitution
- no hidden typed-memory lowering through op parameters
- matching should be simpler than old ZAX type-signature machinery where
  possible
- control-stack effects, if introduced later, should be explicit and typed

Relevant current files include:

- `src/frontend/parseOp.ts`
- `src/lowering/opMatching.ts`
- `src/lowering/opExpansionOrchestration.ts`
- `src/lowering/opExpansionExecution.ts`
- `src/lowering/opSubstitution.ts`
- `src/lowering/opStackAnalysis.ts`

These likely need future relocation or refactoring once the AZM op subset is
fully specified.

## Typed layout versus typed access

The inherited type/layout code contains both useful AZM pieces and old ZAX
runtime-lowering pieces.

Keep for AZM:

- record layout
- union layout
- array type expressions for byte counts and strides
- `sizeof`
- `offset`
- constant layout-cast expressions
- constants derived from layout expressions

Avoid or quarantine for AZM-native source:

- typed storage declarations that imply emitted storage behavior
- implicit typed effective-address access
- field/index paths that trigger runtime codegen
- typed assignment
- typed `ld` transfer pipelines
- value materialization that synthesizes address calculations not present in
  source

If an agent touches layout code, verify whether the change supports compile-time
constant folding or revives hidden typed access.

## Directive aliases

Directive aliases should normalize directive heads only. They are compatibility
glue, not a macro language.

Good:

```text
DB   -> .db
DEFB -> .db, if policy allows it
ORG  -> .org
```

Bad:

- rewriting expressions
- injecting instructions
- expanding multi-line forms
- silently changing semantics based on dialect guesses

Relevant current files:

- `src/frontend/directiveAliases.ts`
- `src/frontend/asm80/classicLine.ts`
- `src/frontend/asm80/parseClassicModule.ts`

## Review checklist for incoming agent work

Use this checklist when reviewing changes:

1. Which source mode does this affect: `asm80`, `azm`, `zax`, or shared?
2. Does the change preserve ASM80-style machine visibility?
3. Does it introduce hidden runtime codegen in native `.azm`?
4. Does it route flat assembler behavior through old `func`, frame, typed
   assignment, or typed EA pipelines?
5. Are directive aliases treated as normalization only?
6. Are ops AST-level visible expansions rather than text macros?
7. Are layout features compile-time constants rather than typed memory access?
8. Is register-care analysis kept separate from byte emission?
9. Are diagnostics precise and mode-appropriate?
10. Are tests placed in the right bucket: ASM80 compatibility, AZM alpha,
    register care, frontend/parser, semantics/layout, or ZAX compatibility?

## Practical advice for cleanup PRs

Prefer small, behavior-preserving moves:

- extract classic assembler helpers out of generic `lowering/` when touched
- add mode-specific wrappers instead of more flags in shared functions
- keep ZAX compatibility tests green until a reviewed retirement map says
  otherwise
- add guardrail tests before deleting or bypassing inherited behavior
- avoid broad renames of public package/CLI/diagnostic names until packaging
  policy changes

Do not delete old ZAX systems simply because they are deprecated in AZM. The
safe path is:

1. document the intended replacement,
2. add AZM/ASM80 guardrails,
3. quarantine compatibility behavior by mode,
4. remove dead paths only after tests and docs agree.

## Bottom line

The repo has a useful compiler foundation, but it is still organized around old
ZAX assumptions. The desired end state is a clean assembler-first architecture
where AZM-native features are layered on top of flat assembly and ZAX high-level
machinery is isolated as compatibility code.

Incoming agents should treat this as the architectural north star when deciding
where new code belongs and when reviewing whether a change is moving the project
toward or away from AZM.
