# ADDR-EXPR-01: address-of storage paths

Status: Draft discussion paper
Scope: define explicit address-of syntax for typed storage paths after the `move`/`ld` split
Purpose: add a clean ZAX-layer way to obtain runtime addresses of typed storage locations without putting new operand magic back into classic `ld`

## Contents
- [1. Problem statement](#1-problem-statement)
- [2. Chosen direction](#2-chosen-direction)
- [3. Surface syntax](#3-surface-syntax)
- [4. Semantic category](#4-semantic-category)
- [5. Exact interaction with `move` and `ld`](#5-exact-interaction-with-move-and-ld)
- [6. Exact interaction with typed storage paths](#6-exact-interaction-with-typed-storage-paths)
- [7. Exact interaction with raw labels](#7-exact-interaction-with-raw-labels)
- [8. Grammar and AST impact](#8-grammar-and-ast-impact)
- [9. Staged implementation plan](#9-staged-implementation-plan)
- [10. Non-goals](#10-non-goals)

## 1. Problem statement

After the `move` split, ZAX has a cleaner boundary:

- `move` handles register ↔ typed-storage transfer
- `ld` handles classic assembler semantics

One useful capability is still missing: taking the address of a typed storage path. Programmers sometimes need the address of a variable, field, or indexed element as a runtime value so it can be placed in a register and used explicitly.

That capability should exist, but it should live in the ZAX layer, not on top of raw `ld`. If `@path` is introduced, it should extend `move`, not reintroduce ZAX-only operand magic into a classic Z80 mnemonic.

## 2. Chosen direction

The chosen direction is:

- use outermost-prefix `@path` syntax
- define it only for storage-path operands, not for general expressions
- attach it to `move`, not to `ld`
- make it mean “address of this typed storage path” when used in a register-loading `move`

This keeps the feature explicit and consistent with the `move` split. ZAX storage semantics stay under ZAX constructs.

## 3. Surface syntax

The v1 spelling is:

```zax
@x
@array[i]
@record.field
@items[idx].next
@<Sprite>hl.flags
```

The `@` applies only as the outermost prefix to a storage path.

Not allowed in v1:

```zax
array[@i]
@@x
@(@x)
@(<Sprite>hl.flags)
```

The feature is intentionally narrow. `@` is not a general-purpose unary operator, so it cannot wrap arbitrary parenthesized groupings or participate in normal expression nesting.

## 4. Semantic category

`@path` is not an `imm_expr` and not a normal scalar value expression. It is an address-of storage-path form.

That means:
- it is resolved from a typed storage path
- it lowers to runtime address computation as needed
- it can depend on frame offsets, register indices, or field offsets
- it is not restricted to assembler-time constants

So `@x` for a local variable is valid even though the resulting address is not a fixed literal. The compiler computes the address according to the storage-path rules and places that address into the destination register.

## 5. Exact interaction with `move` and `ld`

The intended v1 use is with `move` into a 16-bit register destination:

```zax
move hl, @x
move de, @array[i]
move bc, @record.field
```

These forms mean: compute the address of the storage path and place that address in the destination register pair.

`@path` is not legal as a destination in v1.

`move` remains the ZAX-layer builtin for typed storage interaction. `@path` extends that layer by adding an address-of source form.

`ld` does not accept `@path`. That is the key rule. The point of the `move` split was to stop attaching typed-storage semantics to a raw Z80 opcode. Putting `@path` on `ld` would violate that design immediately.

The v1 scope is therefore `move rr, @path` only. `@path` is not yet accepted as a general operand category for `op` invocation arguments, even when an op parameter is typed as `ea`.

## 6. Exact interaction with typed storage paths

`@` applies to the same storage-path family already used by typed access:

- globals
- locals
- arguments
- field access
- indexing
- typed reinterpretation heads such as `<Type>base.tail`

Examples:

```zax
move hl, @counter
move hl, @sprite.flags
move de, @words[i]
move hl, @<Sprite>ix.flags
```

The key rule is that `@` takes the address of the final resolved storage location. It does not load the value stored there.

## 7. Exact interaction with raw labels

Raw labels already have address semantics under classic `ld`.

That means:

```zax
ld hl, table
```

already loads the address of the raw label `table`.

Therefore raw labels do not need `@` in v1, and forms like:

```zax
move hl, @table
ld hl, @table
```

should be invalid.

This keeps the split clean:
- typed storage needs `@` to become address-valued under `move`
- raw labels are already address-valued by declaration class under classic `ld`

## 8. Grammar and AST impact

Grammar impact should be narrow.

`@path` should not become a general `ea_expr` head available everywhere. In v1 it is a grammar-restricted operand form recognized only where the language explicitly permits address-of storage paths.

The parser should recognize `@` only as the outermost prefix on a storage-path operand, producing a dedicated AST node such as:

```text
EaAddressOf {
  target: EaExprNode
}
```

The target remains an ordinary storage-path AST. The `@` wrapper changes the semantic category of that operand without changing the underlying path grammar.

No nested `@` forms are needed in v1.

## 9. Staged implementation plan

Stage 1: accept this design in docs.

Stage 2: parser/AST
- add `@path` parsing as an outermost storage-path prefix
- keep it grammar-restricted to the accepted v1 operand positions
- reject nested or interior uses
- reject raw-label uses explicitly if needed

Stage 3: lowering/semantics
- lower `move rr, @path` by computing the runtime address of the storage path
- support globals, locals, args, fields, indexes, and typed reinterpretation heads
- keep `ld` unchanged

Stage 4: examples/reference
- add a small focused example set for address-of
- keep it presented as additive, not as a new center of the language

## 10. Non-goals

This stream does not do any of the following:

- restore typed-storage semantics to `ld`
- add `@path` to classic `ld`
- make `move` accept address-of destinations
- add general pointer arithmetic
- add `@` as a general expression operator
- add `@` support for raw labels where bare label syntax already gives address semantics

This is a narrow feature: explicit address-of for typed storage paths in the ZAX layer.
