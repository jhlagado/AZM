# `move` vs `ld` Language Rationale

**Date:** 2026-03-13
**Status:** Direction accepted; implementation planning pending
**Source:** Post-`LANG-02` language-boundary review

This paper asks whether ZAX should stop overloading `ld` with typed variable
semantics and instead introduce a distinct builtin, `move`, for typed
register↔storage transfers.

## Contents

1. [Why this question exists](#1-why-this-question-exists)
2. [Exact semantic split between `move` and `ld`](#2-exact-semantic-split-between-move-and-ld)
3. [Source compatibility and migration impact](#3-source-compatibility-and-migration-impact)
4. [Grammar impact](#4-grammar-impact)
5. [Examples rewritten both ways](#5-examples-rewritten-both-ways)
6. [Implications for raw label and data directives](#6-implications-for-raw-label-and-data-directives)
7. [Staged implementation plan](#7-staged-implementation-plan)

---

## 1. Why this question exists

ZAX currently asks `ld` to do two different jobs.

First, it inherits ordinary Z80 meaning. In classic assembler, `ld` works over
registers, immediates, labels, and parenthesized memory forms. Symbols are
address-like, and the mnemonic belongs to the raw machine layer.

Second, ZAX lets `ld` consume typed storage paths. Bare globals, arguments, and
locals act like values. Fields and indexes are expressed directly. The compiler
interprets forms such as `ld a, x`, `ld hl, words[idx]`, or `ld sprite.flags, a`
using frame layout, field offsets, and typed indexing rules.

Those are not naturally the same language. No other Z80 mnemonic in ZAX carries
this much typed storage-path meaning. `add`, `sub`, `adc`, and `inc` remain much
closer to classic Z80 operand rules. `ld` is the outlier.

That makes `ld` a hybrid. It looks like a standard Z80 instruction while
quietly serving as the main gateway into the typed variable model. If the
project wants a cleaner language boundary, this is the place to address it.

The question, then, is whether ZAX should keep overloading a standard Z80
mnemonic, or whether it should separate the layers explicitly:

- `ld` for classic assembler-style semantics
- `move` for typed variable and storage semantics

This is a language-identity decision, not just an implementation detail.

---

## 2. Exact semantic split between `move` and `ld`

The proposed split is simple.

`ld` belongs to the raw assembler layer. `move` belongs to the ZAX typed-storage
layer.

### `ld`: raw assembler semantics

`ld` should keep classic assembler-style meaning as closely as ZAX can support
it. It should be used for register-to-register transfers, register immediates,
raw labels, parenthesized label-based memory access, and ordinary machine-facing
memory traffic.

If a symbol is a raw label, then `ld` treats it as address-like in the classic
sense:

```z80
ld a, x
ld a, (x)
ld hl, x
ld hl, (x)
```

Under this model, `ld` is not responsible for typed globals, frame variables,
record fields, or typed indexing.

### `move`: typed variable and storage semantics

`move` is the builtin for typed storage transfer. It is responsible for globals,
arguments, locals, frame-based scalar storage, record field access, typed array
indexing, and runtime indexing from registers or scalar names.

Typical forms are:

```zax
move a, x
move x, a
move hl, words[idx]
move words[idx], hl
move a, sprite.flags
move sprites[c].x, a
```

These are not raw assembler operands. They are typed storage paths.

### Symbol kind must drive meaning

This only works if declaration kind is explicit.

- typed storage declarations create value-semantics symbols
- code labels create address-semantics symbols
- raw data-layout declarations create address-semantics symbols

Then the split is coherent:

- `move` consumes typed storage paths
- `ld` consumes raw assembler operands and raw labels

### Registers are a third category

Registers are neither typed storage nor raw labels. That matters.

The correct rule is not “use `move` for everything value-like.” The correct rule
is narrower:

- `move` is only for register ↔ typed-storage transfer
- `ld` remains the raw Z80 form for register ↔ register and classic raw-memory
  work

So these remain `ld`:

```z80
ld a, b
ld hl, de
```

And these are valid `move` forms:

```zax
move a, x
move x, a
move hl, words[idx]
move words[idx], hl
```

with exactly one register operand and exactly one typed storage-path operand.
That means:

- `move a, b` is invalid
- `move x, y` is invalid
- `move words[i], sprite.flags` is invalid

If a typed-storage to typed-storage transfer is wanted, it must go through a
register, which matches the underlying Z80 execution model.

### `LANG-02` is direct precedent

`LANG-02` makes the current tension obvious. Current ZAX now supports forms such
as:

```zax
ld a, <Sprite>hl.flags
ld <Sprite>hl.flags, a
```

These are plainly ZAX-layer constructs: typed reinterpretation head, field
traversal, and compiler-managed offset semantics. They are not classic Z80
operand forms. Under the proposed split they become:

```zax
move a, <Sprite>hl.flags
move <Sprite>hl.flags, a
```

which makes the layer boundary explicit instead of implied.

---

## 3. Source compatibility and migration impact

This is a real source-language migration, not a cosmetic rename.

Any current code that uses `ld` with typed variable or typed storage-path
semantics would need to move to `move`.

For example:

```zax
ld a, x
ld x, a
ld hl, words[idx]
ld words[idx], hl
ld a, sprite.flags
ld sprites[c].x, a
```

would become:

```zax
move a, x
move x, a
move hl, words[idx]
move words[idx], hl
move a, sprite.flags
move sprites[c].x, a
```

Meanwhile raw assembler-style uses remain `ld`:

```z80
ld a, label
ld a, (label)
ld hl, label
ld hl, (label)
```

This has immediate impact on examples, tests, docs, and the canonical teaching
surface.

Three migration strategies exist:

**Hard break.** Typed `ld` disappears immediately. This is the cleanest language
boundary, but the largest immediate rewrite.

**Transitional aliasing.** `move` becomes canonical, but typed `ld` remains for
compatibility for a limited time. This reduces churn but keeps ambiguity alive
for a while.

**Implementation split first.** Internally separate the semantics first, expose
`move` later. This reduces surface churn initially but prolongs conceptual
confusion.

Given the current project state, the best stance is already decided:

- `move` is the chosen direction
- migration is a hard break
- raw data directives are a later dependent stream

So this paper does not recommend indefinite coexistence. The language should not
carry `ld` and `move` as equal first-class spellings for the same semantics.

---

## 4. Grammar impact

This proposal matters to the grammar because it moves typed storage-path syntax
out of `ld` and into an explicit instruction family.

Today, `ld` effectively accepts a richer operand language than most other Z80
mnemonics: bare typed names, fields, indexes, nested paths, and runtime-indexed
storage access. In practice, typed `ld` is living inside the current opaque
`z80_instruction` parser path.

A `move` transition would change that. It would not just add a keyword. It would
pull the typed-storage operand family out of the current `ld` path and give it a
first-class grammar branch.

At draft level, the shape is straightforward:

```ebnf
instr_line = z80_instruction
           | move_stmt
           | op_invoke
           | func_call
           | ...

move_stmt  = "move" , move_lhs , "," , move_rhs ;
move_lhs   = reg8 | reg16 | typed_storage_path ;
move_rhs   = reg8 | reg16 | typed_storage_path | address_of_path ;
```

with the semantic rule that exactly one side must be a register and the other
side must be a typed storage path, or later an explicitly accepted address-of
storage-path form.

The long-term benefit is that the grammar becomes more honest about operand
categories:

1. raw assembler operands
2. typed storage-path operands
3. control-flow targets and labels

The transitional cost is that, if compatibility is retained, the parser may need
to accept old typed `ld` forms for a while. That would temporarily make the
grammar messier even if the target grammar is cleaner. Under the currently
chosen hard-break stance, that transitional burden is smaller.

This also aligns with grammar reform. Grammar should distinguish instruction
family and broad operand category. Symbol resolution should then decide whether a
name is typed storage, code label, or future raw data label.

---

## 5. Examples rewritten both ways

These examples show the language effect directly.

### Scalar global byte

Current:

```zax
ld a, flag
ld flag, a
```

Proposed:

```zax
move a, flag
move flag, a
```

This is the smallest case. It also shows the cost most clearly: even simple
scalar variable access changes spelling.

### Local/frame scalar

Current:

```zax
func bump()
  var
    x: byte = 2
  end
  ld a, x
  inc a
  ld x, a
end
```

Proposed:

```zax
func bump()
  var
    x: byte = 2
  end
  move a, x
  inc a
  move x, a
end
```

This is one of the stronger arguments for `move`. A frame variable is not a
classic assembler label in any useful sense.

### Indexed byte array

Current:

```zax
ld a, bytes[c]
ld bytes[c], a
```

Proposed:

```zax
move a, bytes[c]
move bytes[c], a
```

This makes typed runtime indexing explicit instead of hiding it inside `ld`.

### Indexed word array

Current:

```zax
ld hl, words[idx]
ld words[idx], hl
```

Proposed:

```zax
move hl, words[idx]
move words[idx], hl
```

This is the central case. It shows clearly that current `ld` is carrying a
substantial typed storage-path language.

### Record field access

Current:

```zax
ld a, sprite.flags
ld sprite.flags, a
ld hl, sprite.position
```

Proposed:

```zax
move a, sprite.flags
move sprite.flags, a
move hl, sprite.position
```

Again, the benefit is not new capability. It is clearer layer ownership.

### Raw label semantics

These remain unchanged:

```z80
ld a, (table)
ld hl, table
ld hl, (table)
```

That is the point. `ld` keeps raw assembler meaning.

### Mixed code showing the boundary

Current:

```zax
ld hl, jump_table
ld a, state
ld hl, words[idx]
ld sprite.flags, a
```

Proposed:

```zax
ld hl, jump_table
move a, state
move hl, words[idx]
move sprite.flags, a
```

This is the best reading test in the paper. The proposed version visibly tells
you which operations are raw address work and which are typed storage work.

### `op` call site versus `op` body

This proposal does **not** mean “replace `ld` everywhere.” `op` bodies remain raw
instruction text.

At the call site:

```zax
move a, sprite.flags
```

Inside an `op` body:

```zax
op copy_a_to_hl_byte()
  ld (hl), a
end
```

So the split is at the source-language typed-storage boundary, not inside raw
instruction bodies.

---

## 6. Implications for raw label and data directives

If `move` becomes the typed-storage builtin, then raw labels and raw data become
more important, not less.

Typed storage already works well for variables, records, arrays, and frame-based
program state. What it does not fully cover is classic raw memory authoring:
byte tables, word tables, reserved blocks, packed blobs, jump tables, patch
areas, and other address-oriented layouts.

Typed reinterpretation helps you read through an address as a type. It does not
by itself give you a clean way to declare raw address-semantics data.

So if `ld` returns to classic semantics, the language likely also needs a
first-class raw data declaration family later. Whether the spelling is `DB`/
`DW`/`DS` or some more ZAX-shaped equivalent is not the decision here. The key
point is semantic:

- typed storage declarations create value-semantics symbols
- raw data-layout declarations create address-semantics symbols

Then the model becomes coherent:

```zax
move a, counter
ld hl, table
ld a, (table)
```

This fits the grammar reform as well. Raw data directives should introduce their
own AST and symbol classes rather than being treated as incidental parser cases.

The sequencing decision is already made here too: raw data directives are part
of the same overall reform family, but they are a later dependent stream, not
part of the immediate `move` decision.

---

## 7. Staged implementation plan

This reform should be implemented in stages.

### Stage 0 — decision lock

This stage is now the purpose of the paper. The key decisions are:

- `move` is the chosen direction
- migration will be a hard break
- raw data directives are a later dependent stream

Nothing should move into implementation until this boundary is accepted.

### Stage 1 — semantic and grammar groundwork

Prepare the parser and semantics for the split:

- identify the exact typed-storage operand family currently living under `ld`
- identify the raw-assembler operand family that stays under `ld`
- formalize symbol classes for typed storage, code labels, and future raw data
  labels
- define the `move` grammar and constraints precisely

### Stage 2 — introduce `move`

Add `move` as a builtin instruction family for typed storage semantics.

At this stage, `move` carries the forms currently handled by typed `ld`:

- scalar typed storage
- field access
- typed indexing
- register ↔ typed-storage transfer only

### Stage 3 — migrate public material

Once `move` exists, update:

- quick guide
- language-tour examples
- canonical tutorial examples
- reference material that currently teaches typed variable access through `ld`

This is where the repository should distinguish between canonical examples and
historical/regression coverage.

### Stage 4 — enforce the break

Because the chosen migration is a hard break, typed `ld` should then be removed
rather than kept as a lingering alias. The parser, diagnostics, and docs should
all reinforce the new boundary.

### Stage 5 — raw data / raw label completion

After the `move`/`ld` split is established, add the raw data declaration family
that gives `ld` a full classic address-semantics world to operate in.

### Stage 6 — cleanup

Finally:

- archive superseded design notes
- simplify parser paths that existed only during the transition
- align spec, grammar, reference docs, and examples to a single mature model

### What should not happen

This reform should avoid the failure modes already seen elsewhere in the
project:

- implementation before the language boundary is stable
- adding `move` without deciding what happens to typed `ld`
- rewriting examples before the builtin exists
- introducing raw data labels before symbol classes are clear
- allowing `ld` and `move` to coexist indefinitely as equal spellings

The sequence is simple: settle the boundary, implement it, migrate the public
surface, then complete the raw-label side later.
