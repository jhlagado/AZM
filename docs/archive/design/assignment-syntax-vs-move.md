# Assignment Syntax vs `move`

Status: Stage 1-4 landed; direct removal chosen

## Problem

`move` currently carries the main ZAX value-transfer surface for:

- arguments and locals
- globals
- field access
- array indexing
- typed reinterpretation
- `@path` address-of results into registers

Examples on current `main` look like this:

```zax
move hl, count
move total_value, hl
move a, sprites[L].x
move hl, <TreeNode>node_ptr.right
move hl, @player.flags
```

Semantically, these are not Z80 `ld`-style transfers. They are language-level
assignment/value-transfer operations over ZAX storage paths and typed values.

The problem is that `move` still looks like a pseudo-opcode. That hides an
important language boundary:

- raw Z80 transfer syntax should look raw
- ZAX storage/value semantics should look like a language construct

## Why this matters

ZAX already uses overt high-level syntax for other language features:

- `if` / `else`
- `while`
- `repeat`
- `select case`
- `func`
- local `var`

Against that background, `move` is visually misleading. It looks like part of
the machine-language layer even when it is doing:

- frame-slot loads and stores
- typed field access
- array indexing
- reinterpretation-based traversal

For a new reader, the current surface blurs two different worlds inside the same
function body.

## Recommendation

Introduce assignment syntax as the preferred surface for ZAX value transfer:

```zax
hl := count
total_value := hl
a := sprites[L].x
hl := <TreeNode>node_ptr.right
hl := @player.flags
```

and keep raw Z80 transfer work under `ld`:

```zax
ld a, 3
ld hl, $8000
add hl, de
```

## Syntax choice

### Prefer `:=`

Use `:=` rather than `=`.

Reason:

- `=` already has declaration/init meaning in ZAX:
  - `const X = 1`
  - `name: Type = initializer`
  - alias-style declarations `name = rhs`
- `:=` clearly signals statement-level assignment
- it visually separates declaration-time initialization from runtime transfer
- it reads naturally in the Pascal-family direction already present in the
  structured parts of the language

### Do not use `let`

`let` is too heavy for the density of this language and does not fit the current
statement style as well as `:=`.

## Initial semantic scope

The first step should stay tightly bounded, but it should be slightly broader
than current `move`.

`:=` should cover:

- everything `move` means today
- immediate-to-whole-register assignment
- whole-register and whole-register-pair copies
- width-aware zero-extension from byte sources into word-pair destinations

Examples:

```zax
hl := count
total_value := hl
a := sprites[L].x
hl := @player.flags
hl := a
hl := 0
hl := de
```

This keeps the new surface useful enough to reduce real noise in the examples
without taking over raw Z80 transfer forms.

## Raw-vs-language boundary after the change

### Raw Z80 layer

Keep under assembler syntax:

- `ld`
- arithmetic/logic ops
- jumps
- stack ops
- explicit machine-level register/immediate movement

### ZAX layer

Use assignment syntax for:

- locals / args / globals
- fields and indices
- typed reinterpretation
- `@path` address acquisition
- immediate-to-whole-register assignment
- whole-register and whole-register-pair copies
- width-aware whole-value widening such as `hl := a`

This makes the mixed-language model visible instead of disguising it.

## Current status

Stage 1 is now implemented on `main`:

- `:=` is available as the preferred assignment/value-transfer surface
- whole-register immediates are supported
- whole-register and whole-register-pair copies are supported
- byte-to-pair widening is supported
- `rr := @path` is supported
- `move` still remains as a transitional surface

## Remaining blocker to removing `move`

There is no longer a code-surface blocker in the active assignment model:

- reg8 assignment support is landed
- `IX` / `IY` assignment support is landed
- live docs/examples have already been swept to `:=`

The remaining `move` uses on `main` are now compatibility and historical cases,
not missing assignment-surface capability.

## Migration plan

### Stage 1

Landed on `main`.

### Stage 2

Landed on `main`:

- loads into `B`, `C`, `D`, `E`, `H`, `L` (`A` already landed in Stage 1)
- stores from `B`, `C`, `D`, `E`, `H`, `L` (`A` already landed in Stage 1)
- byte immediates into 8-bit registers

### Stage 3

Landed on `main`:

- `ix := word_var`
- `iy := @node.next`
- `ix := arr_w[idx + 1]`
- bounded whole-register `IX` / `IY` assignment only

### Stage 4

Landed on `main`.

### Stage 5

Remove `move` from parser/lowering/docs after compatibility cleanup.

## Retirement policy

The retirement path should now be:

1. keep `:=` as the only recommended user-facing surface
2. classify remaining `move` uses into:
   - explicit compatibility tests
   - historical/design references
   - stale ordinary coverage
3. convert all stale ordinary coverage to `:=`
4. keep only a narrow compatibility subset proving that legacy `move` still
   aliases the same lowering behavior during the cleanup phase
5. then remove `move` directly from parser/lowering/docs

The important rules are:

- no new active examples, docs, or ordinary coverage should be written with `move`
- there will be no warning-only grace phase
- the next step after compatibility cleanup is direct removal

## Deferred forms

The following may be acceptable later, but are not required in the next slice:

- `h := d`
- `l := a`
- `sp := hl`
- `af := hl`

They are less surprising than forbidding them outright, but they blur the line
between whole-value assignment and byte-lane machine manipulation. The first
slice should stay with whole-register destinations only.

## Non-goals

Do not use this stream to:

- take over raw indirect Z80 forms such as `(hl)` or `(ix+d)`
- add general expression assignment beyond the accepted transfer cases
- add chained assignment
- add declaration-time type inference changes
- revisit raw `ld`
- require partial-register copy forms such as `h := d` or `l := a` in the first slice

## Decision

Recommended direction:

- replace `move` as the preferred surface with `:=`
- keep `ld` visibly raw
- stage this as a syntax migration, not a semantic redesign
