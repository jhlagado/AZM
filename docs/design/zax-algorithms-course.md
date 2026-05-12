# ZAX Algorithms Course — Outline, Goals, and Design Rationale

Status note: this document now describes the algorithms/data-structures course
as the second-stage volume in a broader ZAX teaching program. It is not the
beginner-first introduction to Z80 programming.

_Status: active — execution document_
_Audience: course author, contributors_

---

## 1. Purpose

This document establishes a structured course in ZAX built around classic short
algorithms from two foundational texts:

- **Kernighan and Ritchie**, _The C Programming Language_ (K&R)
- **Niklaus Wirth**, _Algorithms + Data Structures = Programs_ (Wirth)

The goal is not to translate C or Pascal into assembly. The goal is to
discover — through concrete, well-understood problems — what ZAX can say
cleanly, what it says awkwardly, and what it cannot yet say at all.

This is a **language design feedback instrument** as much as it is a course.
The algorithm examples should be treated as probes. Each algorithm that resists
clean ZAX expression is a signal: either the language is missing a construct,
or a current construct has the wrong shape.

This document should now be read as the rationale for the **algorithms volume**
of the teaching program — the part that assumes the reader already knows the
basic Z80 machine model and is ready to study larger programs in ZAX.

---

## 2. Why This Approach

### 2.1 The K&R and Wirth Canon

K&R and Wirth were chosen deliberately. These are not arbitrary examples. They
represent a half-century of consensus about which small programs are genuinely
instructive — programs that are short enough to hold in your head, varied
enough to cover the key patterns of structured programming, and deep enough to
reveal whether a language can carry real work.

K&R introduces structured programming at the machine boundary. Its examples —
binary search, string operations, the RPN calculator, the storage allocator —
are C programs but they are also architecture programs. They care about memory
layout, register width, pointer arithmetic, and the cost of an operation.

Wirth goes further into algorithmic structure: sorting families, recursive
decomposition, tree traversal, Towers of Hanoi. His examples reveal whether a
structured assembler can express non-trivial control flow without collapsing
into spaghetti.

Together, they cover the territory that matters for ZAX: programs that are too
large for raw assembly but too close to the machine for a high-level language.

### 2.2 Not a Z80 Tutorial

This is not a course about Z80 hardware. Readers are assumed to know the Z80
instruction set and register model. The course is about **using ZAX** to write
programs that are:

- readable six months later
- refactorable when requirements change
- inspectable — the reader can trace from source to output binary

### 2.3 Not a Language Survey

The course is not organized around ZAX features. It is organized around
**problems**. Feature coverage emerges from the demands of the algorithms.
This prevents the course from becoming a reference manual in disguise, and
ensures that each feature is introduced in a context where it earns its place.

### 2.4 Relationship to the planned introductory volume

The broader teaching direction now has two distinct targets:

- a beginner-facing "Learn Z80 Programming in ZAX" volume
- this algorithms-and-data-structures volume

The beginner volume should teach machine-model concepts first: bytes, two's
complement, registers, flags, memory maps, ports, branching, looping, stack,
and subroutines. This algorithms volume should remain the second-stage book that
uses substantial problems to show how ZAX carries real programs.

---

## 3. Course Goals

1. **Demonstrate ZAX as a viable medium for structured systems programming on
   Z80.** The completed example suite should stand as a body of non-trivial ZAX
   code that readers can study, run, and modify.

2. **Surface language shortcomings through use.** Each algorithm that fails to
   express cleanly is a candidate for a language change. The course is the
   first large-scale ZAX use case. Its friction points feed directly into the
   language roadmap.

3. **Establish a style.** ZAX code has a distinctive voice — it is assembly,
   but structured. The examples should model that voice consistently. Future
   ZAX authors will learn the idiom by reading these examples.

4. **Validate the design decisions already made.** The `move`/`ld` split with
   typed-storage value semantics, `@path` for address-of, `<Type>base.tail`
   typed reinterpretation, grouped and ranged `select case`, `op` overload
   resolution, the IX-anchored frame model — these features exist because design
   arguments said they were needed. The algorithms will confirm or challenge
   those arguments with actual code.

5. **Identify the design decisions not yet made.** Missing features will
   announce themselves as comments, workarounds, or hand-lowered sequences in
   the examples. These become the input to the next design cycle.

---

## 4. Style Guide for Course Examples

Every example in the course must follow these conventions. All examples must be
written against the current normative surface defined in
`docs/spec/zax-spec.md`, with `docs/reference/ZAX-quick-guide.md` as the
practical reference.

### 4.1 Typed Storage First; Raw Data for Raw Data

All working data lives in typed storage — `byte`, `word`, `addr`, records,
arrays — declared in `section data ... end` blocks or function `var` blocks.
`bin` and `hex` directives are for importing external binary blobs.

ZAX does provide raw data directives (`db`, `dw`, `ds`) for interoperability
with classic assembler data and for low-level interface constants. These are
deliberately kept away from working algorithm data: a course example that uses
`db` for its main data structures has missed the point of the language.

```zax
; correct — typed array for working data
section data assets at $8100
  digits: byte[] = "0123456789"    ; inferred length 10
  table:  word[4] = { 100, 200, 300, 400 }
end

; raw db/dw are reserved for ROM constants and interface tables —
; never for algorithm state or working buffers
```

### 4.2 `move` for Typed Storage; `ld` for Raw Z80

The `move`/`ld` split is the central design decision in the current ZAX
surface. **`move` carries typed-storage value semantics; `ld` is raw Z80.**

`move reg, symbol` reads the value stored at a typed symbol. `move symbol, reg`
writes it back. The compiler resolves the IX-relative or absolute
load/store sequence.

`ld` is a raw Z80 mnemonic. It operates on registers, raw immediates, and raw
memory dereferences. It has no knowledge of typed storage symbols.

```zax
section data state at $8000
  count: word = 0
  mode:  byte = 0
end

func bump(): void
  move hl, count    ; reads 16-bit VALUE stored in 'count' into HL
  inc hl
  move count, hl    ; writes HL back to 'count'

  move a, mode      ; reads byte VALUE stored in 'mode' into A
  inc a
  move mode, a      ; writes A back to 'mode'

  ld hl, $FF00      ; raw Z80: load an immediate constant — not a typed symbol
  ld a, (hl)        ; raw Z80: dereference HL — not a typed storage access
end
```

The `@path` address-of form produces the address of a typed storage path.
It is valid only on the source side of `rr := @path`:

```zax
hl := @sprite.flags      ; HL = address of sprite.flags
de := @sprites[bc].x     ; DE = address of sprites[BC].x
```

Typed reinterpretation `<Type>base.tail` extends the place-expression model to
runtime address values:

```zax
move a, <Sprite>hl.flags    ; read Sprite.flags field relative to HL as base
```

The cast does not permanently type the register — it only supplies a typed base
for the following field/index path.

### 4.3 Structured Control Flow Always

Never use conditional jumps to structured labels as a substitute for
`if`/`while`/`repeat`/`select`. The only labels in an example are those the
reader genuinely needs to see — `djnz` loop anchors, computed dispatch targets.

```zax
; correct — structured selection with range case
move a, mode
select A
  case Mode.Idle
    move a, 0
  case Mode.Run
    move a, 1
  else
    move a, $FF
end

; correct — range case for character classification
select A
  case 'a'..'z', 'A'..'Z', '_'   ; letter or underscore
    ; identifier character
  case '0'..'9'
    ; digit character
  else
    ; other
end

; correct — do-while with natural flag test
repeat
  ld a, (hl)
  inc hl
  or a               ; sets Z if zero byte
until Z
```

### 4.4 Functions for Every Named Operation

Every algorithm has at least one named function. Helper routines that are
called from more than one place are always `func` or `op` definitions — never
copy-pasted instruction sequences with a comment header.

### 4.5 Comments Explain the Algorithm, Not the Instruction

Assembly comments that explain what a single instruction does are noise.
Comments in the course examples explain algorithmic decisions: why this loop
structure, why this register assignment, what invariant this sequence
maintains.

```zax
; BAD — comments explain the instruction, not the algorithm
move hl, count   ; load count into HL
inc hl           ; increment HL
move count, hl   ; store HL back

; GOOD — comment explains why the advance happens here
; advance past the current element before yielding to caller
move hl, count
inc hl
move count, hl
```

### 4.6 `op` for Reusable Instruction Families

When an idiom recurs across more than one function — a byte-load-and-advance,
a compare-and-swap, a rotate-and-mask — it is factored into an `op`. This is
the correct use of `op`: named, overloadable instruction families with
compiler-enforced operand matching.

```zax
; a recurring pointer-advance pattern
op fetch_advance(dst: reg8)
  ld dst, (hl)
  inc hl
end

; an instruction family with typed destination
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end
```

### 4.7 Explicit Return Register and Preservation

Every `func` that returns a value must declare its return register in the
signature. The compiler enforces the complementary callee-save set mechanically;
comments should document algorithmic register _choices_, not preservation rules
the signature already declares.

```zax
; return register declared in signature — compiler preserves AF, BC, DE
func sum(a: word, b: word): HL
  move hl, a
  move de, b
  add hl, de
end

; void: compiler preserves AF, BC, DE, HL at the call boundary
func clear(buf: addr, len: word): void
  move hl, buf
  move b, len       ; B is the loop counter — an algorithmic choice worth noting
  xor a
  repeat
    ld (hl), a
    inc hl
    dec b
  until Z
end
```

### 4.8 No Unexplained Magic

Any hand-optimized sequence that diverges from the obvious implementation must
be accompanied by a comment explaining the transformation and its cost
rationale. The course teaches optimization as a deliberate act, not a reflex.

---

## 5. Algorithm Catalogue

Algorithms are organized in four tiers by dependency on language features not
yet fully implemented. The tier is a planning signal, not a permanent ranking.

### Tier 1 — Available Now

These algorithms can be written in clean ZAX today using the current normative
surface: typed storage, `func`, `if`/`while`/`repeat`/`select` with ranges,
`op`, `const`, `enum`, arrays, records, `@path`, `<Type>base.tail`.

#### 1A: Arithmetic and Number Theory

| Algorithm                                | Source     | ZAX Features Exercised                        |
| ---------------------------------------- | ---------- | --------------------------------------------- |
| Integer power by repeated multiplication | K&R §1.2   | `func`, `while`, `word` params, return `HL`   |
| Euclid's GCD (iterative)                 | Wirth Ch.1 | `while`, `if NZ`, subtraction-loop remainder  |
| Euclid's GCD (recursive)                 | Wirth Ch.1 | recursive `func`, IX frame across calls       |
| Integer square root (Newton step)        | Wirth Ch.1 | `while`, convergence test with `sbc hl, de`   |
| Exponentiation by squaring               | Wirth Ch.1 | `if`, halving via `sra`, shift-and-multiply   |
| Fibonacci (iterative)                    | Wirth Ch.1 | `while`, two-variable rolling state in locals |
| Decimal digit decomposition              | K&R §1.2   | division-by-10, character offset, `repeat`    |

Note: a Fibonacci reference implementation already exists at
`test/language-tour/02_fibonacci_args_locals.zax`. That file is the style
baseline for Unit 2.

#### 1B: Sorting and Searching

| Algorithm                         | Source     | ZAX Features Exercised                               |
| --------------------------------- | ---------- | ---------------------------------------------------- |
| Insertion sort (byte array)       | Wirth Ch.2 | `byte[]`, indexed write, `while NC` inner loop       |
| Shell sort (byte array)           | Wirth Ch.2 | variable gap in local, nested `while`, in-place swap |
| Selection sort                    | K&R §5.6   | `byte[]`, min-index tracking, exchange               |
| Bubble sort                       | baseline   | nested `while`, swap `op`, pass-completion flag      |
| Counting sort                     | technique  | `byte[]` two-pass, offset-index, no comparisons      |
| Prime sieve (Eratosthenes)        | Wirth Ch.5 | `byte[256]`, nested `while`, constant-stride marking |
| Linear search (byte array)        | K&R §3.3   | `while`, early exit via `djnz` with label            |
| Binary search (sorted byte array) | K&R §3.3   | `word` lo/hi locals, midpoint via `sra`, `while`     |
| Sentinel linear search            | Wirth Ch.2 | array with one extra cell, single-test `repeat`      |

Binary search midpoint calculation `(lo + hi) >> 1` has a natural Z80
expression: `add hl, de` then `sra h` / `rr l` for arithmetic right-shift
of a 16-bit pair.

#### 1C: String Operations

| Algorithm                     | Source   | ZAX Features Exercised                           |
| ----------------------------- | -------- | ------------------------------------------------ |
| String length (`strlen`)      | K&R §5.3 | `byte[]`, null-sentinel `repeat ... until Z`     |
| String copy (`strcpy`)        | K&R §5.3 | two `addr` locals, dual-pointer `repeat`         |
| String compare (`strcmp`)     | K&R §5.3 | character-by-character `while`, three-way result |
| String concatenate (`strcat`) | K&R §5.3 | call `strlen` to find end, then copy             |
| String reverse (in-place)     | K&R §1.9 | `addr` front/back, `while`, swap via `A`         |
| Atoi (string to integer)      | K&R §2.7 | `select A` for digit test, 16-bit accumulate     |
| Itoa (integer to string)      | K&R §3.6 | digit extraction loop, reverse result            |

String operations expose the recurrent Z80 pointer-advance idiom. The pattern
`ld A, (HL)` / `inc HL` recurs throughout and is the natural `op fetch_advance`
candidate:

```zax
op fetch_advance(dst: reg8)
  ld dst, (hl)
  inc hl
end
```

#### 1D: Bit Manipulation

| Algorithm                | Source   | ZAX Features Exercised                             |
| ------------------------ | -------- | -------------------------------------------------- |
| Population count (byte)  | K&R §2.9 | `while`, `rra` / carry test, accumulate in `B`     |
| Bit reversal (byte)      | classic  | `while`, `rla`/`rra` shift pair, 8-iteration loop  |
| Parity (byte)            | classic  | `xor` reduction, `op parity` over `reg8`           |
| Highest set bit position | classic  | `while`, `srl A`, count-down in `B`                |
| Extract bit field        | K&R §2.9 | `op getbits(val: reg8, offset: imm8, width: imm8)` |

The bit manipulation group is where `op` with `imm8` matchers pays off.
`getbits` expands to a shift-and-mask sequence parameterized entirely at
compile time.

#### 1E: Data Structure — Ring Buffer

The ring buffer is the canonical embedded data structure: fixed-size, head/tail
pointers, modular arithmetic. It is the first complete record example.

```zax
const RingSize = 16
const RingMask = RingSize - 1    ; = %00001111, assumes power-of-two

type Ring
  buf:  byte[16]    ; sizeof(Ring) = 16 + 1 + 1 + 1 = 19 (exact-size layout)
  head: byte
  tail: byte
  len:  byte
end

section data io at $8200
  rx_ring: Ring = 0    ; zero-initialize all fields
end
```

| Algorithm                         | ZAX Features Exercised                     |
| --------------------------------- | ------------------------------------------ |
| Ring buffer init                  | `record`, `section data`, zero-initializer |
| Ring buffer push                  | field `move`, `and RingMask` for wrap      |
| Ring buffer pop                   | `select` on empty predicate, early return  |
| Ring buffer full/empty predicates | `func` returning `byte`, field compare     |

The ring buffer exercises exact-size layout directly: `sizeof(Ring) = 19`. A
runtime-indexed array of rings uses the binary-decomposition multiply path
(`×16 + ×2 + ×1` for stride 19). It is a concrete validation case for the
exact-size lowering that landed in #817–820.

#### 1F: Classic Puzzles and Recursion

| Algorithm               | Source     | ZAX Features Exercised                           |
| ----------------------- | ---------- | ------------------------------------------------ |
| Towers of Hanoi         | Wirth Ch.4 | recursive `func`, depth as `byte` param          |
| Recursive array sum     | Wirth Ch.4 | base case test, recursive call, `HL` accumulator |
| Recursive array reverse | Wirth Ch.4 | index passing, `@path` for address-of element    |

Towers of Hanoi with no local state beyond arguments makes the IX frame cost
minimal and the recursion structure legible. The output action — recording or
printing a move — is a natural `extern func` hook to a BIOS call or trace
buffer append.

---

### Tier 2 — Needs Design Clarity

These algorithms are implementable but require workarounds that reveal genuine
language gaps. They should be written with explicit commentary on what is
missing, and the workarounds should feed the roadmap.

#### 2A: Quicksort

Quicksort requires a recursion stack or explicit software stack for partition
boundaries. ZAX has no first-class construct for a typed software push/pop
stack. The example will implement it as a `word[]` with an explicit `sp_idx`
local — clear but verbose:

```zax
const StkDepth = 16

section data sort_state at $8300
  stk:    word[16]
  stk_sp: byte = 0
end

op stk_push(val: reg16)
  move a, stk_sp
  ld l, a
  ld h, 0
  move stk[HL], val
  inc a
  move stk_sp, a
end

op stk_pop(dst: reg16)
  move a, stk_sp
  dec a
  ld l, a
  ld h, 0
  move dst, stk[HL]
  move stk_sp, a
end
```

The friction here — keeping `stk_sp` in sync, indexing a global array from
inside a function that also has its own IX frame — is the precise gap the
course should expose. This feeds into design of a `stack` type or dedicated
push/pop `op` idiom.

#### 2B: Merge Sort (bottom-up, iterative)

Bottom-up merge sort avoids recursion by operating on runs of increasing width.
The ZAX gap is not a missing construct but the verbosity of tracking four index
variables simultaneously — a candidate for an `op merge_pass` idiom. This is a
design probe for whether `op` with multiple `ea` parameters can carry enough
state to be useful as a loop abstraction.

#### 2C: RPN Calculator (K&R §4)

The operand stack is natural (a `word[]` with a local stack pointer, as in
§2A). The lexer loop now has grouped and ranged `case` available:

```zax
select A
  case '0'..'9'
    ; accumulate digit
  case '+', '-', '*', '/'
    ; operator dispatch
  else
    ; unknown token
end
```

This works today. The remaining Tier 2 issue is the software stack itself —
the RPN calculator is the cleanest concrete motivator for a first-class stack
type. The example should be written using the `stk_push`/`stk_pop` op idiom
from §2A, with a comment noting where a dedicated stack type would improve
clarity.

---

#### 2D: Linked List (K&R §6.5)

A linked list node can be written today with an `addr` field in an ordinary
record, and traversed with `<Node>base.tail`:

```zax
type Node
  value: word
  next:  addr      ; holds address of the next Node (or 0 for end-of-list)
end

section data heap at $8400
  nodes: Node[16]    ; fixed-size pool — no dynamic allocation
end

; traverse the list starting at head, summing values
func list_sum(head: addr): HL
  var
    total: word = 0
  end
  move hl, head          ; HL = current node pointer
  ld a, h
  or l                   ; set Z if HL == 0 (null)
  while NZ
    push hl                        ; save current node pointer
    move de, <Node>hl.value        ; DE = value of current node
    move hl, total
    add hl, de
    move total, hl                 ; accumulate into total
    pop hl                         ; restore current node pointer
    move hl, <Node>hl.next         ; HL = next node pointer
    ld a, h
    or l                           ; set Z if next pointer is null
  end
  move hl, total
end
```

The algorithm is fully expressible. The ergonomic gaps to note and document:

- **No null literal** — `0` serves as null but there is no named sentinel.
  Using `addr` zero is a convention, not a language guarantee.
- **`addr` is untyped** — the `next` field is `addr`, not `ptr<Node>`. The cast
  `<Node>hl.next` must be written explicitly at every dereference site.
  Self-referential record declarations would allow the type to carry that
  intent, eliminating the cast at each traversal step.
- **No standard allocation** — lists must use a fixed pool. The pool management
  pattern (free list, bump allocator) is worth documenting as its own idiom.

These are pointer-typing ergonomics and library conventions, not hard blockers.
The linked list is a productive Tier 2 example precisely because it works today
and surfaces real friction.

#### 2E: Binary Search Tree

Same analysis as the linked list. A BST node has two `addr` children (`left`,
`right`). Insert and search are fully expressible using `<Node>hl.left` and
`<Node>hl.right`. The same ergonomic gaps apply: untyped `addr` fields,
explicit casts at each traversal, null-as-zero convention, fixed pool
allocation.

Together the linked list and BST define the recurring pointer-structure idioms
that a future standard library or typed-pointer extension would address.

---

### Tier 3 — Needs Language Features

These algorithms require a language construct that does not yet exist. They
belong in the course as **specification targets**: write the algorithm as you
wish ZAX could express it, annotate the gap precisely, and file it as a
language issue.

#### 3A: Eight Queens (Wirth Ch.4)

The ZAX expression is nearly complete in Tier 1 — except that the backtracking
loop structure benefits from a named exit or `break` out of a nested `while`:

```zax
; what we must write today — exit via a found-flag variable
move found, 0
; ... set up NZ precondition ...
while NZ
  ; ... backtrack body ...
  ; to "break": set found, 1 and force the while condition false via flags
end
```

The desired expression would be a `break` or labeled exit construct. The eight
queens problem makes the case concretely: the workaround forces backtracking
state into an explicit flag variable, which pollutes both the algorithm logic
and the register assignments.

---

### Tier 4 — Not in Scope for v1

These algorithms are valuable but depend on dynamic memory or OS services that
ZAX targets cannot assume.

- **Dynamic memory allocator** (K&R §8.7): requires a heap, which requires a
  firmware memory map. Expressible in ZAX for embedded targets with a fixed
  arena, but not a standalone portable example.
- **Hash table with chaining**: requires dynamic node allocation.
- **General tree structures**: naturally expressible once self-referential
  records land (Tier 3), but dynamic allocation moves them out of scope.

---

## 6. How Examples Feed the Roadmap

Every example that requires a workaround is a language signal. The course
treats these signals as first-class outputs. Each workaround should be
documented with:

1. **What the workaround is**: the actual code that was written.
2. **What the desired expression would be**: the code that would be written if
   the language had the missing feature.
3. **The estimated language cost**: how large a parser/lowering/spec change
   would be needed.
4. **The priority signal**: is this a common pattern across many examples, or a
   one-off?

This produces a ranked list of language gaps, grounded in actual use rather
than speculation.

### Known Roadmap Connections

| Example Gap                                                                      | Status                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| RPN calculator / quicksort software stack                                        | Stack-typed local or push/pop op idiom — not yet on roadmap                                                                   |
| Linked list, BST — untyped `addr` fields, explicit casts, null-as-zero convention | Pointer-typing ergonomics — Tier 2 friction; self-referential record declarations would improve precision, not yet on roadmap |
| Eight queens labeled exit                                                        | `break` / named exit — not yet on roadmap; course surfaces this                                                               |
| Word frequency string ops                                                        | Standard `op` library — library workstream, separate from language/compiler roadmap                                           |
| Ring buffer with exact-size sizeof                                               | Exact-size layout stream (#817–820) — complete                                                                                |

Note: typed reinterpretation (`<Type>base.tail`) and grouped/ranged `select
case` were roadmap items at course inception but are now implemented. The linked
list and BST examples work today with the current surface; the documented
friction points are ergonomic, not structural.

---

## 7. A Note on ZAX Syntax in Examples

All course examples must compile against the current surface. The key surface
facts that differ from classical assembler conventions:

**`move` carries typed-storage value semantics; `ld` is raw Z80.**

```zax
section data vars at $8000
  count: word = 0
end

func bump(): void
  move hl, count    ; reads 16-bit VALUE of 'count' into HL
  inc hl
  move count, hl    ; writes HL back to 'count'

  ld hl, $FF00      ; raw Z80: immediate constant — unrelated to typed storage
  ld a, (hl)        ; raw Z80: memory dereference — unrelated to typed storage
end
```

**`@path` loads the address of a typed storage path.**

```zax
move hl, @sprite.flags      ; HL = address of sprite.flags
move de, @sprites[bc].x     ; DE = address of sprites[BC].x
```

**`<Type>base.tail` provides typed field access through a runtime address.**

```zax
move a, <Sprite>hl.flags    ; read flags field of Sprite struct pointed to by HL
```

**`select case` accepts comma-grouped values and inclusive ranges.**

```zax
select A
  case 'a'..'z', 'A'..'Z', '_'   ; identifier start character
    ; ...
  case '0'..'9'
    ; ...
end
```

**Record field and array element access use `move`.**

```zax
move a, ring.head           ; read byte field
move ring.buf[B], a         ; write element at register index B
move sprites[L].x, a        ; write field of indexed element
```

**Functions declare return registers explicitly. The compiler enforces the
preservation complement.**

```zax
func sum(a: word, b: word): HL
  move hl, a
  move de, b
  add hl, de
end
```

**`db`/`dw`/`ds` are low-level raw data directives.** They exist in ZAX for
classic assembler interoperability and low-level interface tables. They are not
for algorithm working data, which should always use typed declarations.

**Exact-size layout is implemented.** `sizeof` returns the exact packed size for
all composite types. `sizeof(Ring)` = 19. Course examples use exact sizes
directly.

---

## 8. Relationship to ZAX's Contribution

ZAX occupies a specific and defensible position in the programming language
landscape: it is a structured assembler — not a systems language (no type
inference, no allocation, no runtime), not raw assembly (not a flat instruction
stream). Very few tools have occupied this position seriously.

The algorithms course makes this position concrete. A reader who works through
the course will understand:

- where the structured assembler model is natural and powerful
- where it differs from C at the machine boundary
- what a programmer gains by accepting the discipline ZAX imposes

This is how ZAX becomes a genuine contribution to the software field, even as a
small project: not by being comprehensive, but by being _precise about what it
is_ — and by having a body of worked examples that demonstrate its scope and
limits honestly.

The K&R and Wirth canon provides the calibration baseline. These algorithms are
known. Their properties are understood. When ZAX expresses them cleanly,
readers can see exactly what the language has added over raw assembly. When ZAX
expresses them awkwardly, the gap is precisely located.

---

## 9. Course Structure

| Unit | Title              | Algorithms                                                         | ZAX Constructs Introduced                                                                      |
| ---- | ------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 1    | Foundations        | Arithmetic, power, Fibonacci, GCD                                  | `func`, `const`, `while`, return register, `:=`                                                |
| 2    | Arrays and Loops   | Sorting (insertion, bubble, selection), binary search, prime sieve | `byte[]`, indexed access, scalar path updates, `break` / `continue`                            |
| 3    | String Model       | strlen, strcpy, strcmp, atoi/itoa                                  | null-sentinel loops, `repeat`, `op fetch_advance`, `@path`                                     |
| 4    | Bit Patterns       | Population count, bit reversal, parity, field extract              | Shift idioms, `op` with `imm8` matchers                                                        |
| 5    | Records            | Ring buffer                                                        | `type`, `record`, `section data`, `sizeof`/`offsetof`, exact-size awareness                    |
| 6    | Recursion          | Towers of Hanoi, recursive sum, recursive reverse                  | Recursive `func`, IX frame discipline, `<Type>base.tail`                                       |
| 7    | Composition        | RPN calculator                                                     | All of the above: `op`, `record`, `select` ranges, `func`, software stack                      |
| 8    | Pointer Structures | Linked list, BST                                                   | `addr` fields, `<Type>base.tail` traversal, null-sentinel convention, fixed-pool allocation     |
| 9    | Gaps and Futures   | Eight queens                                                       | Control-flow pressure case; `break` / `continue` now available, future design pressure remains |

Unit 9 is intentionally incomplete. It is a design dialogue between the course
author and the language — a record of what comes next.

---

## 10. Execution Plan

The course is written in tranches. Each tranche produces working, compiled
example files, a style check against the `.z80` output, and a friction log
recorded in `docs/design/`.

### Tranche 1 — Unit 2: Foundations

**Goal**: complete all Unit 2 arithmetic examples, establish the style baseline,
confirm the compiler handles the unit cleanly.

**Style baseline**: `test/language-tour/02_fibonacci_args_locals.zax`.
All Tranche 1 files must match that style: current typed-storage syntax, explicit return
registers, no unexplained register choices.

**Files to produce** under `learning/part2/examples/unit1/`:

| File                | Algorithm                         | Key ZAX surface                             |
| ------------------- | --------------------------------- | ------------------------------------------- |
| `power.zax`         | Integer power (repeated multiply) | `func`, `while`, `word` params, return `HL` |
| `gcd_iterative.zax` | Euclid GCD (iterative)            | `while`, `if NZ`, subtraction remainder     |
| `gcd_recursive.zax` | Euclid GCD (recursive)            | recursive `func`, IX frame across calls     |
| `sqrt_newton.zax`   | Integer square root (Newton)      | `while`, `sbc hl, de` convergence test      |
| `exp_squaring.zax`  | Exponentiation by squaring        | `if`, `sra` halving, shift-and-multiply     |
| `fibonacci.zax`     | Fibonacci (iterative, extended)   | `while`, two-variable rolling locals        |
| `digits.zax`        | Decimal digit decomposition       | division-by-10, `repeat`, character offset  |

Fibonacci already has a reference in `test/language-tour/02_fibonacci_args_locals.zax`.
The Unit 2 version extends it to a full table-generating form.

**Support surface needed**: none beyond current main. Unit 2 is pure arithmetic —
no `op` library, no arrays, no records.

**Friction to log**: Unit 2 is expected to be clean. Any friction is a
fundamental signal and should be logged before proceeding to Unit 3.

---

### Tranche 2 — Unit 2: Arrays and Loops

**Goal**: produce the core sorting and searching examples. Introduce indexed
array access and `select` ranges in context.

**Files to produce** under `learning/part2/examples/unit2/`:

| File                 | Algorithm                         |
| -------------------- | --------------------------------- |
| `insertion_sort.zax` | Insertion sort (byte array)       |
| `bubble_sort.zax`    | Bubble sort with `swap op`        |
| `selection_sort.zax` | Selection sort                    |
| `binary_search.zax`  | Binary search (sorted byte array) |
| `linear_search.zax`  | Linear search with sentinel       |
| `prime_sieve.zax`    | Eratosthenes sieve (`byte[256]`)  |

**Support surface needed**: a `swap op` for byte exchange will recur across
sorting examples. Author it inline in `bubble_sort.zax` first; if it recurs
in two or more files, factor it into a shared `ops.zax` for the unit.

**Friction to log**: quicksort is intentionally deferred beyond the current tranche plan (Tier 2 — not yet scheduled).
If any Tranche 2 algorithm needs a software stack or multi-level loop exit,
log it and defer — do not paper over the gap.

---

### Tranche 3 — Units 2 and 4: Strings and Records

Unit 3 (strings) and Unit 5 (ring buffer) are coupled: both introduce the
pointer-advance idiom and the first `op` library candidates. Build them
together.

Unit 3 surfaces `fetch_advance` as a reusable `op`. Unit 5 confirms
`sizeof(Ring) = 19` and exercises the non-power-of-two indexing path.
Any friction in Unit 5 with the exact-size lowering is a direct regression
signal for #817–820.

---

### Tranche 4 — Units 3 and 5: Bits and Recursion

Unit 4 (bit manipulation) is self-contained and validates `op` with `imm8`
matchers. Unit 6 (Towers of Hanoi, recursive array operations) validates the IX
frame under recursion. Both can proceed independently once Tranche 2 is stable.

---

### Tranche 5 — Units 7, 8, 9: Composition, Pointers, Gaps

Unit 7 (RPN calculator) is the composition showcase — it uses every construct
introduced to that point. Unit 8 (linked list, BST) is the friction showcase —
write it clean and document the ergonomic gaps precisely. Unit 9 (Eight Queens)
is the language-gap target — write it as close as possible, document the loop
control-flow pressure, file the issue.

---

### Friction Log Protocol

Every tranche must record new friction entries in `docs/design/`. The format for each entry:

```
### [Unit X] [Algorithm name]

**Workaround**: [what was actually written]
**Desired expression**: [what you would write if the feature existed]
**Gap type**: language / library / style
**Recurrence**: [how many other examples share this gap]
**Priority signal**: [one-off / common pattern / blocks multiple units]
```

---

_This is the active execution document for the ZAX algorithms course. It
defines the course structure, style rules, algorithm catalogue, and work
sequence._
