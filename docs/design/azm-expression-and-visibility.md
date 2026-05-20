# AZM expressions and visibility

Status: normative direction
Date: 2026-05-19

## Summary

AZM is a Z80 **assembler with a powerful constant expression language**. It is not
a high-level language that emits hidden machine code. Anything that appears in
the programmer’s source as an instruction should correspond to instructions in
the object output, modulo well-defined, visible expansions (for example `op`
bodies and opt-in procedure frame helpers).

Layout types, `sizeof`, `offset`, and layout-cast syntax are **expression
features**. They exist to make constants easier to write than long
`offset(...)` / `sizeof(...)` forms. They must not reintroduce ZAX-style typed
memory access or runtime address generation.

For native `.azm`, the accepted source shape is flat source-file assembly:
labels, Z80 instructions, `.org`, `.equ`, raw data directives, textual includes,
directive aliases, layout metadata, and `op` declarations. The rejected shape is
the old ZAX high-level surface: `func`, named `section` blocks, `:=`,
structured control, typed storage, typed externs, and runtime typed
effective-address lowering.

## What “lowering” means in this project

The codebase uses _lowering_ for many pipeline stages (parse → IR → bytes).
That is implementation vocabulary, not AZM product vocabulary.

For AZM direction, distinguish:

| Term                               | Meaning for AZM                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Assembly emission**              | Choosing encodings and fixups for instructions the programmer wrote. Expected.                                                |
| **Constant expression evaluation** | Folding `sizeof`, `offset`, layout casts, and `.equ` at assemble time. Expected.                                              |
| **Visible expansion**              | `op` bodies, included files, opt-in procedure preamble/postamble shown in listing. Allowed when explicit and inspectable.     |
| **Hidden lowering**                | Generating multiply/add, stack walks, or memory access the programmer did not write. **Not allowed** for AZM-native features. |

If a feature only works by synthesizing runtime indexing or typed load/store
sequences, it belongs to the ZAX retirement bucket, not AZM.

## ZAX vs AZM (philosophy)

| Topic                      | ZAX                                            | AZM                                            |
| -------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Primary model              | Structured assembler / near-high-level         | Assembler + constants                          |
| Subroutines                | `func` with parameters/locals                  | Labels + `call` / `ret` only                   |
| Types                      | Storage classes, typed `data`/`var`, inference | Layout metadata only                           |
| `:=` / typed assignment    | Core                                           | Retire in `.azm`                               |
| Field/index on values      | Often compiler-lowering                        | **Constants only** via `offset` or layout cast |
| Registers in layout paths  | Sometimes allowed with codegen                 | **Rejected** — use explicit Z80                |
| Layout cast `<T>base[i].f` | Mixed constant + runtime paths                 | **Constant fold only** or error                |
| Equivalence                | —                                              | Must match expanded `sizeof`/`offset` forms    |
| Output vs source           | Could diverge via hidden codegen               | **Must match** programmer-visible instructions |

## Layout casts are syntax, not memory access

These two lines should assemble to the **same constant** (same fixup addend):

```asm
FLAGS_OFF .equ offset(Sprite, flags)
ld hl, SPRITES + (3 * sizeof(Sprite)) + FLAGS_OFF

ld hl, <Sprite[16]>SPRITES[3].flags
```

Rules:

1. **Parse** layout-cast syntax into the same constant-expression machinery as
   `sizeof` / `offset`.
2. **Fold** at assemble time when `base` is a label (or label ± constant) and
   every `[index]` is a compile-time expression.
3. **Reject** when any index is a register or other runtime value.
4. **Emit** ordinary `ld` / fixup behavior — no special “typed LD” path in the
   long term.

Memory dereference stays explicit:

```asm
ld a,(<Sprite[16]>SPRITES[3].flags)
;        ^ parentheses = Z80 “byte at address”, not part of the cast
```

After folding, this is `ld a,(SPRITES + 15)`, not a typed byte load pipeline.

## Implementation guidance (adapting inherited code)

Prefer this pipeline for layout features:

```
source text
  → parse (types, expressions, layout-cast EA)
  → constant evaluation (sizeof, offset, layout-cast fold)
  → plain immediates / fixup operands
  → instruction emission (existing ld jp call … paths)
```

Avoid routing layout casts through:

- `lowerLdWithEa` typed storage matrices
- `valueMaterializationRuntimeEa` / exact-scale indexing helpers
- `:=` assignment lowering

Inherited ZAX `import` modules are a removal target. Native `.azm` must not
depend on them for layout constants or cross-file organization. AZM’s
multi-file mechanism is ASM80-style textual include, where included text
participates in the same assembly unit.

## What AZM deliberately keeps (not “hidden compiler”)

Three mechanisms add power without turning AZM into ZAX. They must stay
distinct in documentation and implementation.

### 1. Directive aliases (input normalization)

**What:** A fixed, small set of canonical directives (`.db`, `.dw`, `.ds`,
`.org`, `.equ`, …) plus a **directive-alias** table that rewrites legacy heads
before parse — for example `DEFB` → `.db`, `DB` → `.db`.

**What it is not:** A macro system. Aliases apply to **directive heads** (and
the same normalization policy documented in `docs/spec/azm-assembly-baseline.md`).
They must not rewrite arbitrary text, stitch tokens, or expand instruction
sequences.

**Why keep it:** Real corpora use many spellings; AZM teaches one dialect while
accepting others without growing the core grammar.

### 2. `op` — AST-based instruction idioms (ZAX innovation, AZM core)

**What:** Parsed `op` declarations that **inline-expand** at each call site into
ordinary Z80 instructions the programmer can read in the listing — for example a
`mul8` op that emits a visible sequence of adds/shifts, or `clear_a` → `xor a`.

**Why this is not the same as “hidden lowering”:**

|         | Layout cast / typed ZAX access | `op` expansion                     |
| ------- | ------------------------------ | ---------------------------------- |
| Trigger | Type system infers behavior    | Programmer names the op            |
| Site    | Operand typing pipelines       | Explicit call site                 |
| Output  | Could synthesize indexing      | **Instructions at call site**      |
| Model   | Near-high-level                | **CPU superpowers** — named idioms |

Ops **do** generate extra opcodes; that is intentional and inspectable. They are
AZM’s answer to macros: **AST substitution**, not text substitution.

Register-care should analyze the visible expanded instructions. An op
invocation does not create a call boundary or an implicit callee contract. For
example, `clear_a` must be summarized as the emitted `xor a`, including the
register and flag effects of that instruction.

**AZM vs ZAX ops:** Keep the mechanism; **simplify** the surface (operand
matching without full ZAX type signatures in op declarations). Deprecate ZAX-only
op features that assume typed storage or high-level contracts. Normative subset:
`docs/design/azm-ops-subset.md`.

**Blocked alternative:** A text-based macro preprocessor remains out of scope.

### 3. Constant expressions (including layout syntax)

`sizeof`, `offset`, layout casts, `.equ` — fold to constants; **no** extra
instructions. See sections above.

### Procedure / frame helpers (optional, separate)

Optional, declaration-driven frame/call helpers may emit visible setup/teardown.
They are not ops and not layout expressions. Must stay **opt-in** and
**listing-visible**. See `docs/design/azm-language-direction.md`.

## Documentation and retirement

| Keep / update                                   | Role                                      |
| ----------------------------------------------- | ----------------------------------------- |
| `docs/design/azm-language-direction.md`         | Product direction                         |
| `docs/design/azm-expression-and-visibility.md`  | This file — normative “no hidden codegen” |
| `docs/design/azm-directive-aliases.md`          | Canonical directives + alias policy       |
| `docs/design/azm-ops-subset.md`                 | AST `op` expansion rules                  |
| `docs/design/exact-size-layout-and-indexing.md` | Layout math and cast syntax               |
| `docs/spec/azm-assembly-baseline.md`            | What AZM accepts at the opcode level      |

| Delete or retire             | Examples                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| ZAX language spec and guides | old `docs/spec/zax-*` and guide material                                              |
| ZAX-centric lowering flows   | hidden typed LD, effective-address, section, and function-lowering reference material |
| Old design explorations      | stale ZAX planning documents                                                          |

New work should cite **expression folding**, not “layout LD lowering”.

## Test and deletion gate

`npm run test:azm:alpha` is the default AZM guardrail lane. It should cover the
flat native frontend, ASM80 baseline, directive aliases, includes,
register-care, ops, and layout constants.

`npm run test:azm:corpus` is the optional local corpus guardrail. It compares
read-only Tetro and Pacmo inputs against ASM80 output. MON3 remains skipped
until a known entry is configured.

## Review checklist (PR / feature)

1. Does `.azm` source show every instruction emitted for this feature?
2. Can the feature be expressed with `sizeof` / `offset` alone?
3. Does any register participate in a layout-cast path? If yes, reject.
4. Does the change add a special LD/mem pipeline? Prefer constant fold + generic fixup.
5. Are tests classified as AZM Core vs ZAX Compatibility Quarantine?
