# ASM80 MON3 compatibility audit

Status: planning input for the ASM80-first language track
Date: 2026-05-10

## Purpose

This audit defines the smallest useful ASM80-compatible surface for the first
classic-assembler milestone. The target is not full ASM80 compatibility. The
target is to assemble the TEC-1G MON3 source tree without hand translation,
while keeping the current ZAX implementation as the base.

## Corpus

Primary entry:

- `/Users/johnhardy/Documents/projects/MON3/src/mon3.z80`

Recursive include tree:

- `/Users/johnhardy/Documents/projects/MON3/src/packages.z80`
- `/Users/johnhardy/Documents/projects/MON3/src/glcd_library.z80`
- `/Users/johnhardy/Documents/projects/MON3/src/disassembler.z80`
- `/Users/johnhardy/Documents/projects/MON3/src/sound.z80`
- `/Users/johnhardy/Documents/projects/MON3/src/pata_fat32.z80`
- `/Users/johnhardy/Documents/projects/MON3/src/rtc.z80`

Adjacent secondary sample:

- `/Users/johnhardy/Documents/projects/MON3/src/api_includes.z80`

`api_includes.z80` is useful for future comparison, but it is not currently
part of the recursive `mon3.z80` include path.

Observed size:

- 10,865 total lines
- 8,694 non-comment code lines

## Required classic source model

The first milestone needs a source mode where classic assembler lines are valid
at top level. MON3 is not written as ZAX modules, functions, sections, or typed
storage. It is a flat assembler program that controls placement with `.org` and
uses labels, equates, raw data, and normal Z80 instructions.

The first implementation should therefore add an ASM80/classic source path
instead of forcing MON3 into existing `func` and `section` syntax.

Recommended activation:

- `.z80` and `.asm` source files use classic ASM80 mode by default.
- Unsupported source extensions are rejected rather than treated as alternate
  source modes.
- An explicit CLI/API option may override the inferred mode later, but file
  extension inference is enough for the first milestone.

## Syntax convergence policy

Because there is no established external ZAX user base yet, overlapping
assembler-level features should converge toward ASM80 spelling instead of
keeping two equally promoted surfaces. This does not mean deleting ZAX's typed
features. It means that when a construct is fundamentally an assembler
directive, the ASM80 spelling should become the preferred spelling.

Preferred ASM80 forms:

| Current ZAX area | Preferred ASM80-compatible direction |
|---|---|
| `include "file"` text insertion | `.include "file"` |
| ASM80-style raw constants | `Name: .equ expr` or `Name .equ expr` |
| AZM constants | `Name .equ expr` remains the canonical assembler spelling |
| `align expr` | `.align expr` |
| `db` / `dw` / `ds` raw data | `.db` / `.dw` / `.ds`, with undotted ASM80 forms tolerated |
| low-level string blobs | `.cstr`, `.pstr`, `.istr` where those encodings are intended |
| binary output trim/start controls | `.binfrom` and later `.binto` |

This tolerance is limited to the canonical ASM80 spellings already in the
baseline. Dialect aliases such as `DEFB`, `DEFW`, and `RMB` should be
normalized to `.db`, `.dw`, and `.ds` before AZM sees the source.

AZM-only forms remain justified when they carry assembler-facing metadata semantics:

- `type`, `union`, and `enum` declarations for layout and named constants
- `op` declarations for AST-level assembler expansion
- typed function boundaries if retained
- imports/modules if retained as a higher-level feature

The implementation should support old ZAX spellings during transition where
cheap. New assembler-first examples should teach ASM80 spellings for raw
assembler concepts, while ZAX-level examples may still use `const` where that
syntax reads better alongside typed declarations.

## Required syntax forms

### Labels

MON3 uses ordinary labels with colons:

```asm
boot:
rst08:
kCPI:   cpi
```

MON3 also uses label-plus-statement on one line. The parser must support a
leading label and then parse the rest of the line as an instruction or directive.

Observed:

- 1,005 colon labels
- 264 labels with code or directive on the same line

### Equates

MON3 uses dotted ASM80 equates:

```asm
KEYB:       .equ    00H
MCB_RTC     .equ    40H
STACK_TOP:  .equ    MON_RAM+STACK_SIZE
```

Both forms are required:

- `name: .equ expr`
- `name .equ expr`

Observed:

- 216 `.equ` lines total
- 207 colon `.equ` lines
- 9 bare-label `.equ` lines

MON3 also uses string-valued equates:

```asm
SPACE:      .equ    " "
COLON:      .equ    ":"
```

Classic expression evaluation must therefore preserve ASM80's useful behavior
where a one-character string can participate in byte expressions.

### Numeric literals

MON3 uses trailing-base ASM80 number syntax heavily:

```asm
00H
0C000H
10101010B
```

Required rules:

- Accept uppercase and lowercase suffixes: `0FFH`, `0ffh`, `1010B`, `1010b`.
- Require the first character to be a decimal digit.
- Treat `FFH` as an identifier/symbol candidate, not a numeric literal.
- Require the leading `0` ambiguity breaker when the first hexadecimal digit
  would otherwise be alphabetic: `0FFH`, not `FFH`.
- Reject invalid binary digits in binary-suffix literals such as `102B`.

Observed:

- 2,509 trailing-`H` literals
- 1,559 trailing-`B` literals
- lowercase `h` and `b` suffixes are common in the package files

### Expressions

MON3 mainly uses simple assembler expressions:

```asm
STACK_TOP+32
BASE_ADDR+08H
APICall-BASE_ADDR
API_COUNT/2
"a"-"A"
$-label
($-DSAPIFunctions)/2
```

Required for the first milestone:

- symbol references
- `+`
- `-`
- `*`
- `/`
- parentheses
- current-location symbol `$`
- one-character string values in expressions

The audit found current-location expressions in branch-delay idioms such as
`jr z,$+5`, `djnz $`, and `call $+3`. Broader ASM80 expression features can be
deferred until the corpus requires them.

### Placement

MON3 controls output addresses with `.org`:

```asm
.org BASE_ADDR
.org BASE_ADDR+08H
```

Observed:

- 18 `.org` lines

Required behavior:

- `.org expr` sets the current output address.
- Multiple `.org` directives are allowed.
- Emission must detect overlapping bytes rather than silently overwriting.

### Raw data

MON3 uses dotted raw data directives:

```asm
.db "Enter "
.db "= Enter Parameters =",0
.dw DATA_FROM
```

Observed:

- 1,907 `.db` lines
- 188 `.dw` lines

Required behavior:

- `.db` accepts comma-separated expressions and double-quoted strings.
- `.dw` accepts comma-separated expressions and label fixups.
- A leading label may bind the address of a `.db` or `.dw` line.

The first milestone does not require `DUP`, `.cstr`, `.pstr`, `.istr`, or `.ds`
for MON3, though `.ds` is already conceptually aligned with existing ZAX raw
data.

Follow-up priority:

- `.cstr`, `.pstr`, and `.istr` are useful enough to include in the early
  ASM80 compatibility backlog even though MON3 does not require them.
- `.align` should be treated as the preferred spelling over ZAX `align`.
- `DUP` in `.db`/`.dw` is lower priority because it is not part of the current
  MON3 corpus and is not commonly used in the target examples.

### Includes

MON3 uses recursive quoted includes:

```asm
.include "packages.z80"
```

Observed:

- 6 `.include` lines

Required behavior:

- Include files are inserted before assembly.
- Paths resolve relative to the including file.
- Source locations should preserve enough file/line information for diagnostics.

ASM80 block includes (`.include file:block`) are not required for MON3.

### Binary output range

MON3 uses:

```asm
.binfrom 0C000H
```

Observed:

- 1 `.binfrom` line

Required behavior:

- Record the requested binary export start address.
- The first milestone may use it only for binary artifact trimming/comparison.
- MON3 places `.binfrom` after `.end`; the classic parser must still record it
  or deliberately special-case post-`.end` output-control directives.

`.binto` is in ASM80 but was not observed in the MON3 source tree.

### End marker

MON3 uses:

```asm
.end
```

Observed:

- 1 `.end` line

Required behavior:

- Stop parsing/assembly at `.end`.
- Ignore following text, if any.
- Exception: post-`.end` `.binfrom` should be accepted for MON3 compatibility,
  because MON3 uses `.end` followed by `.binfrom 0C000H`.

## Required Z80 instruction surface

The corpus uses ordinary Z80 instructions. Frequent heads include:

| Head | Count |
|---|---:|
| `ld` | 1904 |
| `call` | 616 |
| `jr` | 471 |
| `ret` | 310 |
| `pop` | 245 |
| `cp` | 239 |
| `inc` | 236 |
| `push` | 236 |
| `jp` | 177 |
| `add` | 156 |
| `or` | 137 |
| `and` | 119 |

Less common but required heads include:

- `adc`
- `bit`
- `ccf`
- `cpi`
- `cpir`
- `cpl`
- `daa`
- `djnz`
- `ex`
- `exx`
- `in`
- `ini`
- `ldi`
- `ldir`
- `lddr`
- `neg`
- `nop`
- `out`
- `outi`
- `res`
- `reti`
- `retn`
- `rl`
- `rla`
- `rlc`
- `rlca`
- `rld`
- `rr`
- `rra`
- `rrc`
- `rrca`
- `rst`
- `sbc`
- `scf`
- `set`
- `sla`
- `srl`
- `sub`
- `xor`

The implementation should not add all possible Z80 forms blindly. It should add
tests from the MON3 corpus, run the compiler, and close only the missing forms
that the corpus exposes.

Notably absent from the MON3 tree:

- `di`
- `ei`
- `halt`
- `im`
- `ind`, `indr`, `inir`
- `outd`, `otdr`, `otir`
- `rrd`
- `sll`

Those should not block the first MON3 milestone.

## Required operand/addressing forms

MON3 requires ordinary Z80 operand forms including:

```asm
ld a,n
ld rr,nn
ld r,r
ld (addr),rr
ld rr,(addr)
ld (hl),r
ld r,(hl)
ld a,(bc)
ld a,(de)
ld (bc),a
ld (de),a
ld a,(ix+6)
ld a,(iy+16)
ex (sp),hl
ex de,hl
ex af,af'
in a,(PORT_SYMBOL)
out (PORT_SYMBOL),a
rst 28H
jr nz,$-3
jr z,$+5
djnz $
call $+3
jp APICall-BASE_ADDR
```

Observed indexed displacements are positive `ix/iy + decimal` forms. The audit
did not find `(ix-n)` or `(iy-n)` forms in the MON3 tree.

## ASM80 features to know but defer

ASM80 documents useful features that are not first-milestone requirements:

- `.cstr`, `.pstr`, `.istr` (early follow-up)
- `.align` (early follow-up and preferred spelling for raw alignment)
- `DUP` in `db`/`dw` (lower priority)
- `.if`, `.ifn`, `.else`, `.endif`
- `.macro`, `.rept`, `.endm` (explicitly out of scope for this language
  direction)
- `.block`, `.endblock` (explicitly out of scope with macros/repeat)
- `.include file:block`
- `.cseg`, `.dseg`, `.eseg`, `.bsseg`
- `.incbin`
- `.set`
- `.ent`
- `.binto`
- `.pragma`
- VS Code extension work and LSP/language-server integration

These should be tracked as follow-up compatibility slices, not bundled into the
MON3 milestone unless the corpus proves they are needed. Macro and repeat
features should remain out of scope unless the project explicitly reopens the
baseline, because ZAX's long-term abstraction direction is OPS and typed
language features rather than ASM80 text macros.

Editor integration is also outside this audit's current execution scope. The
first milestone should prove parser, lowering, and artifact compatibility before
VS Code or LSP work is scheduled.

## First milestone acceptance criteria

The first milestone is complete when:

1. ZAX can load the recursive MON3 source tree in classic ASM80 mode.
2. ZAX can parse all MON3-required directives, labels, literals, expressions,
   raw data, includes, and instructions.
3. ZAX emits bytes for the MON3 image without hand translation.
4. The emitted binary or Intel HEX matches the existing MON3 reference artifact.
5. Unsupported source extensions stay outside the compatibility contract.
