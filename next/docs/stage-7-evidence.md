# Stage 7 Evidence: Enums and Layout Constants

Status: active evidence pack; first implementation slice is enum constants.

Stage 7 adds retained AZM compile-time metadata without adding runtime typed
behavior. Current AZM remains the source of truth. The first slice implements
only qualified enum members as constants; layout declarations are documented
here but deferred until their parser, type-expression, `sizeof`, and `offset`
behavior can be implemented as a coherent slice.

## Evidence Read

Current AZM tests, source, docs, and book material inspected:

- `test/pr4_enum.test.ts`
- `test/fixtures/pr4_enum.asm`
- `test/fixtures/pr259_enum_unqualified_member.asm`
- `test/fixtures/pr265_enum_unqualified_ambiguous.asm`
- `test/frontend/asm_enum_constants.test.ts`
- `test/semantics/layout_constants_asm.test.ts`
- `test/semantics/layout_edge_cases.test.ts`
- `test/semantics/semantics_layout_extra.test.ts`
- `docs/reference/source-overview.md`
- `docs/reference/tooling-api.md`
- `src/frontend/parseEnum.ts`
- `src/frontend/parseTypes.ts`
- `src/semantics/env.ts`
- `src/semantics/layout.ts`
- sibling checkout `debug80-docs/azm-book/book1/13-layout-types.md`
- sibling checkout `debug80-docs/azm-book/book3/05-records.md`

## Proven Enum Behavior

Enums are compile-time grouped constants:

- `enum Mode Read, Write, Append` declares `Mode.Read = 0`,
  `Mode.Write = 1`, and `Mode.Append = 2`.
- Enum declarations emit no bytes and do not affect the current assembly
  address.
- Qualified enum members can be used anywhere an immediate constant is legal:
  `.equ`, instruction immediates, `.db`, `.dw`, and `.ds`.
- Enum member names are scoped by enum name, so `PlayerState.Idle` and
  `EnemyState.Idle` can coexist.
- Unqualified enum member references are rejected even if only one matching
  enum member exists.
- Ambiguous-looking unqualified enum members are also rejected with the same
  qualification policy.

The first Stage 7 slice implements this enum constant behavior in AZM Next.

## Proven Layout Behavior

Layout declarations are compile-time byte-size and offset metadata:

- `.type Name` / `.endtype` defines a packed record layout.
- `.union Name` / `.endunion` defines a layout where every field starts at
  offset zero and the size is the largest member.
- Inside layout blocks, `.byte`, `.word`, and `.addr` are shorthand for
  `.field byte`, `.field word`, and `.field addr`.
- `.field n` contributes `n` raw bytes.
- `.field TypeName` contributes the named layout size.
- Array type expressions such as `Sprite[16]` multiply exact element size by a
  literal count.
- `sizeof(TypeExpr)` folds to a byte count for scalar types, named layouts, and
  arrays.
- `offset(TypeExpr, path)` folds to a byte offset through record fields, union
  fields, and constant array indexes.
- `offsetof` is not an accepted alias.
- `.ds TypeExpr` reserves the byte count represented by a type expression.
- Layout types do not allocate storage by themselves and do not attach runtime
  types to labels.
- Runtime typed memory access and hidden address arithmetic are outside AZM's
  retained layout feature. Runtime indexes must be implemented with visible Z80
  instructions.

These layout behaviors are planned follow-up slices for Stage 7.
