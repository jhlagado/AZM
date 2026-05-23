# Stage 8 Evidence: Source Compatibility and Diagnostic Hardening

Status: active evidence pack; diagnostic hardening in progress.

Stage 8 keeps AZM Next source-compatible with the retained Stage 7 layout
surface while making malformed source fail earlier and more clearly. Current
AZM remains the source of truth. This stage does not add new layout semantics.

## Evidence Read

Current AZM tests, docs, and Next implementation inspected:

- `test/semantics/layout_constants_asm.test.ts`
- `test/semantics/layout_cast_constants_asm.test.ts`
- `test/semantics/env_edge_cases.test.ts`
- `docs/reference/source-overview.md`
- `docs/reference/tooling-api.md`
- `docs/spec/azm-assembly-baseline.md`
- `next/docs/stage-7-evidence.md`
- `next/src/core/compile.ts`
- `next/src/syntax/directive-aliases.ts`
- `next/src/syntax/parse-expression.ts`
- `next/src/assembly/expression-evaluation.ts`
- `next/test/integration/minimal-assembler.test.ts`

## Proven Boundaries

Malformed layout declarations:

- `.type` and `.union` are block declarations only.
- `.type Name` must terminate with `.endtype`; `.union Name` must terminate
  with `.endunion`.
- Field declarations inside `.type` and `.union` accept only:
  `.byte`, `.word`, `.addr`, `.field n`, `.field Type`, and
  `.field Type[n]`.
- Typed pointer syntax such as `.field @Node` is not retained.
- A direct self-referential field has no finite size and should point users
  toward `.addr`.
- Unknown named field types are type errors even when the layout is not later
  used by `sizeof`, `offset`, `.ds`, or a layout cast.

Invalid `TypeExpr` and layout paths:

- `offsetof(...)` is not an accepted alias for `offset(...)`.
- Unknown `sizeof(Type)` and `sizeof(Type[n])` operands are type errors.
- Unknown `offset(Type, field)` paths are type errors.
- Array indexes in `offset(Type[n], [i].field)` and layout casts are
  compile-time constants.
- Runtime register indexes such as `<Sprite[16]>SPRITES[HL].x` are outside
  retained AZM `.asm` layout behavior.
- Layout casts require an explicit path. `<Sprite>BASE` is not accepted.
- Unresolved layout-path syntax such as `SPRITES[2].flags` is not accepted
  without a layout cast.
- Layout casts fold constants only; AZM Next must not synthesize stores,
  memory-to-memory moves, typed labels, constructors, or hidden runtime memory
  behavior.

Directive alias compatibility:

- Built-in directive aliases normalize before canonical parsing:
  `ORG`, `EQU`, `DB`, `DW`, `DS`, `ALIGN`, `END`, `BINFROM`, `BINTO`,
  `CSTR`, `PSTR`, and `ISTR`.
- Aliases are accepted case-insensitively and may appear after a label.
- `EQU` has the traditional `Name EQU expr` form.
- `.type`, `.union`, `.field`, `.byte`, `.word`, and `.addr` are retained
  dotted AZM layout forms, not legacy head aliases.

## Stage 8 Hardening Boundary

This slice tightens diagnostics without expanding accepted semantics:

- Use the correct layout kind in invalid field diagnostics.
- Validate all layout field type expressions after layout declarations are
  known, so unused recursive and unknown named fields fail closed.
- Prefer type/layout diagnostics over generic unknown-symbol diagnostics when
  evaluating layout-specific constructs.
- Reject runtime register names used as layout-cast indexes with a clear layout
  diagnostic.

Out of scope:

- Full current-AZM wording parity for every malformed source line.
- New directive aliases beyond the built-in retained set.
- Runtime typed memory access or generated layout operations.
