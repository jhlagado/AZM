# Layout Constant API Audit

Status: implementation prerequisite
Date: 2026-05-19

## Goal

Keep AZM's layout machinery only where it computes assembly-facing constants:
`sizeof`, `offset`, packed record/union sizes, array strides, and explicit
layout-cast address constants.

This audit maps the inherited ZAX layout surface before implementation work on
the AZM subset. It is intentionally documentation-only: parser, semantic, and
lowering behavior should not change until the next implementation slice has
locking tests.

## Current implementation map

| Area | File(s) | Current behavior | AZM decision |
|------|---------|------------------|--------------|
| Type declarations | `src/frontend/parseTypes.ts`, `src/frontend/parseRecordFieldDecl.ts`, `src/frontend/ast.ts`, `src/moduleVisibility.ts` | Parses `type Name TypeExpr`, record-style `type Name ... end`, and `union Name ... end`; stores `TypeDeclNode` and `UnionDeclNode` in the compile environment with module visibility. | Keep as layout metadata. AZM should retain type and union declarations when they only describe byte layout. |
| Type expressions | `src/frontend/parseImm.ts`, `src/frontend/parseData.ts`, `src/frontend/parseParams.ts`, `src/frontend/parseOperands.ts`, `src/frontend/ast.ts` | Parses scalar/named types, dotted type names, fixed arrays, inferred arrays where explicitly allowed, and `@T` address-of type expressions. `sizeof`/`offset` currently accept type-expression arguments through the immediate-expression parser. | Keep the subset needed for constants: named types, scalar types, fixed arrays, and explicit layout casts. Review `@T` because it belongs mainly to inherited typed-pointer behavior. |
| Record layout | `src/semantics/layout.ts`, `src/semantics/typeQueries.ts`, `src/lowering/eaResolution.ts`, `src/lowering/valueMaterializationBase.ts` | `sizeOfTypeExpr` sums exact field sizes recursively. Field-offset walkers add sizes of preceding record fields. | Keep exact packed size. Record field offsets are the main retained value. |
| Union layout | `src/semantics/layout.ts`, `src/semantics/typeQueries.ts`, `src/lowering/eaResolution.ts`, `src/lowering/valueMaterializationBase.ts` | `sizeOfTypeExpr` uses the maximum field size. `offsetOfPathInTypeExpr` treats selected union fields as offset zero, then continues into nested fields. | Keep max member size and zero-offset field selection. Unions are useful overlay layouts, not runtime tagged values. |
| Array type expressions | `src/frontend/parseImm.ts`, `src/semantics/layout.ts`, `src/lowering/eaResolution.ts`, `src/lowering/addressingPipelines.ts`, `src/lowering/valueMaterializationIndexing.ts` | Fixed arrays compute `element size * length`. Inferred-length arrays are rejected by layout constants except in typed data declarations with an initializer. Some lowering paths also use array strides for runtime indexed effective addresses. | Keep for size/stride constants. Defer or retire runtime-index lowering from the AZM-native subset unless it is expressed through explicit assembly or later AST ops. |
| `sizeof` | `src/frontend/parseImm.ts`, `src/semantics/env.ts`, `src/semantics/layout.ts`, `src/lowering/loweredAsmStreamRecording.ts`, `src/lowering/opSubstitution.ts` | Immediate parser creates `ImmSizeof`; semantic evaluation calls `sizeOfTypeExpr`; lowered ASM recording can preserve the expression shape for later evaluation. Current semantics are exact-size. | Keep exact byte count. Strengthen tests around `sizeof(Sprite[16])`, nested arrays, unknown types, inferred arrays, and recursive definitions. |
| `offset` | `src/frontend/parseImm.ts`, `src/semantics/env.ts`, `src/semantics/layout.ts`, `src/lowering/loweredAsmStreamRecording.ts`, `src/lowering/opSubstitution.ts` | Immediate parser creates `ImmOffsetof` with a field/index path. Semantic evaluation walks records, unions, and arrays using exact sizes and compile-time index evaluation. | Keep and extend for arrays/nested paths. Lock `offset(Sprite, field)`, nested fields, and `offset(Sprite[16], [2].field)` before further implementation. |
| Explicit layout-cast effective addresses | `src/frontend/parseOperands.ts`, `src/frontend/ast.ts`, `src/lowering/eaResolution.ts`, `src/lowering/ldFormSelection.ts`, `src/lowering/valueMaterializationRuntimeEa.ts` | Parses `<TypeExpr>base[index].field` as `EaReinterpret` plus `EaField`/`EaIndex`. Current lowering can resolve constants, stack bases, and some runtime index paths. `.azm` native mode currently warns on typed effective-address syntax. | Keep only the constant-address query form, then revisit the deprecation warning once the AZM subset is implemented. Runtime register indexes should remain rejected for the layout-constant feature. |
| Typed assignment | `src/frontend/parseAssignmentInstruction.ts`, `src/frontend/azmDeprecations.ts`, `src/lowering/asmLoweringAssign.ts`, `src/lowering/asmInstructionLowering.ts` | Parses and lowers `:=` typed assignments through inherited ZAX machinery; `.azm` mode warns that it is deprecated. | Deprecate/retire from AZM-native source. It hides loads/stores and is outside the layout-constant subset. |
| Hidden typed memory lowering | `src/lowering/eaResolution.ts`, `src/lowering/addressingPipelines.ts`, `src/lowering/valueMaterializationBase.ts`, `src/lowering/valueMaterializationRuntimeEa.ts`, `src/lowering/asmLoweringStep.ts`, `src/lowering/valueMaterializationIndexing.ts` | Resolves typed fields/indexes and may emit address-materialization or indexed access sequences, including exact-scale runtime indexing support. | Deprecate/retire from AZM-native unless reintroduced through explicit AST ops. The first AZM layout slice should fold constants only and emit no hidden address-calculation code. |
| Typed data storage lowering | `src/frontend/parseData.ts`, `src/lowering/programLoweringData.ts`, `test/pr1049_record_named_init_data_lowering.test.ts` | Parses typed `data` declarations, positional/named record initializers, strings, inferred array lengths, and lowers them to bytes. `.azm` mode warns on typed data blocks. | Deprecate/retire from AZM-native. Keep tests only as inherited ZAX compatibility or as fixtures for raw `.db`/`.dw` migration examples. |
| Typed var/global storage | `src/frontend/parseModuleCommon.ts`, `src/frontend/parseSectionBodies.ts`, `src/semantics/storageView.ts`, `src/lowering/programLoweringTraversal.ts`, `src/lowering/functionFrameSetup.ts` | Uses type expressions to size module/global/local storage and to attach typed effective-address metadata to symbols. | Deprecate/retire from AZM-native. AZM should prefer labels plus `.db`/`.dw`/`.ds sizeof(...)` constants. |

## Existing tests to preserve

- `test/pr8_sizeof.test.ts`: compile-level smoke coverage for `sizeof(TypeName)` and unknown-type diagnostics. It is small and should be expanded or complemented by AZM-native layout constant tests.
- `test/semantics/semantics_layout.test.ts`: direct semantic tests for unknown types, recursion diagnostics, inferred-array rejection, union max size, and scalar `addr` size.
- `test/semantics/layout_edge_cases.test.ts`: direct semantic tests for empty records/unions, nested record sizes, union fields with array members, arrays of unions, nested `offset`, array-index `offset`, and union offset rules.
- `test/fixtures/pr257_offset_valid.zax`: legacy compile fixture proving nested record/array/union offset forms such as `offset(Scene, sprites[Idx].color)` and `offset(Node, payload.asWord)`.
- `test/pr1049_record_named_init_data_lowering.test.ts`: protects inherited named/positional record initializer lowering. Keep only as ZAX retirement evidence, not as an AZM-native requirement.
- `test/pr770_typed_reinterpretation_diagnostics.test.ts`: exercises diagnostics for typed reinterpretation paths. Preserve while deciding how constant layout casts should be split from hidden typed access.
- `test/pr819_exact_scale_lowering.test.ts`: protects inherited exact-scale runtime indexing helpers. This should be quarantined from the first AZM layout-constant slice unless an AST op or explicit lowering feature is deliberately retained.

## Gaps before implementation

1. There is no AZM-native compile test proving `sizeof(Sprite[16])` can be used in assembler constants and reserve directives.
2. There is no focused compile test for `offset(Sprite[16], [2].field)` as the public array-path spelling described in the AZM design.
3. The immediate parser currently accepts numeric array lengths inside type-expression arguments, but the audit found no parser-level support for arbitrary constant expressions in type-expression array lengths such as `Sprite[COUNT]`.
4. The explicit layout-cast syntax is currently tied to `EaReinterpret`, which `.azm` deprecation logic treats as inherited typed effective-address syntax. The AZM subset needs a policy split between constant layout casts to keep and runtime typed access to warn on.
5. Runtime register indexes are still supported in some inherited typed-address lowering paths. The layout-constant feature must reject them when the expression is meant to fold to a constant.
6. `storageInfoForTypeExpr` and `sizeOfTypeExpr` are already exact-size, but the name `storageInfo` still suggests the older storage/lowering role. A later cleanup should either rename it or constrain its callers.
7. Typed data, typed var/global storage, and typed assignment share layout helpers with the desired constant feature. The next implementation slice needs tests that prove the helpers survive after those high-level surfaces are retired or quarantined.

## Recommended first implementation slice

1. Lock exact-size tests for `sizeof(Sprite[16])`.
2. Lock `offset(Sprite, field)` and nested record paths.
3. Lock `offset(Sprite[16], [2].field)`.
4. Reject runtime register indexes inside layout-cast paths.
5. Add one compile-level example using `.equ` constants and `.ds sizeof(Sprite[16])`.
6. Add one compile-level example for `ld hl,<Sprite[16]>SPRITES[BASE + 1].pos.x` where the whole expression folds to an address constant.
7. Keep inherited typed-data and runtime-index lowering tests in the ZAX retirement bucket until AZM explicitly chooses a replacement.

## Implementation boundaries

The first AZM layout implementation should not:

- generate multiply/add code for runtime indexes
- infer a type for a label without an explicit cast or constant query
- retain `:=` typed assignment as a native AZM feature
- require typed `data`, `var`, or `globals` blocks for ordinary assembly layout
- preserve rounded storage-size behavior under another name

The expected user-facing shape is ordinary assembly:

```asm
SPRITE_SIZE  .equ sizeof(Sprite)
SPRITE_FLAGS .equ offset(Sprite, flags)

SPRITES:
        .ds sizeof(Sprite[16])

        ld      hl,<Sprite[16]>SPRITES[BASE + 1].flags
```

The value in `HL` is an assembled constant address. Any runtime indexing still
belongs in explicit Z80 instructions or a future `op` helper.
