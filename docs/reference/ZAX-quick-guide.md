# ZAX Quick Guide

A practical quick-start guide to the current ZAX language surface.

This guide is instructional, not normative. Canonical language behavior is defined in `docs/spec/zax-spec.md`.

---

## Chapter 1 — Overview and Toolchain

### 1.1 What ZAX Is

ZAX is a structured assembler for Z80-family targets. It compiles directly to machine code — there is no external linker, no object format, and no runtime system. The output is a flat binary image, optionally accompanied by Intel HEX, a symbol listing, and a debug map.

ZAX combines:

- raw Z80 instruction authoring (mnemonics, registers, and flags written directly)
- structured control flow (`if`, `while`, `repeat`, `select`)
- typed storage (`byte`, `word`, `addr`, arrays, records, unions)
- compile-time expressions (`const`, `sizeof`, `offsetof`, `enum`)
- inline macro-instructions (`op`) with AST-level operand matching and overload resolution

The compiler adds structure and names to assembly decisions — it does not make those decisions for you. You choose registers, manage flags, and decide what lives in ROM vs RAM. Where compiler-generated code appears (function prologues, epilogues, call wrappers, index-scaling sequences), it is deterministic and inspectable via the assembler-valid `.z80` output or the `.lst` listing.

### 1.2 Why Use It

ZAX targets authors who want assembler-level control with stronger structure, consistency, and refactorability.

Typical use cases:

- game engines and demoscene tools
- firmware, monitor, and ROM code
- hardware drivers
- education and systems programming

ZAX is not a high-level language. It is still assembly.

### 1.3 Minimal Program

```zax
export func main(): void
  ld a, 'A'
end
```

When compiled and executed:

- register `A` holds `$41`
- `ret` returns to caller

This function has no parameters and no `var` block, so no frame is generated. The `ret` is emitted directly — no synthetic epilogue.

You can separate multiple statements on one physical line with `\`:

```zax
ld a, 1 \ or a \ jr nz, loop
```

### 1.4 A Slightly Larger Example

```zax
const MsgLen = 5

section data app_data at $8000
  msg: byte[5] = "HELLO"
end

extern func bios_putc(ch: byte): void at $F003

export func main(): void
  var
    p: addr
  end
  ld hl, msg        ; address of msg
  p := hl        ; store address into local p
  ld b, MsgLen
  repeat
    hl := p      ; load current pointer
    ld a, (hl)      ; read byte
    inc hl
    p := hl      ; save advanced pointer
    push bc
    bios_putc A
    pop bc
    dec b
  until Z
end
```

Key ideas this demonstrates:

- `data` declares initialized storage in the `data` section; `var` reserves stack-frame locals in the function body.
- `p` is a scalar local of type `addr` — `p := hl` and `hl := p` use value semantics (compiler emits the IX-relative load/store). Here `HL` is still needed for the raw `ld a, (hl)` idiom; when you only copy between typed scalar paths with no raw memory operand in between, prefer path-to-path `:=` (for example `ptr := data`) instead of shuttling through a register pair.
- `bios_putc` is an external function bound to a fixed ROM address.
- `push bc` / `pop bc` around the call is necessary because `extern func` carries no register preservation guarantee.
- Structured control flow (`repeat ... until`) lowers to compiler-generated labels and branches.

### 1.5 CLI Basics

```sh
zax [options] <entry.zax>
```

The entry module must be the last argument.

Common outputs:

| File          | Contents                                          |
| ------------- | ------------------------------------------------- |
| `.bin`        | flat binary image                                 |
| `.hex`        | Intel HEX output                                  |
| `.lst`        | deterministic byte dump with symbol table         |
| `.d8.json` | D8 Debug Map for Debug80 and compatible tools     |
| `.z80`        | ASM80-compatible lowered source (assembler-valid) |

In `.d8.json` (D8M v1), source-attributed per-file `segments` include **`line`**: the canonical **1-based line number in the `.zax` source** for debuggers (e.g. Debug80); **`lstLine`** remains listing-oriented correlation on the same segment.

By default, ZAX derives all artifact paths from the primary output path. Use `-o <file>` to set the primary output; `-t hex` or `-t bin` to choose the primary type (default: `hex`). Suppress individual outputs with `--nolist`, `--nobin`, `--nohex`, `--nod8m`. Emit ASM80 output explicitly with `--asm80`.

Useful diagnostic options:

| Option                  | Effect                                                              |
| ----------------------- | ------------------------------------------------------------------- |
| `--case-style <m>`      | Case-style lint: `off`, `upper`, `lower`, or `consistent`           |
| `--op-stack-policy <m>` | Op stack-discipline diagnostics: `off`, `warn`, or `error`          |
| `--raw-typed-call-warn` | Warn when raw `call` / `call cc,nn` targets a typed callable symbol |
| `-I <dir>`              | Add import search path (repeatable)                                 |

The full CLI contract is in `docs/spec/zax-spec.md` Appendix D.

---

## Chapter 2 — Storage Model

### 2.1 Scalar Types

| Type   | Size (bytes) | Notes                                                          |
| ------ | ------------ | -------------------------------------------------------------- |
| `byte` | 1            | 8-bit unsigned                                                 |
| `word` | 2            | 16-bit unsigned                                                |
| `addr` | 2            | 16-bit address; used for raw addresses, pointers, and other address-sized scalars (no `ptr<T>` in the current language) |
| `void` | —            | Return type only; not valid as a storage, field, or param type |

There are no signed storage types in the current language.

`void` may only appear as a function return type. Using `void` as a variable type, parameter type, record field type, or array element type is a compile error.

### 2.2 Named `data` Sections — Module Storage

Module storage is declared inside named `data` sections. Three declaration forms are supported:

```zax
section data vars at $8000
  count:     word              ; storage declaration — allocates, zero-initialized
  base:      addr = $C000      ; typed value initializer — allocates and initializes
  alias_ptr  = count           ; alias initializer — no storage; new name for direct module-scope storage
end
```

The **typed alias form** `name: Type = rhs` is always a compile error in both named `data` sections and function-local `var` blocks. Use `name: Type = valueExpr` for value initialization, or `name = rhs` for aliasing. In function-local `var`, that alias form is intentionally narrow: the right-hand side must be a direct module-scope storage name.

Composite storage can be zero-initialized using scalar zero:

```zax
type Pair
  lo: byte
  hi: byte
end

section data vars at $8000
  p: Pair = 0    ; zero-initializes all fields
end
```

Aggregate record initializer syntax for named `data` sections (positional or named-field) is deferred in the current language. For initialized composite data, use `data` declarations.

### 2.3 `data` — Initialized Storage

`data` declarations inside named `data` sections define initialized storage:

```zax
section data assets at $8100
  banner:  byte[]    = "HELLO"           ; inferred length: 5 bytes
  table:   word[4]   = { 1, 2, 3, 4 }   ; fixed-length word array
  palette: byte[3]   = { $00, $7F, $FF }
end
```

For fixed-length arrays (`T[n]`), the initializer element count must match `n` exactly. For inferred-length arrays (`T[]`), the length is determined from the initializer.

Record initializers support two equivalent forms:

```zax
; positional aggregate — values in field declaration order
origin: Point = { 0, 0 }

; named-field aggregate — field names explicit, order irrelevant
origin: Point = { x: 0, y: 0 }
```

Named-field aggregate rules: every field must appear exactly once. Unknown field names, duplicate fields, and missing required fields are compile errors. Mixing positional and named entries in one aggregate is a compile error.

String literals (`"TEXT"`) emit ASCII bytes with no null terminator. They are only valid in `data` initializers.

A `data` block continues until the next module-scope declaration, directive, or end of file.

### 2.4 Composite Storage Rule

Composite types use **exact semantic size**:

```
sizeof(T[n])   = n × sizeof(T)
sizeof(record) = sum of field sizes
sizeof(union)  = max field size
```

Example:

```zax
type Sprite
  x:     byte    ; 1 byte
  y:     byte    ; 1 byte
  tile:  byte    ; 1 byte
  flags: word    ; 2 bytes
end
; field sum = 5, sizeof(Sprite) = 5
```

There is no implicit power-of-two padding in semantic layout. Power-of-two sizes still matter as a code-generation fast path, but not as a type-layout rule.

### 2.5 Why Power-of-Two Still Matters

The Z80 has no hardware multiply instruction. Indexing into an array of composites requires computing `base + i × sizeof(element)`.

- When `sizeof(element)` is a power of two, lowering can use a pure shift chain (`ADD HL,HL`).
- When `sizeof(element)` is not a power of two, lowering emits an exact shift/add sequence derived from the constant element size.

So power-of-two sizes remain a performance consideration, but they are no longer part of semantic layout.

### 2.6 `sizeof` and `offsetof`

Both are compile-time built-ins:

```zax
const SpriteSize   = sizeof(Sprite)          ; = 5
const TileOffset   = offsetof(Sprite, tile)  ; = 2  (1 + 1)
const FlagsOffset  = offsetof(Sprite, flags) ; = 3  (1 + 1 + 1)
```

`offsetof` accepts nested field paths for records containing other records:

```zax
type Rect
  topLeft:     Point   ; Point has x: word, y: word — sizeof(Point) = 4
  bottomRight: Point
end

const BrXOffset = offsetof(Rect, bottomRight.x)   ; = 4
```

Use `sizeof` and `offsetof` everywhere instead of hand-computed constants. They update automatically when type definitions change.

### 2.7 Raw Data Directives

For lookup tables, jump tables, and binary blobs, three raw data directives are supported directly inside `data` sections:

| Directive   | Description                                   |
| ----------- | --------------------------------------------- |
| `db <list>` | Emit one or more raw bytes                    |
| `dw <list>` | Emit one or more 16-bit words (little-endian) |
| `ds <n>`    | Emit `n` zero bytes (zero-fill / padding)     |

`dw` accepts label addresses as operands, which makes it the natural way to build dispatch tables. Labels placed within raw data blocks are valid as jump targets elsewhere in the program and as operands in `dw` initializers.

```zax
section data assets at $0100
  sine:
  db $00, $19, $32, $4A, $61, $74, $84, $90   ; raw bytes

  fibonacci:
  db 1, 2, 3, 5, 8, 13, 21, 34               ; raw bytes (decimal)

  dispatch:
  dw handler_a, handler_b, handler_c          ; 16-bit words or label addresses

  padding:
  ds 8                                        ; 8 zero bytes
end
```

Raw declarations coexist with typed storage declarations in the same `data` section. Mixing typed variables and raw directives in one section is normal practice — they lay out in source order.

---

## Chapter 3 — Addressing and Indexing

### 3.1 Place Expressions

In ZAX, `rec.field` and `arr[i]` are **place expressions** — typed storage paths that the compiler can lower to a concrete location when needed.

In ordinary **value/store contexts** (such as `a := rec.field` or `rec.field := a`), scalar places use value semantics and the compiler inserts the required load or store automatically. In **storage-location contexts** (such as an `ea`-typed `op` parameter), the same place expression is passed as a storage location for the op body to use.

Examples:

```zax
a := sprite.flags      ; value semantics: load the byte stored in sprite.flags
sprite.flags := a      ; value semantics: store A into sprite.flags
```

`@path` is the source-level address-of form for typed storage paths. In v1 it is accepted on the source side of `rr := @path`, where it produces the address of the typed storage path instead of its scalar value.

```zax
hl := @player.flags     ; HL = address of the flags field
de := @sprites[bc].x    ; DE = address of sprites[BC].x
```

### 3.2 Valid Index Forms

Inside `arr[...]`, only the following forms are valid:

| Index form                  | Meaning                                                          |
| --------------------------- | ---------------------------------------------------------------- |
| `5` or `CONST`              | compile-time constant or `const`/enum value                      |
| `A` `B` `C` `D` `E` `H` `L` | 8-bit register (used directly as index)                          |
| `HL` `DE` `BC`              | 16-bit register (direct index)                                   |
| `(HL)`                      | byte loaded from memory at `HL` (indirect index)                 |
| `(IX+d)` / `(IX-d)`         | byte loaded from IX-relative address; `d` must be in `-128..127` |
| `(IY+d)` / `(IY-d)`         | byte loaded from IY-relative address; `d` must be in `-128..127` |

Anything else inside `[...]` is a compile error. In particular: expressions involving arithmetic (`i + j`, `i * 2`, `i << 1`), arbitrary function calls, or other non-register forms are not valid index expressions. If you need a computed index, compute it into a register first.

Register-pair overlap note: `B`/`C` are the byte halves of `BC`, `D`/`E` are
the byte halves of `DE`, and `H`/`L` are the byte halves of `HL`. They are not
independent registers. If you write to `L`, you are changing `HL`; if you write
to `E`, you are changing `DE`; and so on.

### 3.3 The Critical Distinction: `arr[HL]` vs `arr[(HL)]`

This is one of the most common indexing mistakes:

```zax
arr[HL]     ; the index IS the 16-bit value in HL (direct register index)
arr[(HL)]   ; the index is the byte READ FROM memory at address HL (indirect)
```

If your code intends to use the byte at the address in `HL` as an index, write `arr[(HL)]`. If `HL` itself is the index, write `arr[HL]`.

### 3.4 Value Semantics in `:=`

Scalar typed storage — module symbols from named `data` sections, function-local `var` slots, and scalar record fields — uses **value semantics** in assignment operands in the current language. You do not need parentheses to read or write scalar module symbols:

```zax
section data vars at $8000
  count: word
  mode:  byte
end

func example(): void
  step count      ; in-place increment of the word in 'count'
  step mode       ; in-place increment of the byte in 'mode'
end
```

Use `step place, -1` for the symmetric decrement. When you need the loaded value in a register for further arithmetic or flag tests, `a := place` / `inc a` / `place := a` (or the word analogue through `HL`) is still the right shape.

Explicit parentheses on scalar symbols are still accepted but are redundant. In operand position, parentheses always mean memory dereference and may enclose a full `imm` expression, e.g. `ld a, (3 + 2)`.

### 3.5 Field and Element Access

`rec.field` and `arr[idx]` are place expressions. In scalar assignment contexts, the compiler lowers them to the required address calculation and load/store sequence:

```zax
section data vars at $8000
  player: Sprite
end

func update(): void
  step player.x       ; in-place increment of the byte field

  hl := player.flags  ; read player.flags (word) into HL
  set 0, l            ; bit twiddle still uses a register
  player.flags := hl  ; write back
end
```

For non-scalar fields (arrays, nested records), the place expression remains an address and no automatic dereference is inserted.

Typed reinterpretation extends that same place-expression model to runtime
address values:

```zax
a := <Sprite>hl.flags
hl := <Header>ptr.checksum
a := <ListNode>current_ptr.value
```

The cast does not permanently type `HL`, `ptr`, or `current_ptr`. It only
supplies a typed storage base for the following field/index path. When the base
is already held in an `addr` or `word` scalar, prefer the direct form above
instead of first copying it through `HL`.

### 3.6 Combining Field Access and Indexing

Indexed element access and field access compose:

```zax
section data sprites_data at $8200
  sprites: Sprite[16]
end

func step_sprite(idx: byte): void
  l := idx            ; put index in L (8-bit register)
  step sprites[L].x   ; in-place increment of the x field
end
```

The compiler emits the shift chain for the outer index (`sizeof(Sprite) = 8` → three `ADD HL, HL`), then adds the field offset for `.x` (which is 0, so no additional add is needed here).

### 3.7 Address Arithmetic

Simple arithmetic on `ea` expressions is allowed:

```zax
ld hl, buffer + 16       ; address 16 bytes into buffer
ld hl, table - 2         ; address 2 bytes before table start
```

`ea + imm` and `ea - imm` bind more loosely than address-path segments.

`imm + ea` is not permitted — always write `ea + imm`.

---

## Chapter 4 — Constants and Compile-Time Expressions

### 4.1 `const` Declarations

```zax
const ScreenBase  = $C000
const TileWidth   = 8
const TileBytes   = TileWidth * TileWidth
const MaxSprites  = 16
const FlagMask    = (1 << 4) | (1 << 2)
```

Constants are compile-time `imm` expressions. Their values must be fully resolvable at compile time. Forward references between `const` declarations are allowed.

`export const` is accepted and has no effect in the current language (see Chapter 10.4).

### 4.2 Literal Forms

| Form         | Example      |
| ------------ | ------------ |
| Decimal      | `255`        |
| Hexadecimal  | `$FF`        |
| Binary       | `%11111111`  |
| Binary (alt) | `0b11111111` |
| Character    | `'A'`        |

String literals (`"TEXT"`) are only valid in `data` initializers. Character literals are `imm8` values (single ASCII byte).

### 4.3 Operator Precedence

`imm` expressions support the following operators, highest to lowest precedence:

| Precedence  | Operators         | Associativity |
| ----------- | ----------------- | ------------- |
| 1 (highest) | unary `+` `-` `~` | right         |
| 2           | `*` `/` `%`       | left          |
| 3           | `+` `-`           | left          |
| 4           | `<<` `>>`         | left          |
| 5           | `&`               | left          |
| 6           | `^`               | left          |
| 7 (lowest)  | `\|`              | left          |

Parentheses are available for explicit grouping.

Division or modulo by zero is a compile error. Negative shift counts are a compile error. When an `imm` value is encoded as `imm8`, the low 8 bits are used (signed or unsigned, `-128..255` accepted). When encoded as `imm16`, the low 16 bits are used (`-32768..65535` accepted).

### 4.4 `sizeof` and `offsetof` in Expressions

Both built-ins are valid in any `imm` expression context:

```zax
const SpriteBytes  = sizeof(Sprite)
const FlagsOff     = offsetof(Sprite, flags)
const BufferBytes  = sizeof(Sprite) * MaxSprites
const BrXOff       = offsetof(Rect, bottomRight.x)   ; nested path
```

`sizeof` returns exact semantic size. `offsetof` returns the byte offset of the named field using exact-size field progression.

### 4.5 Enums as Compile-Time Constants

Qualified enum members are `imm` values usable in any compile-time expression context:

```zax
enum Priority Low, Normal, High, Critical

const DefaultPriority = Priority.Normal    ; = 1
const MaxPriority     = Priority.Critical  ; = 3
```

Unqualified enum member references (`Normal` instead of `Priority.Normal`) are compile errors in the current language. See Chapter 8 for full enum coverage.

### 4.6 Type Aliases

The `type` keyword creates named aliases for existing types:

```zax
type TileId   byte        ; semantic alias for byte
type MapAddr  addr        ; semantic alias for addr
type Row      byte[32]    ; array type alias
```

Aliases can be used as field types in records, parameter types in functions, and storage types in named `data` sections. An alias has the same size as its underlying type.

Inferred-length array aliases (`type T byte[]`) are **not** permitted. `T[]` is only valid in `data` declarations (with an initializer) and in function parameter position. It is not permitted in type aliases, record fields, local `var` declarations, or return types.

### 4.7 Identifiers and Case Rules

User-defined identifiers follow `[A-Za-z_][A-Za-z0-9_]*`. They are **case-sensitive** — `Sprite` and `sprite` are different names — but two names that differ only by case are a collision error (you cannot define both in the same program). Z80 mnemonics and register names are **case-insensitive** and are reserved. The compiler prefix `__zax_` is reserved for internal use.

---

## Chapter 5 — Structured Control Flow

### 5.1 How It Works

Structured control flow is only available inside function and `op` instruction streams. The four constructs — `if`, `while`, `repeat`, `select` — lower to compiler-generated hidden labels and conditional or unconditional jumps. You never write those labels; the compiler manages them. The only labels you write are explicit local labels (see 5.8).

Two important rules govern everything:

**`if` / `while` / `repeat` do not set flags.** They test the current CPU flag state at the point where the condition code keyword appears. It is always the programmer's job to establish the correct flags with a normal Z80 instruction immediately before the condition is tested.

**`select` does not use flags at all.** It dispatches by comparing a selector value against compile-time `case` constants using equality. The compiler-generated compare sequence may modify `A` and flags as a side effect of dispatch.

### 5.2 Condition Codes

| Code | Flag tested                               |
| ---- | ----------------------------------------- |
| `Z`  | zero flag set                             |
| `NZ` | zero flag not set                         |
| `C`  | carry flag set                            |
| `NC` | carry flag not set                        |
| `PE` | parity/overflow flag set (parity even)    |
| `PO` | parity/overflow flag not set (parity odd) |
| `M`  | sign flag set (minus)                     |
| `P`  | sign flag not set (plus)                  |

These are the same condition codes used in Z80 branch instructions (`jp cc`, `jr cc`, `ret cc`). ZAX structured constructs simply use them as keywords.

### 5.3 `if` / `else`

`if <cc>` tests the current flags at the `if` keyword.

```zax
; Test whether A equals zero
or a              ; OR A with itself: sets Z if A is 0, clears Z otherwise
if Z
  ld a, 1         ; A was zero
else
  ld a, 2         ; A was non-zero
end
```

The `else` branch is optional. `if ... end` with no `else` is valid. Nesting is allowed.

```zax
cp $10
if C              ; A < $10
  cp $08
  if C            ; A < $08
    ld b, 0
  else            ; $08 <= A < $10
    ld b, 1
  end
else              ; A >= $10
  ld b, 2
end
```

Rules:

- `else` must immediately follow the `if` body — only whitespace and comments are permitted between the last instruction of the `if` body and the `else` keyword.
- There is at most one `else` per `if`.

### 5.4 `while`

`while <cc>` tests the current flags at the `while` keyword on entry and again at the back-edge after each iteration. If the condition is false on entry, the body never executes.

```zax
; Count down from 10 in A
ld a, 10
or a                ; establish NZ (a = 10, non-zero)
while NZ
  dec a
  or a              ; re-establish flags for the next test
end
; A = 0 on exit
```

The body is responsible for re-establishing flags before control returns to the top of the loop. The back-edge jumps to the condition test, which re-tests `<cc>` using the current flags at that point.

**The most common mistake with `while`** is entering it without having set the flags first:

```zax
; WRONG — LD does not affect flags on Z80
ld b, 10
while NZ           ; tests stale flags from earlier code — undefined behaviour
  dec b
end
```

Fix this by either establishing flags explicitly before the `while`, or using `repeat ... until` when the body must run at least once:

```zax
; Correct: pre-establish flags
ld b, 10
ld a, b
or a               ; set NZ because B is 10
while NZ
  dec b
  ld a, b
  or a
end
```

### 5.5 `repeat ... until`

The loop body always executes at least once. `until <cc>` tests the current flags at the `until` keyword — whatever state the loop body left behind.

```zax
; Walk a null-terminated string starting at HL
repeat
  ld a, (hl)        ; load byte
  inc hl
  or a              ; sets Z if byte is zero
until Z
; HL now points one past the null terminator
```

Use `repeat ... until` when:

- the body must run at least once before any test makes sense
- the flags are naturally established inside the body (common for counter loops)

```zax
; Decrement B from some value down to zero
b := count
repeat
  ; ... do work ...
  dec b             ; sets Z when B reaches 0
until Z
```

### 5.6 Nesting

All three flag-based constructs may be freely nested. The compiler tracks which `end` and `until` closes which construct:

```zax
or a
if NZ
  ld b, 4
  repeat
    ; inner loop
    ld c, 8
    or c
    while NZ
      dec c
      or c
    end
    dec b
  until Z
end
```

Stack depth must match across all paths at every structured-flow join. The compiler enforces this — a `push` inside an `if` body without a matching `pop` before `end` is a compile error at the join point.

### 5.7 `select` / `case`

`select` dispatches on a selector value compared by equality against compile-time `case` constants. There is **no fallthrough** — after a `case` body completes, control always transfers to after the enclosing `end`.

```zax
a := mode           ; load selector value
select A
  case Mode.Idle
    ld a, 0
  case Mode.Run
    ld a, 1
  else                 ; taken if no case matches
    ld a, $FF
end
```

#### Selector Forms

| Selector | Dispatched on                                         |
| -------- | ----------------------------------------------------- |
| `reg8`   | 8-bit register value (zero-extended to 16 bits)       |
| `reg16`  | 16-bit register value                                 |
| `imm`    | compile-time constant (may be folded at compile time) |
| `ea`     | storage reference value carried by the expression     |
| `(ea)`   | 16-bit word loaded from memory at `ea`                |

If you want to dispatch on a byte value stored in memory, load it into a register first. `select (ea)` reads a 16-bit word — if the high byte of that word is non-zero, no 8-bit `case` value will match.

#### Register Effects

The compiler-generated dispatch may modify `A` and flags. All other registers are preserved.

- If the selector is `A`, `A` may be clobbered by dispatch. Do not rely on `A` still holding the selector value inside a `case` body.
- If the selector is any other register, that register's value is preserved across dispatch.

#### Multiple Values and Ranges per `case`

A single `case` line may list comma-separated values or inclusive ranges; any listed item may match:

```zax
select A
  case 'A'..'Z', '_'             ; range + singleton group
    ld a, 0
  case Mode.Idle, Mode.Stopped   ; either value routes here
    ld a, 0
  case Mode.Run
    ld a, 1
end
```

Consecutive `case` lines before any instruction share the body that follows (stacked-case syntax):

```zax
select A
  case Mode.Idle
  case Mode.Stopped              ; stacked: same body as Idle
    ld a, 0
  case Mode.Run
    ld a, 1
end
```

#### `select` Rules

- `else` is optional. If no `case` matches and there is no `else`, control falls through to after `end`.
- `else` must be the final arm. A `case` after `else` is a compile error.
- Overlapping reachable `case` items in the same `select` are a compile error.
- `select` must contain at least one arm; a `select` with no arms is a compile error.
- Nested `select` is allowed.
- A `case` value outside `0..255` for a `reg8` selector can never match; the compiler warns and omits that item from dispatch.
- A `case` range that partly exceeds `0..255` for a `reg8` selector warns and dispatches only on the reachable clipped portion.

#### Lowering

The compiler may implement `select` as a compare-and-branch chain or as a jump table. The strategy is a quality-of-implementation decision — no threshold is defined. Compile-time `imm` selectors may be folded entirely at compile time. In all cases the observable behavior is identical: the selector is evaluated once, each `case` item is tested against it, and the matching body executes.

### 5.8 Local Labels

ZAX discourages labels in favor of structured control flow, but local labels are available for cases where structured forms don't fit — particularly `djnz` loops, computed jumps, and low-level scanning routines.

```zax
func find_byte(buf: addr, len: word, target: byte): addr
  ld hl, buf
  ld b, len
  ld a, target
scan:
  cp (hl)
  jr Z, found
  inc hl
  djnz scan
  ld hl, 0          ; not found: return null address
  ret
found:
  ; HL points to the matching byte
end
```

Rules:

- `<ident>:` at the start of an instruction line defines a local label at the current code position. It may be followed by an instruction on the same line (`scan: djnz scan`) or may stand alone on its own line.
- Local labels are scoped to the enclosing `func` or `op` body and are not exported or visible outside it.
- Labels in `op` bodies are **hygienically rewritten** per expansion site — each expansion of the same op gets unique label instances automatically, so two expansions at different call sites never collide.
- Forward references to labels within the same body are allowed.
- Label names must not collide with reserved names (mnemonics, register names, control-flow keywords), ignoring case.
- For relative branches (`jr`, `djnz`), if the displacement falls outside `-128..127`, it is a compile error.
- Resolution order inside a body: local labels take precedence over locals/args, which take precedence over global symbols.

### 5.9 `break` and `continue`

`break` exits the immediately enclosing loop; `continue` restarts from the loop's condition check. Both are valid only inside `while` / `end` and `repeat` / `until` bodies.

| Construct  | Transfers control to                                                   |
| ---------- | ---------------------------------------------------------------------- |
| `break`    | immediately after the loop's closing `end` or `until`                  |
| `continue` | the condition test (`while`: top of loop; `repeat`: `until` at bottom) |

Both emit an unconditional jump to the compiler-generated loop label. Neither sets or clears flags.

```zax
; stop early when A hits zero, skip the store when the value is $FF
ld b, 16
or b              ; establish NZ for entry
while NZ
  ld a, (hl)
  or a
  if Z
    break         ; A == 0: exit loop immediately
  end
  cp $FF
  if Z
    inc hl
    dec b
    ld a, b
    or a
    continue      ; skip the store, re-test condition
  end
  ld (de), a
  inc hl
  inc de
  dec b
  ld a, b
  or a
end
```

In nested loops `break` and `continue` affect the **immediately enclosing** loop only. There is no labeled-loop form in v0.1.

For `while`, if you use `continue`, ensure the flags are correct for the condition re-test at the top of the loop before the `continue` executes.

---

### 5.10 Idiom: always-enter loop with internal exit (`while NZ`)

**Named idiom: "always-enter loop with internal exit"**

Use this pattern when the exit condition is managed inside the loop body (e.g., via `ret` or `break`) rather than at the top.

```zax
ld a, 1
or a           ; set NZ to ensure entry
while NZ
  ; ... loop body ...
  ; exit via: ret, or set Z and continue, or break
end
```

The `ld a, 1` / `or a` sequence loads a non-zero value into `A` and ORs it with itself, which sets the NZ flag. This guarantees the loop is entered on the first iteration regardless of what flags were set by earlier code. Once inside, the loop body is responsible for all exit decisions — typically via `ret`, `break`, or a `continue` that sets Z before looping back.

This idiom is common for scanner loops, state-machine drivers, and any loop whose termination is naturally expressed inside the body.

---

## Chapter 6 — Functions and Call Boundaries

### 6.1 Function Declaration

```zax
export func add(a: word, b: word): word
  var
    temp: word = 0    ; local scalar, initialized to 0
  end
  hl := a          ; load argument a (value semantics)
  de := b          ; load argument b (value semantics)
  add hl, de          ; HL = a + b
  ; result in HL — the word return channel
end
```

Rules:

- Functions are module-scope only. Nested functions are not permitted.
- Function bodies emit to `code`.
- At most one optional `var` block; if present it must precede the instruction stream and is terminated by its own `end`.
- The instruction stream may be empty.
- If control falls off the end of the instruction stream, the compiler treats it as an implicit `ret` (routed through the synthetic epilogue if one is needed).

### 6.2 Function-Local `var` Block

Three declaration forms are valid inside a `var` block:

| Form                       | Meaning                                                                  |
| -------------------------- | ------------------------------------------------------------------------ |
| `name: Type`               | allocates a scalar frame slot, zero-initialized (or a record/union pointer slot — see below) |
| `name: Type = valueExpr`   | allocates a scalar frame slot, initialized to `valueExpr` (not allowed for record/union `Type`) |
| `name = GlobalStorageName` | alias — no frame slot; binds a local name to direct module-scope storage |

The **typed alias form** `name: Type = rhs` is always a compile error.

Scalar types (`byte`, `word`, `addr`, or aliases resolving to those) use frame slots as usual. A **record or union** type in a local `var` allocates one 16-bit slot that holds an address; omit the initializer and assign a pointer before use. Field access on that name (`.field`) dereferences through the stored address. Other non-scalar locals (arrays, records without this slot rule) are allowed only as alias declarations to direct module-scope storage — they name an existing address but allocate no storage:

```zax
section data vars at $8000
  table: byte[16]
end

func process(): void
  var
    count:   word = 0        ; valid: scalar slot, initialized
    offset:  byte            ; valid: scalar slot, zero-initialized
    tbl    = table           ; valid: alias to direct module-scope storage
    bad:     byte[4] = table ; COMPILE ERROR: typed alias form
  end
  ; tbl and table are the same address
end
```

Scalar initializers are lowered in declaration order at function entry. For zero or constant word-sized init, the preferred lowering is `LD HL, imm16` / `PUSH HL`, which allocates and initializes the slot in one sequence.

Rejected local alias forms:

```zax
func bad(buf: byte[16])
  var
    a = buf        ; COMPILE ERROR: parameter target not allowed
  end
end

func also_bad(): void
  var
    count: word = 0
    c = count      ; COMPILE ERROR: local target not allowed
  end
end
```

### 6.3 The Typed Call Boundary

When the compiler generates a call to a typed internal `func`, it enforces a preservation contract at that boundary:

| Register / flags              | Behavior at typed internal call boundary                       |
| ----------------------------- | -------------------------------------------------------------- |
| `HL`                          | **boundary-volatile** for all typed calls including `void`     |
| `L`                           | carries 8-bit return value for `byte`-returning calls          |
| `HL`                          | carries 16-bit return value for `word`/`addr` returns          |
| all other registers and flags | **callee-preserved** — restored by compiler-generated epilogue |

This guarantee applies **only** to typed internal `func` calls. It does not apply to:

- **Raw `call` / `call cc, nn` mnemonics** — these are raw assembly. The compiler enforces no preservation contract.
- **`extern func` calls** — the routine at that address is outside the compiler's control. Assume all registers and flags may be clobbered unless you know otherwise from the external ABI documentation.

The `--raw-typed-call-warn` option causes the compiler to warn when a raw `call` instruction targets a symbol that is a typed ZAX function, since that bypasses the typed boundary contract.

### 6.4 Calling Functions

Inside a function or `op` instruction stream, a line beginning with a function name calls that function:

```zax
; zero-argument call
clear_screen

; calls with arguments
draw_tile tile_id, x_pos, y_pos
bios_putc 'A'
```

Argument forms accepted at call sites:

| Form    | What is pushed onto the stack                                                       |
| ------- | ----------------------------------------------------------------------------------- |
| `reg16` | 16-bit register value                                                               |
| `reg8`  | 8-bit register, zero-extended to 16 bits                                            |
| `imm`   | compile-time immediate, as 16-bit value                                             |
| `ea`    | 16-bit storage reference for the matched location                                   |
| `(ea)`  | value loaded from memory (word or byte per parameter type; `byte` is zero-extended) |

Arguments are pushed right-to-left (last argument first). The compiler emits the required pushes, the `call`, and cleans up the arguments after return.

#### How the First Token of an Instruction Line Is Resolved

The compiler resolves the first token of each instruction line in this order:

1. Structured-control keyword (`if`, `else`, `while`, `repeat`, `until`, `select`, `case`, `end`)
2. Z80 mnemonic
3. `op` name
4. `func` or `extern func` name
5. Compile error — unknown identifier

Z80 mnemonics and register names are reserved, so user-defined names cannot shadow them.

#### Operand Identifier Resolution

Inside operands, identifiers resolve in this order:

1. Local labels (scoped to the enclosing `func` or `op` body)
2. Locals and arguments (frame-bound names)
3. Module-scope symbols (named-section data symbols, constants, enum members, function names)

An identifier that matches none of these is a compile error.

### 6.5 Non-Scalar Argument Contracts

Non-scalar parameters (`T[N]` or `T[]`) are passed as a 16-bit storage reference in one stack slot. The type annotation controls what the callee is permitted to assume about the referenced data:

| Parameter type | Contract                                               |
| -------------- | ------------------------------------------------------ |
| `T[N]`         | exact-length: exactly `N` elements of type `T`         |
| `T[]`          | element-shape: element type is `T`, length unspecified |

Compatibility at call sites:

- `T[N]` → `T[]` is allowed (narrowing to flexible view)
- `T[]` → `T[N]` is rejected unless the compiler can prove the length is exactly `N`
- Element-type mismatch is always rejected
- Forwarding a non-scalar parameter is legal and does not require a local alias

```zax
func stage2(t: byte[16])
  a := t[hl]
end

func stage1(t: byte[16])
  stage2 t
end
```

```zax
section data vars at $8000
  buf: byte[10]
end

func process_exact(data: byte[10]): void  end
func process_any  (data: byte[]):   void  end

export func main(): void
  process_exact buf    ; valid: exact match
  process_any   buf    ; valid: [10] satisfies []
end
```

### 6.6 The IX-Anchored Frame Model

Functions that have arguments or local scalar variables use an IX-anchored stack frame.

#### Prologue (compiler-generated)

```asm
push ix
ld   ix, 0
add  ix, sp
```

This saves the caller's `IX` and makes `IX` point to the current top of stack.

#### Frame Layout

```
IX+0 .. IX+1    saved prior IX (2 bytes)
IX+2 .. IX+3    return address (2 bytes)
IX+4 .. IX+5    argument 0 (first argument, low byte at IX+4)
IX+6 .. IX+7    argument 1
  ...
IX-2 .. IX-1    local 0 (first declared local, low byte at IX-2)
IX-4 .. IX-3    local 1
  ...
```

Each argument and local scalar occupies one 16-bit slot regardless of declared type. For `byte` parameters, the value is in the low byte of the slot; the high byte is ignored by the callee (recommended: zero-extend when pushing).

#### Raw Names in Raw Z80 Code

Module-scope storage names behave like labels in raw instruction operands, regardless of declared type:

```asm
ld hl, count   ; address of scalar global
ld hl, (count) ; stored word at scalar global
ld hl, arr     ; base address of array/record global
ld a, (arr)    ; first byte at arr
ld hl, (arr)   ; first word at arr (little-endian)
```

Function-scope raw symbolic offsets are narrower. In raw instruction operands and immediates, scalar argument and local names can be used as IX-relative slot offsets:

```asm
ld c, (ix+arg1+0)
ld b, (ix+arg1+1)
ld e, (ix+tmp+0)
ld d, (ix+tmp+1)
```

Arguments resolve to positive IX displacements; locals resolve to negative displacements. This is separate from typed/value semantics in `:=` — bare names there still mean typed values/paths, not frame offsets.

Only scalar locals/args with real frame slots participate in this raw IX-offset form. Non-scalar parameters are still passed in one 16-bit frame slot as storage references, but their names are not valid raw IX-offset symbols. Legal alias-only locals denote module-scope storage, not frame slots, so in raw code they behave like their module-scope target rather than as IX-offset symbols.

#### Epilogue (compiler-generated)

```asm
ld  sp, ix
pop ix
ret
```

A synthetic epilogue is generated whenever frame cleanup is required (locals present, or callee-save register preservation required). When a synthetic epilogue is present, every `ret` and `ret cc` written in the instruction stream is rewritten to `jp __zax_epilogue_N` or `jp cc, __zax_epilogue_N`. This ensures cleanup always runs before returning, even from a conditional early exit.

If no cleanup is needed — no locals, no saved registers — the function is **frameless**: `ret` is emitted directly at each return point and no prologue or synthetic epilogue is generated.

#### `retn` and `reti`

`retn` and `reti` are raw instructions and are not rewritten to the synthetic epilogue jump. In functions with locals (`frameSize > 0`), using `retn` or `reti` is a compile error — they would bypass local-frame cleanup. In frameless functions, `retn` and `reti` are permitted.

### 6.7 The IX Byte-Lane Constraint

The Z80 `(IX+d)` indirect byte instructions only accept registers `A`, `B`, `C`, `D`, `E` as the byte operand. Registers `H` and `L` are not valid with `(IX+d)`. This means the compiler cannot emit `LD H, (IX+d)` or `LD L, (IX+d)`.

When the compiler needs to transfer a 16-bit frame slot to or from `HL`, it uses `DE` as a shuttle via `EX DE, HL`:

```asm
; Read a word frame slot into HL
ex de, hl
ld e, (ix+d)      ; low byte — E is legal
ld d, (ix+d+1)    ; high byte — D is legal
ex de, hl         ; swap: HL now holds the value, DE restored

; Write HL into a word frame slot
ex de, hl
ld (ix+d),   e    ; E = low byte of original HL
ld (ix+d+1), d    ; D = high byte of original HL
ex de, hl         ; HL restored
```

This is entirely compiler-generated and transparent in normal use. It becomes visible when reading the `.lst` or `.z80` output to understand exactly what was emitted for a given source line.

### 6.8 SP Tracking and Stack-Depth Constraints

The compiler tracks SP deltas for:

- `push` / `pop` (±2)
- `call` / `ret` / `retn` / `reti` / `rst` (±2 or ±0)
- `inc sp` / `dec sp` (±1)
- `ex (sp), hl` / `ex (sp), ix` / `ex (sp), iy` (net delta 0)

Instructions that assign `SP` directly (`ld sp, hl`, `ld sp, ix`, `ld sp, imm16`) are permitted but the compiler does not track their delta. If you use these in a framed function, you are responsible for ensuring SP is correct at every structured-flow join and at function exit.

**Stack depth at joins must match.** At every structured-control-flow join — the end of an `if`/`else`, loop back-edges, loop exits, and the end of a `select` — the tracked stack depth must be identical on all paths that reach that join. Paths that terminate unconditionally (an unconditional `jp`/`jr` or a `ret`) do not participate in the join depth check.

```zax
func example(): void
  if Z
    push bc       ; depth +2 on this path
  end             ; COMPILE ERROR: depth mismatch — push only on one branch
end
```

### 6.9 SP and `op` Expansion

`op` expansion is inline. The stack effects of an op body are governed by the same enclosing function-stream rules. If an op pushes inside one branch of its body without a matching pop on all paths, the stack-depth mismatch will be detected at the enclosing function's join points — which may be far from the op invocation in source. Keep op bodies stack-neutral when possible.

### 6.10 Worked Example: Byte Array Sum

```zax
; Sum a byte array, return 16-bit total
func sum_bytes(data: addr, count: byte): word
  var
    total: word = 0
    ptr:   addr
  end

  ; Initialise pointer from argument (path-to-path; no HL shuttle)
  ptr := data

  b := count       ; loop counter in B
  ld hl, 0            ; running total in HL

loop:
  de := ptr        ; load current pointer into DE
  ld a, (de)          ; read byte from memory
  inc de              ; advance pointer while DE still holds it
  ptr := de        ; save advanced pointer
  ld e, a
  ld d, 0
  add hl, de          ; accumulate
  djnz loop

  ; Return total: HL already holds the result
end
```

Notes:

- `total` is declared but not used here — the running total is kept in `HL` directly. The `var` slot for `total` is still allocated; a later refactor could use it.
- `ptr` is an `addr` local used to persist the pointer across loop iterations.
- `djnz` uses `B` as the decrement-and-branch counter. Keep `B` free inside the loop body.
- The result is in `HL` at function exit — the compiler uses this as the `word` return channel.
- `data` is an `addr` argument: `ptr := data` copies that 16-bit value into the `ptr` local using the same value-semantics lowering (no register temporary required for this copy).

---

## Chapter 7 — The `op` System

### 7.1 What `op` Is

`op` defines inline macro-instructions with compile-time operand matching. Unlike a `func` call, an `op` invocation expands its body directly into the instruction stream at the call site — there is no `call` instruction, no stack frame, and no `ret`. The expansion happens at AST level, not at text level: operands are parsed, matched, and substituted as structured nodes, not as character sequences.

The practical effect is opcode-like syntax with compiler-enforced operand constraints. You write `add16 DE, BC` and the compiler selects the matching body, validates the operands, and emits the expanded instructions exactly as if you had written them directly at that position in the source.

`op` is the right tool when:

- a sequence of Z80 instructions repeats across a function or module in a mechanical way
- you want accumulator-family or register-pair operations that look like opcodes at the call site
- you need operand-specific specialization without the overhead of a function call

### 7.2 Declaration

```zax
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end
```

Multiple declarations with the same name define an overload set. The compiler selects among them at each call site based on the operands provided.

Rules:

- `op` declarations are module-scope only. An `op` inside a function body is a compile error.
- The body is an implicit instruction stream terminated by the final `end`.
- `op` bodies may be empty (zero instructions).
- `op` bodies may contain structured control flow. Internal `end` keywords close those nested constructs; the last `end` in the body closes the `op` itself.
- `var` blocks are not permitted inside `op` bodies. For temporaries, use registers and explicit `push`/`pop`.
- Cyclic expansion is a compile error. If op A invokes op B which invokes op A, the compiler reports the full cycle chain.

### 7.3 Zero-Parameter Ops

A zero-parameter `op` uses no parentheses in its declaration and is invoked by name alone on an instruction line:

```zax
op save_bc
  push bc
end

op restore_bc
  pop bc
end

op nop_slide               ; empty body — expands to nothing
end

func example(): void
  save_bc                  ; expands to: push bc
  ; ... do work that clobbers BC ...
  restore_bc               ; expands to: pop bc
end
```

**Important:** `op name` with no parentheses is the zero-parameter form. `op name()` with empty parentheses is not valid — do not add parentheses to a zero-parameter op.

Invocation: write the op name alone on a line. The compiler recognises it as an op invocation during instruction-line parsing (after checking for mnemonics).

### 7.4 Matchers

`op` parameters use **matcher types** that constrain which operand forms are accepted at the call site. Matching and substitution operate on AST nodes, not on source text.

#### Register Matchers

| Matcher | Accepts                     | Notes                             |
| ------- | --------------------------- | --------------------------------- |
| `reg8`  | `A` `B` `C` `D` `E` `H` `L` | all 8-bit registers               |
| `reg16` | `HL` `DE` `BC` `SP`         | does **not** include `IX` or `IY` |
| `A`     | only `A`                    | fixed: more specific than `reg8`  |
| `HL`    | only `HL`                   | fixed: more specific than `reg16` |
| `DE`    | only `DE`                   | fixed                             |
| `BC`    | only `BC`                   | fixed                             |
| `SP`    | only `SP`                   | fixed                             |

`reg16` includes `SP` — if your op body is only valid for `HL`, `DE`, and `BC` but not `SP`, use fixed matchers rather than `reg16`.

#### Immediate Matchers

| Matcher | Accepts                                                            |
| ------- | ------------------------------------------------------------------ |
| `imm8`  | compile-time `imm` expression whose evaluated value fits in 8 bits |
| `imm16` | compile-time `imm` expression (any value fitting in 16 bits)       |

`imm8` is more specific than `imm16` for values that fit in 8 bits — overload resolution selects the `imm8` overload when possible.

#### Address and Dereference Matchers

| Matcher | Accepts                                | Substitution                             |
| ------- | -------------------------------------- | ---------------------------------------- |
| `ea`    | storage-location expression, no parens | substitutes the location expression      |
| `mem8`  | `(ea)` dereference, byte-width context | substitutes full `(ea)` including parens |
| `mem16` | `(ea)` dereference, word-width context | substitutes full `(ea)` including parens |

`mem8` and `mem16` are more specific than `ea` in overload resolution.

The distinction between `ea` and `mem8`/`mem16` matters: if the call site writes `(hero.flags)`, an `ea` parameter does not match it — only `mem8` or `mem16` will. Conversely, if the call site writes `hero.flags` (without parens), `mem8`/`mem16` will not match — only `ea` will.

```zax
op store_byte(dst: mem8, val: reg8)
  ld dst, val
end

section data vars at $8000
  hero_hp: byte
end

func example(): void
  store_byte (hero_hp), A    ; emits: ld (hero_hp), a
  store_byte (hl),      B    ; emits: ld (hl), b
end
```

#### Indexed Register Matchers (`idx16`)

| Matcher | Accepts                                                                   |
| ------- | ------------------------------------------------------------------------- |
| `idx16` | `(IX+d)` `(IX-d)` `(IY+d)` `(IY-d)` — displacement must be in `-128..127` |
| `IX`    | fixed: only `(IX+d)` or `(IX-d)`                                          |
| `IY`    | fixed: only `(IY+d)` or `(IY-d)`                                          |

`IX` and `IY` are fixed matchers and are more specific than `idx16` in overload resolution. A displacement value outside `-128..127` is a compile error at the call site.

The full indexed operand — parentheses, base register, sign, and displacement — is substituted into the op body:

```zax
op poke(dst: idx16, val: reg8)
  ld dst, val
end

func example(): void
  poke (IX+3), A     ; emits: ld (ix+3), a
  poke (IY-1), B     ; emits: ld (iy-1), b
end
```

Note: bare `IX` and bare `IY` without displacement and without parentheses are not matched by `idx16`. They are not members of `reg16` either. To match bare `IX` or `IY` (for instructions like `ld sp, ix`), use the fixed matchers `IX` or `IY` without displacement syntax.

#### Condition Code Matcher (`cc`)

| Matcher  | Accepts                                                 |
| -------- | ------------------------------------------------------- |
| `cc`     | any condition code: `Z` `NZ` `C` `NC` `PO` `PE` `M` `P` |
| `Z`      | fixed: only `Z` — more specific than `cc`               |
| `NZ`     | fixed: only `NZ`                                        |
| `C`      | fixed: only `C`                                         |
| `NC`     | fixed: only `NC`                                        |
| _(etc.)_ | any individual condition code as a fixed matcher        |

The matched condition code token is substituted into the op body. The resulting instruction must be valid for that condition code. If your body uses `jr cond, target` and the matched code is `M` or `P` (which `jr` does not accept), it is a compile error at that call site:

```zax
; Generic branch op — uses jp, which accepts all condition codes
op branch_if(cond: cc, target: ea)
  jp cond, target
end

; Specialized for Z — jr is shorter for nearby targets
op branch_if(cond: Z, target: ea)
  jr z, target
end

func example(): void
  branch_if Z,  loop_top    ; selects Z-specialized overload (jr)
  branch_if NZ, loop_top    ; selects generic cc overload (jp)
  branch_if M,  error_exit  ; selects generic cc overload (jp)
end
```

### 7.5 Overload Resolution

When a call site matches multiple overloads, the compiler selects the most specific one. Specificity rules:

| Comparison                                         | Winner      |
| -------------------------------------------------- | ----------- |
| Fixed register (e.g. `HL`) vs class (e.g. `reg16`) | fixed wins  |
| `imm8` vs `imm16` for values fitting in 8 bits     | `imm8` wins |
| `mem8` / `mem16` vs `ea`                           | `mem*` wins |
| Fixed `IX` / `IY` vs `idx16`                       | fixed wins  |
| Fixed condition code vs `cc`                       | fixed wins  |

If no overload matches: compile error, listing the available overloads and why each failed.

If two or more overloads match with equal specificity: ambiguity compile error, listing the competing candidates.

```zax
; These two overloads are ambiguous when called with (HL, BC):
; HL matches both dst: HL and dst: reg16,
; BC matches both src: BC and src: reg16.
; The pair (HL-fixed + BC-class) and (HL-class + BC-fixed) have equal specificity.
op ambig(dst: HL,    src: reg16)  end
op ambig(dst: reg16, src: BC)     end

func test(): void
  ambig HL, BC    ; COMPILE ERROR: ambiguous — two equally-specific candidates
end
```

### 7.6 Substitution

Substitution replaces parameter names in the op body with the AST operands from the call site:

| Matcher               | Substitutes                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `reg8` / `reg16`      | the matched register token                                              |
| `imm8` / `imm16`      | the immediate expression value                                          |
| `ea`                  | the address expression (no parentheses added)                           |
| `mem8` / `mem16`      | the full dereference expression including parentheses                   |
| `idx16` / `IX` / `IY` | the full indexed operand including parens, register, sign, displacement |
| `cc`                  | the matched condition code token                                        |

The expanded body must produce valid Z80 instructions. If a substituted operand produces an invalid instruction form at the expansion site, it is a compile error at that call site — the error identifies the expanded instruction and the incompatible operand.

### 7.7 Label Hygiene

Local labels inside `op` bodies are **hygienically rewritten** per expansion site. Each expansion gets a unique compiler-generated label instance. Two expansions of the same op at different call sites never share labels:

```zax
op count_down(r: reg8)
inner:
  dec r
  jr NZ, inner
end

func test(): void
  ld b, 10
  count_down B      ; expands with unique label, e.g. __zax_inner_1
  ld c, 5
  count_down C      ; expands with different unique label __zax_inner_2
end                 ; no collision between the two expansions
```

This means you can freely use short, descriptive label names inside op bodies without worrying about conflicts at the call site or between multiple invocations.

### 7.8 Ops Invoking Ops

An op body may invoke other ops. The invoked op expands inline at the point of invocation, not as a call:

```zax
op clear_carry
  or a
end

op safe_adc16(dst: HL, src: reg16)
  clear_carry        ; expands inline: or a
  adc hl, src
end
```

The compiler detects cycles and reports them as compile errors with the full expansion chain. Recursion is not possible.

### 7.9 Register and Stack Effects

Ops are inline expansions. There is **no** compiler-generated preservation boundary around an op invocation, unlike at a typed `func` call boundary.

- The register and flag effects of an op are exactly the effects of the expanded instruction sequence.
- Stack effects in an op body are subject to the same SP-tracking and stack-depth rules as the enclosing function body (see Chapter 6.8).
- If an op pushes without a matching pop on all paths through its body, the stack-depth mismatch will be reported at the enclosing function's structural join points — which may be distant from the op invocation in source.

When an op body needs a temporary register, save and restore explicitly:

```zax
op swap_de_bc
  push de
  push bc
  pop de
  pop bc
end
```

**Destination parameter convention:** parameters whose names start with `dst` or `out` are treated as destinations by optional diagnostic tooling. If no parameter starts with `dst` or `out`, the first parameter is assumed to be the destination. This affects only tooling output — it has no effect on expansion or overload resolution.

### 7.10 Complete Example — 16-bit Add Family

```zax
; 16-bit addition for all three main register pairs

op add16(dst: HL, src: reg16)
  add hl, src              ; Z80 has a native add hl, rr instruction
end

op add16(dst: DE, src: reg16)
  ex de, hl                ; bring DE into HL for the add
  add hl, src
  ex de, hl                ; swap back: DE holds result, HL restored
end

op add16(dst: BC, src: reg16)
  push hl                  ; save HL — we need it as scratch
  ld h, b
  ld l, c
  add hl, src              ; HL = BC + src
  ld b, h
  ld c, l
  pop hl                   ; restore HL
end

func vector_add(ax: word, ay: word, bx: word, by: word): void
  hl := ax
  de := bx
  add16 HL, DE             ; selects first overload; emits: add hl, de
  ; HL = ax + bx

  de := ay
  bc := by
  add16 DE, BC             ; selects second overload; ex/add/ex sequence
  ; DE = ay + by
end
```

---

## Chapter 8 — Enums

### 8.1 Declaration

```zax
enum Mode    Idle, Run, Pause, Error
enum Signal  Red, Amber, Green
```

Members are sequential integers starting at 0: `Mode.Idle = 0`, `Mode.Run = 1`, `Mode.Pause = 2`, `Mode.Error = 3`.

Storage width is determined automatically by member count:

- `byte` (1 byte) if the member count is ≤ 256
- `word` (2 bytes) if the member count is > 256

Trailing commas in the member list are not permitted.

### 8.2 Qualified Access Is Required

In the current language, every enum member reference must use the fully qualified form `EnumType.Member`. Unqualified references are always compile errors:

```zax
ld a, Mode.Run    ; correct
ld a, Run         ; COMPILE ERROR: unqualified enum member reference
```

This applies everywhere: `const` declarations, `case` values, `LD` operands, `cp` comparisons, function arguments — everywhere. The qualifier requirement is enforced, not advisory.

### 8.3 Enum Values Are Compile-Time Constants

Qualified enum members are `imm` values. They can be used in any compile-time expression context:

```zax
enum Priority Low, Normal, High, Critical

const DefaultPriority = Priority.Normal    ; = 1
const TopPriority     = Priority.Critical  ; = 3
const PriorityRange   = Priority.Critical - Priority.Low  ; = 3

func at_max(p: byte): byte
  a := p
  cp Priority.Critical
  if Z
    ld l, 1
  else
    ld l, 0
  end
end
```

### 8.4 Using Enums With `select`

`select` / `case` is the idiomatic dispatch mechanism for enum values. `case` values must be compile-time `imm` expressions, and qualified enum members satisfy that:

```zax
enum DeviceState Idle, Busy, Error, Reset

func handle_state(state: byte): void
  a := state
  select A
  case DeviceState.Idle
    ; nothing to do
    ret
  case DeviceState.Busy
    ; process pending work
    ret
  case DeviceState.Error
    ; enter fault handling
    ret
  case DeviceState.Reset
    ld a, DeviceState.Idle
    state := a
    ret
  end
end
```

All transitions are visible at one dispatch site. No integer literals appear; every value is named.

### 8.5 Multiple Values per Case

Comma-separated enum members and stacked `case` lines both work:

```zax
enum Signal Red, Amber, Green, FlashAmber

func is_stop(sig: byte): byte
  a := sig
  select A
  case Signal.Red, Signal.FlashAmber   ; either value takes this body
    ld l, 1
    ret
  case Signal.Amber
  case Signal.Green                    ; stacked: share body below
    ld l, 0
    ret
  end
  ld l, $FF                            ; unreachable if all cases covered
end
```

Duplicate `case` values within the same `select` are a compile error.

### 8.6 Enums and `byte` Parameters

When passing an enum value as a `byte` function parameter, it travels in the low byte of the 16-bit stack slot. For enums with ≤ 256 members this is always safe — the value fits in one byte. For enums with > 256 members, declare the parameter as `word` to ensure the full value is preserved.

### 8.7 Enums and Module Visibility

Within a module, enum type names live in the same module-scope declaration
namespace as other top-level names. Enum member names (`Idle`, `Run`, etc.) are
not directly accessible as unqualified identifiers — they must always be
prefixed with the enum type name. Exported enums are referenced from importing
modules by qualification (`dep.State.Idle`).

This means member names do not pollute the module-scope declaration namespace
and multiple enums may use the same member names without collision:

```zax
enum StateA   Idle, Running
enum StateB   Idle, Stopped    ; 'Idle' and 'Idle' are fine — accessed as StateA.Idle, StateB.Idle
```

### 8.8 `step`

`step` is the in-place typed-scalar update form. It is not an expression form and may not appear inside expressions or on the RHS of `:=`.

| Statement       | Meaning                                          |
| --------------- | ------------------------------------------------ |
| `step path`     | increment the typed scalar at `path` by one step |
| `step path, -1` | decrement the typed scalar at `path` by one step |

`path` must be a typed scalar path — a named variable or a field/array element. Raw registers (e.g. `hl`, `a`) are not valid targets.

```zax
step tail_slot        ; tail_slot := tail_slot + 1 (typed, in place)
step used_slots, -1   ; used_slots := used_slots - 1 (typed, in place)
```

The programmer is responsible for range discipline at type boundaries — `step` is not automatically clamped, whether it is written directly or reached through a deprecated alias.

---

## Chapter 9 — Records and Unions

### 9.1 Records

A record is a named layout description — a sequence of named fields placed at fixed, sequential offsets.

```zax
type Sprite
  x:     byte     ; offset 0
  y:     byte     ; offset 1
  tile:  byte     ; offset 2
  flags: word     ; offset 3
end
; field sum = 5, sizeof(Sprite) = 5
```

Fields are laid out in source order. Total record size is the exact sum of field sizes.

Records must contain at least one field — an empty `type ... end` is a compile error.

### 9.2 Field Access and Value Semantics

`rec.field` is a **place expression** — a typed field location. In value/store contexts (`:=`, typed call arguments), the compiler inserts the required load or store automatically:

```zax
section data vars at $8000
  player: Sprite
end

func update(): void
  step player.x       ; in-place increment of the byte field (value semantics)

  hl := player.flags  ; read player.flags word into HL (value semantics)
  set 0, l            ; set bit 0
  player.flags := hl  ; write back
end
```

`@path` is now the source-level address-of form for typed storage paths.
It is not a general unary operator, and in v1 it is accepted only on the
source side of `rr := @path`.

### 9.3 `sizeof` and `offsetof` for Records

```zax
const SpriteSize  = sizeof(Sprite)            ; = 5
const XOff        = offsetof(Sprite, x)       ; = 0
const YOff        = offsetof(Sprite, y)       ; = 1
const TileOff     = offsetof(Sprite, tile)    ; = 2
const FlagsOff    = offsetof(Sprite, flags)   ; = 3
```

`offsetof` is the byte offset of the named field from the start of the record, based on the sum of preceding field sizes.

Always use `sizeof` and `offsetof` in code. Never hardcode field offsets — if the record changes, the built-ins update automatically.

### 9.4 Nested Records

Record fields may be of other record types, creating nested layouts:

```zax
type Point
  x: word    ; 2 bytes
  y: word    ; 2 bytes
end
; sizeof(Point) = 4

type Rect
  topLeft:     Point    ; 4 bytes at offset 0
  bottomRight: Point    ; 4 bytes at offset 4
end
; sizeof(Rect) = 8

section data vars at $8000
  viewport: Rect = { 0, 0, 320, 200 }   ; tl.x, tl.y, br.x, br.y
end
```

Nested field access uses chained dot notation:

```zax
section data vars at $8000
  vp: Rect
end

func clip_right(x: word): word
  de := x
  hl := vp.bottomRight.x  ; load the word value of bottomRight.x
  sbc hl, de
  ; result in HL
end
```

`offsetof` accepts nested paths:

```zax
const BrXOff = offsetof(Rect, bottomRight.x)   ; = 4
const BrYOff = offsetof(Rect, bottomRight.y)   ; = 6
```

### 9.5 Arrays of Records

When you declare an array of a record type, the element stride is the exact `sizeof(record)`. Power-of-two sizes remain the fast path, but non-power-of-two sizes also lower through an exact shift/add sequence.

```zax
const MaxSprites = 16

section data vars at $8000
  sprites: Sprite[MaxSprites]
end

func move_all(): void
  ld b, MaxSprites
  ld hl, 0              ; element index (0-based integer, not byte offset)
loop:
  step sprites[HL].x ; in-place increment of x (value semantics)

  inc hl                ; advance to next index
  djnz loop
end
```

The index here is `HL` holding a 0-based element number (0..15). The semantic stride is `sizeof(Sprite) = 5`. Power-of-two strides still use a pure shift chain; non-power-of-two strides use a longer exact shift/add sequence.

**`sizeof(Sprite[MaxSprites])` = 16 × 5 = 80 bytes.**

### 9.6 Designing for Clean Sizes

Power-of-two field totals are still useful because indexed access is cheaper, but they are no longer required for correct layout. Use explicit pad fields only when you want a documented hardware or binary-layout gap:

```zax
; Natural sum = 5 — exact size remains 5
type SpriteSloppy
  x:     byte
  y:     byte
  tile:  byte
  flags: word
end

; Explicit pad fields — sum = 8, intent clear when a fixed external layout needs it
type SpriteClean
  x:     byte
  y:     byte
  tile:  byte
  flags: word
  pad0:  byte
  pad1:  byte
  pad2:  byte
end
; sizeof(SpriteClean) = 8
```

They now have different semantic sizes. Use explicit pad fields only when that larger size is intentional.

### 9.7 Unions

A union overlays multiple field interpretations on the same memory region. All fields start at **offset 0**. The union's exact size is the maximum field size:

```zax
union Overlay
  w:  word     ; 2 bytes at offset 0
  lo: byte     ; 1 byte  at offset 0 — same address as w's low byte
end
; sizeof(Overlay) = max(2,1) = 2
```

There are no runtime tags, no type narrowing, and no safety checking. A union is purely a layout description.

### 9.8 Union Field Access

All union fields share offset 0. Reading or writing any field reads or writes the same underlying bytes:

```zax
section data vars at $8000
  val: Overlay
end

func split(): void
  ld hl, $1234
  val.w := hl        ; write 16-bit word: memory holds $34 at offset 0, $12 at offset 1
  a := val.lo        ; read low byte: A = $34 (offset 0 — same as low byte of w)
end
```

This is the idiomatic ZAX way to read the individual bytes of a 16-bit value without using `AND` masking.

### 9.9 The Offset-0 Trap

Because all union fields start at offset 0, a union of two `byte` fields does **not** give you access to two distinct bytes:

```zax
; THIS IS WRONG if you want byte 0 and byte 1 of a word
union TwoBytes
  lo: byte    ; offset 0
  hi: byte    ; offset 0 — SAME address as lo, not offset 1
end
```

Both `lo` and `hi` alias the same single byte. If you want independent access to both bytes of a word at their correct positions, use a **record**, not a union:

```zax
; Correct: record gives sequential byte offsets
type WordBytes
  lo: byte    ; offset 0
  hi: byte    ; offset 1
end
```

To have both a word view and a byte-pair view simultaneously, use a union containing a word field and a record field:

```zax
type BytePair
  lo: byte
  hi: byte
end

union SplitWord
  w:    word      ; 16-bit view — offset 0
  pair: BytePair  ; byte-pair view — also offset 0; pair.lo at 0, pair.hi at 1
end

section data vars at $8000
  sw: SplitWord
end

func example(): void
  ld hl, $ABCD
  sw.w := hl           ; write $ABCD
  a := sw.pair.lo      ; read low byte: A = $CD
  a := sw.pair.hi      ; read high byte: A = $AB
end
```

### 9.10 Union Rules

- At least one field is required — an empty union is a compile error.
- Union declarations are module-scope only.
- All fields start at offset 0.
- `sizeof(union) = max field size`.
- `offsetof(union, field)` is always 0 for any field.
- Unions may contain records as fields (as in `SplitWord` above). Records may contain unions as field types.

### 9.11 Type Aliases

The `type` keyword also creates simple aliases for existing scalar or array types:

```zax
type TileId   byte         ; semantic alias for byte
type MapAddr  addr         ; semantic alias for addr
type ScanLine byte[40]     ; array type alias — 40-byte row
```

Aliases can be used as field types in records, parameter types in functions, and storage types in named `data` sections. An alias has the same size as its underlying type.

Restrictions:

- `T[]` (inferred-length array) is not valid in a type alias. It is only permitted in `data` declarations (with an initializer) and in function parameter position.
- `void` is not valid as an alias target.

### 9.12 Design Guidance

**Use records for any memory layout that has named fields.** Even for simple two-byte pairs, a record makes the field names explicit and keeps `offsetof` working correctly as the type evolves.

**Use unions for multi-width views of the same bytes.** The classic case is reading a 16-bit word either as a unit or as its two constituent bytes. A union of `word` and a `BytePair` record is the idiomatic form.

**Prefer power-of-two composite sizes only when indexed-access cost matters.** Exact size is the semantic rule; power-of-two is only a performance heuristic.

**Never hardcode field offsets.** Use `offsetof` everywhere layout arithmetic appears. A record refactor that changes field order or adds a field will silently break any hardcoded offset constant; `offsetof` updates automatically.

**Be explicit about which byte of a union you are accessing.** Union access at offset 0 is always unambiguous — that is always the low byte of whatever word-sized field overlaps it, for little-endian Z80 memory layout.

---

## Chapter 10 — Modules and Imports

### 10.1 What a Module Is

A ZAX module is a single `.zax` source file. Its **canonical ID** is the file's stem — the basename without the `.zax` extension. If two modules in the same build have the same canonical ID, compilation fails with a module ID collision error.

A module file may contain, in any order:

- zero or more `include` lines (text-only insertion)
- zero or more `import` lines (must be at module scope)
- section and alignment directives (`section`, `align`)
- module-scope declarations: `type`, `union`, `enum`, `const`, `bin`, `hex`, `extern`
- named section blocks: `section code <name> ... end` and `section data <name> ... end` (with optional anchors)
- `func` and `op` declarations

Nested functions are not permitted. `op` declarations inside function bodies are not permitted.

### 10.2 Importing Modules

Two import forms are available:

```zax
import core                    ; resolved by module ID — looks for core.zax on the search path
import "drivers/uart.zax"      ; explicit path, resolved relative to the importing file
```

For quoted paths, the `.zax` extension should be included. Resolution is: first relative to the importing file's directory, then via compiler search paths (added with `-I`). If the file is not found, compilation fails.

Circular imports are a compile error.

### 10.2.1 Text-Only Includes

You can also insert raw text before parsing:

```zax
include "legacy/uart.inc"
```

`include` is a literal text insertion and has no module semantics. It can appear anywhere, and path resolution uses the same rules as `import "<path>"`.

### 10.3 Module Visibility and Qualified Names

Names declared in a module are local to that module unless imported visibility
makes them accessible from another module. Imported symbols are referenced with
qualified names (`dep.Symbol`) under the current module-visibility rules.

Name collisions are still compile errors within a module scope and at qualified-import resolution points. There is no implicit renaming or shadowing.

### 10.4 The `export` Keyword

`export` is accepted on `const`, `type`, `union`, `enum`, `func`, and `op` declarations. Exported symbols are visible to importing modules through qualified access (`dep.Symbol`). Non-exported symbols remain module-private.

```zax
export const ScreenWidth = 320
export func main(): void  end
export op add16(dst: HL, src: reg16)  end
```

### 10.5 Forward References

ZAX is whole-program compiled. You may reference a symbol before it is declared, as long as it is defined somewhere in the build by the end of compilation. There is no "declaration before use" requirement at the source level.

```zax
; This is fine — draw_sprite is defined later in the same build
export func main(): void
  draw_sprite 0, 10, 20
end

func draw_sprite(id: byte, x: byte, y: byte): void
  ; ...
end
```

Fixups for forward references to addresses (labels, functions, data symbols) are resolved after all code and data have been placed.

### 10.6 Deterministic Module Ordering

The compiler resolves the full import graph and assigns a deterministic packing order:

1. Dependencies before dependents (topological order).
2. Ties broken by canonical module ID (file stem), alphabetically.
3. Remaining ties broken by a normalized module path (project-relative, `/` separators).

This order controls how each section's contributions from multiple modules are concatenated. The build output is stable and independent of filesystem enumeration order.

### 10.7 Name Resolution Scope Recap

Inside a function body, identifier resolution proceeds in this order:

1. Local labels (scoped to the enclosing `func` or `op` body)
2. Locals and arguments (frame-bound names from the `var` block and parameter list)
3. Module-visible symbols (module-local declarations plus imported/qualified symbols)

An identifier that matches none of these is a compile error.

---

## Chapter 11 — Binary Layout and Hardware Mapping

### 11.1 Sections

ZAX uses named sections:

| Section | Contains                                | Default start address               |
| ------- | --------------------------------------- | ----------------------------------- |
| `code`  | function bodies, `op` emission          | anchored by root program (`at ...`) |
| `data`  | storage declarations and `bin` payloads | anchored by root program (`at ...`) |

Every contributed section key must be anchored exactly once by the root program. There is no external linker — ZAX resolves everything itself.

### 11.2 Section Directives

```zax
section code app at $0000
  ; code declarations
end

section data vars at $8000
  ; storage declarations
end
```

Rules:

- Use only `section code <name> ... end` and `section data <name> ... end`.
- Root anchors (`at <addr>`) are required for contributed keys.
- Duplicate anchors are compile errors.
- Missing anchors for contributed keys are compile errors.

### 11.3 What Emits Where

Each declaration kind emits to a fixed section regardless of which section is currently selected:

| Declaration         | Always emits to                                                             |
| ------------------- | --------------------------------------------------------------------------- |
| `func`              | `code`                                                                      |
| `data` declarations | `data`                                                                      |
| `bin`               | the section named in its `in <kind>` clause                                 |
| `hex`               | absolute addresses in the final image (does not affect any section counter) |

Variable declarations are valid only in `data` sections. Declaring storage in `code` sections is a compile error.

### 11.4 The Overlap Rule

If any two emissions would write a byte to the same absolute address, it is a compile error — regardless of whether the byte values are identical. This catches accidental section collisions before the binary is produced.

### 11.5 `bin` — Embedding External Binaries

`bin` embeds a raw binary file into a named section and binds its start address to a symbol:

```zax
bin sprite_data in data from "assets/sprites.bin"
```

- `in <kind>` is required — there is no default section for `bin`.
- The name (`sprite_data`) becomes an `addr`-typed global symbol bound to the first byte of the embedded blob.
- The path resolves relative to the current source file, then via search paths.

`bin` symbols can be used like any other address symbol:

```zax
func blit_sprites(count: byte): void
  ld hl, sprite_data    ; address of the embedded blob
  ; ...
end
```

### 11.6 `hex` — Placing Intel HEX at Absolute Addresses

`hex` reads an Intel HEX file and places its bytes at the absolute addresses specified in the HEX records:

```zax
hex bios from "rom/bios.hex"
```

- The name (`bios`) is bound to the **lowest address** written by the HEX file, as an `addr`-typed symbol.
- For disjoint HEX ranges, the binding is still the minimum written address across all ranges.
- `hex` output does not advance any section's location counter.
- If the HEX file contains no data records, it is a compile error.

Intel HEX validation rules:

- Only record types `00` (data) and `01` (end-of-file) are supported. Any extended-address record (`02`, `04`, etc.) is a compile error.
- All data record addresses must fit in 16 bits (`$0000..$FFFF`).
- Checksums must be valid. An invalid checksum is a compile error.
- Any `hex`-written byte that overlaps another emission (from any source) is a compile error.

### 11.7 `extern` — Binding Names to External Addresses

Use `extern func` to bind a callable name to an absolute address — typically a BIOS or ROM entry point:

```zax
extern func bios_putc(ch: byte): void at $F003
extern func bios_getc(): byte at $F006
```

- `at <imm16>` is required.
- `extern`-declared names enter the module-scope declaration namespace.
  Collisions with other module-scope symbols are errors.
- `extern func` calls carry **no** compiler-generated register preservation. Assume any register or flag may be clobbered on return. (Clobber annotation syntax is planned — see `docs/spec/zax-spec.md` Appendix F.)

### 11.8 Relative `extern` Blocks for `bin` Entry Points

When a `bin` file contains multiple entry points, you can bind them relative to the blob's base address using an `extern <binName> ... end` block:

```zax
bin legacy in code from "asm80/legacy.bin"

extern legacy
  func legacy_init(): void at $0000
  func legacy_putc(ch: byte): void at $0030
  func legacy_getc(): byte at $0034
end
```

- Each `at <offset>` value is a **byte offset from the bin symbol's base address**, not an absolute address.
- If `legacy` is placed at `$C000`, then `legacy_putc` resolves to `$C030` and `legacy_getc` to `$C034`.
- The resolved absolute addresses are used for `call` emission at the call site.
- Naming convention: prefix with the bin name to avoid collisions (`legacy_putc`, not just `putc`).

### 11.9 Output Files and Gap Fill

The compiler produces an **address→byte map**. When writing a flat `.bin` output:

- Bytes are emitted from the lowest written address to the highest.
- Any unwritten address within that range is filled with `$00` (the gap fill byte).

When writing Intel HEX output:

- Only written bytes appear in output records. Gap addresses are not zero-filled into intermediate records.

The `.lst` file is a deterministic byte dump with an ASCII gutter and symbol table. Sparse unwritten bytes appear as `..` in the hex column. Empty spans are collapsed into `; ... gap $XXXX..$YYYY` markers. For debugger-grade source mapping, use the `.d8.json` (D8M) output.

### 11.10 A Complete Layout Example

```zax
; Place code in ROM and writable storage in RAM
section code app at $0000
end

section data assets at $4000
end

section data vars at $8000
  cursor_x: byte
  cursor_y: byte
  frame_count: word = 0
end

; BIOS entry points
extern func bios_cls(): void at $FF00
extern func bios_putc(ch: byte): void at $FF03

; External ROM blobs
bin font_data in data from "assets/font.bin"

; Initialized lookup table in ROM
section data lookup at $4100
  sin_table: byte[64] = { 0, 12, 25, 37, 49, ... }
end

export func main(): void
  bios_cls
  ; ...
end
```

---

## Chapter 12 — Design Patterns and Structured Systems

### 12.1 Introduction

This chapter demonstrates how ZAX's features combine into practical
system-level patterns. Each pattern is self-contained and uses the current
surface — named sections, value semantics for scalar symbols, qualified enum
references, and `op` declarations without parentheses for zero-parameter forms.

---

### 12.2 Pattern 1 — State Machine with `enum` + `select`

The combination of `enum` for symbolic states and `select`/`case` for dispatch is the idiomatic ZAX state machine:

```zax
enum DeviceState Idle, Busy, Error

section data vars at $8000
  state: byte = 0    ; initialized to DeviceState.Idle
end

func tick(): void
  a := state      ; value semantics — no parentheses needed
  select A
  case DeviceState.Idle
    ; check for work, transition to Busy if found
    ld a, DeviceState.Busy
    state := a
  case DeviceState.Busy
    ; do work, transition back to Idle when done
    ld a, DeviceState.Idle
    state := a
  case DeviceState.Error
    ; latch error, transition to Idle for recovery
    ld a, DeviceState.Idle
    state := a
  end
end
```

Key properties:

- `state` is a scalar data symbol: `a := state` and `state := a` use value semantics directly — no `(state)` dereference.
- Enum qualification (`DeviceState.Idle`) makes every state name unambiguous even after imports.
- All state transitions are visible at one dispatch site. No hidden transitions elsewhere.
- `select` lowering is bounded compare/branch — no software multiply or jump table at three cases.

---

### 12.3 Pattern 2 — Hardware Register Driver

Typed layout + `op` for polling idioms + explicit function boundaries for ABI-safe entry points:

```zax
type UartRegs
  status:  byte     ; offset 0
  control: byte     ; offset 1
  tx_data: byte     ; offset 2
  rx_data: byte     ; offset 3
end
; sizeof(UartRegs) = 4

section data io at $FF80
  uart: UartRegs
end

; Bit constants for the status register
const UART_TX_READY = %00000001
const UART_RX_READY = %00000010

op uart_wait_tx
poll_tx:
  a := uart.status  ; value semantics — reads the status byte
  and UART_TX_READY
  jr Z, poll_tx
end

op uart_wait_rx
poll_rx:
  a := uart.status
  and UART_RX_READY
  jr Z, poll_rx
end

func uart_send(ch: byte): void
  uart_wait_tx         ; inline poll — no call overhead
  uart.tx_data := ch  ; write via value semantics
end

func uart_recv(): byte
  uart_wait_rx
  l := uart.rx_data   ; result in L (byte return channel)
end
```

Key properties:

- Hardware register offsets are derived from the typed `UartRegs` layout. The compiler computes `uart.tx_data` as `uart_base + offsetof(UartRegs, tx_data)` at compile time — no manual offset arithmetic.
- The polling ops expand inline. The emitted inner loop is identical to hand-written assembly.
- `uart_send` and `uart_recv` have typed function boundaries: callee preserves all registers except `HL`. Callers can rely on `BC`, `DE`, `IX`, `IY` surviving across these calls.
- `extern func` would be used instead if the UART driver were a pre-assembled binary at a fixed ROM address.

---

### 12.4 Pattern 3 — Command Dispatch with `select`

Dispatching on a command byte received from hardware or a protocol:

```zax
enum Command CmdNop, CmdRead, CmdWrite, CmdReset, CmdStatus

func handle_command(cmd: byte): byte
  a := cmd
  select A
  case Command.CmdNop
    ld l, 0
  case Command.CmdRead
    ; perform read, return result in L
    ld l, 1
  case Command.CmdWrite
    ; perform write
    ld l, 0
  case Command.CmdReset
    ; reset state
    ld l, 0
  case Command.CmdStatus
    ; return status byte
    a := status_flags
    ld l, a
  else
    ; unknown command — return error code
    ld l, $FF
  end
end
```

Key properties:

- All dispatch is in one place. Adding a new command means adding one `case` arm.
- The `else` arm catches any byte value not covered by a `case` — important for protocol robustness.
- `cmd` is a `byte` parameter: it arrives in the low byte of its 16-bit frame slot. `a := cmd` reads from the IX-relative slot via compiler lowering.
- No fallthrough between arms. Each arm is isolated.

---

### 12.5 Pattern 4 — Record Array Iteration

Iterating over a fixed-size array of records using a register-based index:

```zax
type Entity
  x:      byte
  y:      byte
  active: byte
  speed:  byte
end
; sizeof(Entity) = 4  — already a power of two, so indexing stays on the fast path

const MaxEntities = 16

section data vars at $8000
  entities: Entity[MaxEntities]
end

func update_all(): void
  ld b, MaxEntities     ; loop counter
  ld hl, 0              ; element index (0-based)

loop:
  a := entities[HL].active   ; load active flag for entity HL
  or a
  if NZ
    ; entity is active: update position
    a := entities[HL].x
    add a, entities[HL].speed
    entities[HL].x := a
  end

  inc hl                ; advance index
  djnz loop
end
```

Key properties:

- `HL` holds the 0-based element index, not a byte offset. The compiler emits the scaling shift chain (`sizeof(Entity) = 4` → two `ADD HL, HL` instructions) for each indexed access.
- Field accesses inside the loop (`entities[HL].active`, `entities[HL].x`) use value semantics — the compiler emits the dereference.
- Because `sizeof(Entity)` is 4, indexing stays on the shift-only fast path.
- `djnz` uses `B` as the counter. Keep `B` free inside the loop body; don't use it for arithmetic without saving first.

---

### 12.6 Pattern 5 — `op` Overload Set for Register-Pair Arithmetic

Building a family of ops that abstract over which register pair is being operated on:

```zax
; 16-bit addition for any register pair destination
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end

op add16(dst: BC, src: reg16)
  push hl
  ld h, b
  ld l, c
  add hl, src
  ld b, h
  ld c, l
  pop hl
end

; Clear a register pair
op clr16(dst: HL)
  ld hl, 0
end

op clr16(dst: DE)
  ld de, 0
end

op clr16(dst: BC)
  ld bc, 0
end

func vector_add(ax: word, ay: word, bx: word, by: word): void
  hl := ax
  de := bx
  add16 HL, DE          ; HL = ax + bx
  de := ay
  bc := by
  add16 DE, BC          ; DE = ay + by
end
```

Key properties:

- `add16 HL, DE` selects the `dst: HL` overload — the most direct form, emitting a single `add hl, de`.
- `add16 DE, BC` selects the `dst: DE` overload — using `ex de, hl` to leverage Z80's `add hl, *` instruction.
- `add16 BC, DE` would select the `dst: BC` overload — using `HL` as a scratch register with save/restore.
- Overload resolution is a compile-time decision. No runtime branching on the register pair.

---

### 12.7 Pattern 6 — Interrupt Handler with Layered Abstraction

A safe interrupt handler that preserves state, does minimal work inline, and delegates to a typed function:

```zax
section data vars at $8000
  irq_pending: byte
  irq_count:   word
end

op save_all
  push af
  push bc
  push de
  push hl
  push ix
  push iy
end

op restore_all
  pop iy
  pop ix
  pop hl
  pop de
  pop bc
  pop af
end

; This function body is the actual ISR — entered via Z80 interrupt vector
; No func declaration here: it is a raw label targeted by the interrupt vector.
; Place it via an explicit extern or section directive in the loader.
func isr_handler(): void
  save_all

  ; Minimal work: set a flag for the main loop to act on
  ld a, 1
  irq_pending := a

  ; Increment counter (typed in-place update)
  step irq_count

  restore_all
  reti                ; raw reti — NOT rewritten to epilogue jump
end
```

Key properties:

- `save_all` and `restore_all` are zero-parameter ops. They expand inline with no call overhead.
- The compiler does not generate a frame for `isr_handler` because it has no parameters and no `var` block — so no IX is clobbered by the prologue.
- `reti` is a raw instruction and is **not** rewritten to the synthetic epilogue jump. This is correct for ISRs. If `isr_handler` had locals, `reti` would be a compile error (it would bypass frame cleanup).
- `irq_pending` and `irq_count` use value semantics for both read and write. The compiler emits the correct loads and stores.
- The main loop checks `irq_pending` by polling:

```zax
export func main(): void
main_loop:
  a := irq_pending
  or a
  if NZ
    ld a, 0
    irq_pending := a   ; clear the flag
    ; handle the interrupt event
  end
  jr main_loop
end
```

---

### 12.8 Layered Abstraction Model

ZAX rewards a four-level layering model:

| Level    | Tool             | Role                                                                                                                    |
| -------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Micro    | `op`             | Inline sequences that repeat across a function or module — polling loops, save/restore idioms, register-pair arithmetic |
| Callable | `func`           | Boundary-safe units with typed parameters, typed return, callee preservation — the public API surface of a module       |
| Domain   | `enum`           | Symbolic names for states, commands, modes — wherever an integer would otherwise be magic                               |
| Layout   | `type` / `union` | Binary structures that map to hardware registers, protocol packets, sprite tables, file headers                         |

When deciding which tool to use:

- If it has no call overhead and the body is mechanical: `op`
- If it crosses a module boundary or needs a stable ABI surface: `func`
- If it is a named set of integer constants that appear in `select`/`case`: `enum`
- If it describes a fixed memory layout: `type` or `union`

---

### 12.9 Predictability Checklist

Working in ZAX means keeping the lowering predictable. A few habits help:

- **Prefer power-of-two composite sizes only when access cost matters.** Exact size is authoritative; use explicit pad fields only when an external binary layout requires them.
- **Keep index expressions within the valid index forms.** Only constant, 8-bit register, 16-bit register, `(HL)`, and `(IX/IY±d)` are valid inside `[...]`. Stage any pre-computation into a register first.
- **Establish flags immediately before `if`/`while`/`until`.** The condition is tested at the keyword using whatever flags are current. A `ld` between your compare and your `if` will overwrite the flags silently on Z80.
- **Keep `op` bodies small and mechanical.** If an op body is doing significant work, consider whether a `func` with its typed boundary guarantees would be clearer.
- **Use `sizeof` and `offsetof` everywhere.** Never hardcode a field offset. If the type changes, the built-ins update automatically.
- **Use qualified enum names everywhere.** `Mode.Run` everywhere, never bare `Run`. Unqualified references are compile errors in the current language — this is enforced, not advisory.
- **Check the `.z80` or `.lst` output when something looks wrong.** The lowered outputs show exactly what the compiler emitted. The IX byte-lane shuttle (`ex de, hl` / `ld e, (ix+d)` / ...) is particularly visible here.
- **Treat `docs/spec/zax-spec.md` as the final authority.** This guide is instructional; the spec is normative.
