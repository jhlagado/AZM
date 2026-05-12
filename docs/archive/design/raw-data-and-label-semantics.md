# RAW-01: raw data directives and label semantics

Status: Direction accepted; RAW-02 and RAW-03 implemented
Scope: define the raw-data complement to the `move`/`ld` split
Purpose: decide how ZAX represents classic assembler-style labels and raw memory layouts without collapsing typed storage back into overloaded `ld`

## Contents
- [1. Problem statement](#1-problem-statement)
- [2. Chosen direction](#2-chosen-direction)
- [3. Symbol classes](#3-symbol-classes)
- [4. Raw data directive family](#4-raw-data-directive-family)
- [5. Exact `ld`/`move` semantic split](#5-exact-ldmove-semantic-split)
- [6. Namespace and symbol resolution](#6-namespace-and-symbol-resolution)
- [7. Examples](#7-examples)
- [8. Grammar impact](#8-grammar-impact)
- [9. Staged implementation plan](#9-staged-implementation-plan)
- [10. Non-goals](#10-non-goals)

## 1. Problem statement

The `move` split fixed one problem: typed globals, locals, arguments, fields, and indexes no longer overload a core Z80 mnemonic. `move` now owns typed storage transfer, while `ld` is free to return to classic assembler semantics.

That split leaves a second gap unresolved. ZAX still has no explicit first-class way to author arbitrary raw memory layouts in the classic assembler style. Typed storage is good for variables and structured data. It is not a full replacement for packed tables, byte streams, patch areas, mixed records, or hand-authored memory maps.

This stream fills that gap by adding a raw-data declaration family that creates address-semantics symbols. Once those symbols exist, classic `ld` can operate on them as labels rather than as variables.

## 2. Chosen direction

The chosen direction is:

- keep typed storage declarations and `move` exactly as the typed value/storage layer
- add a separate raw-data declaration family for assembler-style layouts
- treat symbols produced by that family as address-semantics labels
- keep classic `ld` semantics for those labels

This is not a return to overloaded `ld`. It is the opposite. The language becomes cleaner because typed storage and raw labels come from different declaration families and therefore carry different semantics.

## 3. Symbol classes

This stream makes the symbol-class split explicit.

ZAX has three relevant symbol classes:

1. typed storage symbols
   - produced by typed globals, locals, arguments, and other typed storage declarations
   - bare use means stored value semantics
   - transfer uses `move`, not `ld`

2. code labels
   - produced by control-flow labeling
   - bare use means branch/call target semantics

3. raw data labels
   - produced by raw data directives such as `db`, `dw`, and `ds`
   - bare use means address semantics in the classic assembler sense
   - `ld` operates on them as labels, not as typed variables

The critical rule is declaration-driven semantics. The parser and later semantic passes must not guess from use site alone. The declaration family determines symbol class.

## 4. Raw data directive family

The design direction is to adopt a conventional assembler family:

- `db` for bytes
- `dw` for words
- `ds` for reserved space

These directives are intentionally lower-level than typed storage declarations.

They are suitable for:
- packed tables
- irregular byte streams
- jump tables
- patch regions
- hardware-facing layouts
- mixed-width data that does not justify or fit typed storage

They are not typed variables. They do not produce value-semantics storage symbols.

A raw data declaration should create a label at the current assembly location and then emit or reserve bytes from that point.

Representative shape:

```zax
section data tables at $4000
  sprite_table:
    db $10, $20, $30, $40

  jump_table:
    dw handler_a, handler_b, handler_c

  scratch:
    ds 32
end
```

The declaration family is now implemented in `RAW-02`/`RAW-03` in the accepted conventional form.

## 5. Exact `ld`/`move` semantic split

After this stream, the intended split is:

- `move` handles register ↔ typed-storage transfer
- `ld` handles classic assembler semantics, including raw labels

Examples:

```zax
var
  x: byte = 2
end
move a, x
move x, a
```

That remains typed-storage code and never uses raw-label semantics.

By contrast:

```zax
table:
  db 1, 2, 3, 4

ld hl, table      ; load label/address according to classic semantics
ld a, (table)     ; load first byte from raw memory at label
ld (table), a     ; store first byte to raw memory at label
```

That is classic assembler behavior. The symbol `table` is not a variable. It is a raw label.

This stream does not make `move` understand raw labels. That would collapse the boundary again.

## 6. Namespace and symbol resolution

The simplest coherent rule is one symbol namespace with declaration-class tracking.

That means:
- a typed global, a raw data label, and a code label cannot reuse the same name in the same scope
- symbol resolution returns both the symbol and its class
- operand semantics then branch on symbol class

This avoids two bad outcomes:
- separate namespaces that let the same spelling mean different things in one scope
- use-site guessing where the compiler infers “this looks label-like” versus “this looks variable-like”

The declaration decides the class. The class decides the semantics.

## 7. Examples

Typed storage remains on the `move` side:

```zax
section data vars at $4000
  counter: byte = 1
end

move a, counter
inc a
move counter, a
```

Raw data uses label semantics:

```zax
section data tables at $4100
  table:
    db 1, 2, 3, 4
end

ld hl, table
ld a, (table)
```

The mixed case is the point of the reform:

```zax
section data vars at $4200
  value: word = $1234
end

section data tables at $4300
  lut:
    dw $1111, $2222, $3333
end

move hl, value    ; typed storage value semantics
ld de, lut        ; raw label/address semantics
```

This is exactly the distinction the current language lacks.

## 8. Grammar impact

This stream should be treated as part of grammar reform, not as an isolated feature.

The grammar needs an explicit raw-data declaration family rather than another overloaded use of existing typed storage productions. The key parser consequence is not complexity of the directives themselves; it is preserving the declaration-class distinction into the AST and later symbol table.

In practice, `RAW-02` should add dedicated productions for labeled raw data blocks/lines rather than trying to parse them through typed variable declarations.

## 9. Staged implementation plan

Completed stages:

- docs direction accepted in `RAW-01`
- `RAW-02` parser/AST support landed
- `RAW-03` lowering/emission and classic `ld` integration landed

Remaining follow-up, if wanted later:

- add a small set of raw-data examples
- show typed storage and raw labels side by side in user-facing reference material

## 10. Non-goals

This stream does not do any of the following:

- restore typed-storage semantics to `ld`
- redesign `move`
- add address-of `@place`
- add full pointer arithmetic
- add assembler-time expression power beyond what the current language already supports

Those are separate concerns. `RAW-01` is specifically about introducing a raw-label declaration family and making classic `ld` semantics meaningful for that family.
