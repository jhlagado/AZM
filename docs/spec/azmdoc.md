# AZMDoc metadata comments

Status: draft standard
Date: 2026-05-17

## Purpose

AZMDoc is the documentation and metadata format for AZM assembly source. It is
inspired by JSDoc: prose remains the primary form, while `@` tags add structured
metadata that tools can parse.

AZMDoc must serve humans first. A routine comment should still read naturally in
an editor, printed listing, or old assembler source file. Metadata exists to
make that prose checkable.

## Core rule

An AZMDoc tag is a known `@tag` inside an ordinary semicolon comment.

```asm
; Candidate x is supplied in @in D candidate_x.
; Candidate y is supplied in @in E candidate_y.
; The collision result is returned in @out carry set when blocked.
```

The `;` starts the assembly comment. The `@` starts structured metadata inside
that comment. Text before and after the metadata remains human-facing prose.

The old `;! @tag` spelling may be accepted for compatibility with early
register-care experiments, but it is not the preferred hand-written style.

Generated contract blocks use a stricter form. The block divider marks the lines
as AZM-owned metadata, so the lines inside the block do not use `@`:

```asm
; Human prose remains outside the generated block.
; ========================== AZM
; in        DE
; out       carry
; clobbers  A,BC,HL
; ========================== AZM
CHECK_COLLISION_AT_DE:
```

AZM may replace everything between the two divider lines when regenerating
contracts. Hand-written prose should stay outside the block.

## Routine doc blocks

A routine doc block is the contiguous group of comment-only lines immediately
before a global label. Metadata in that block applies to the label.

Source annotation tools should append generated contract blocks only to labels
that already have a routine doc block, or replace an existing generated AZM
block. This keeps internal branch labels and unstructured code bodies free from
machine-generated comment noise. If the inferred source-facing contract has no
content, the tool should omit the block or remove the stale generated block.

```asm
; CHECK_COLLISION_AT_DE
; Tests candidate active-piece placement against walls, floor, and board rows.
;
; Candidate x is supplied in @in D candidate_x.
; Candidate y is supplied in @in E candidate_y.
; The result is returned in @out carry collision flag.
; Scratch use is limited to @clobbers A.
CHECK_COLLISION_AT_DE:
```

No `@routine` tag is required when the doc block directly precedes the label.
The label is the routine name.

## Detached blocks

Detached interface files, external routines, or unusual source layouts should
use explicit block tags:

```asm
; @routine CHECK_COLLISION_AT_DE
; @in D candidate_x
; @in E candidate_y
; @out carry collision
; @clobbers A
; @end
```

External contracts use `@extern`:

```asm
; @extern MON_SCANKEYS
; @out A key_code
; @out carry new_press
; @out zero key_pressed
; @end
```

## Tag grammar

The lightweight line shape is:

```text
; prose @tag carrier-list optional description
```

For v1, tools should parse one metadata tag per comment line. Use multiple
comment lines when a routine has multiple inputs or outputs.

Carrier lists may use compact or explicit spelling:

```asm
; @in DE raw_coordinate
; @in D,E raw_coordinate
; @in {DE} raw_coordinate
```

Generated tools should prefer compact pair spelling without braces and should
avoid redundant preservation lists or routine-wide scratch-flag clobbers:

```asm
; in        DE
; clobbers  A,BC,HL
```

## Standard tags

### `@in`

Declares registers or flags whose incoming value is meaningful to the routine.
When a routine has an AZMDoc contract, the `@in` list is the declared semantic
register input surface. Do not list registers that are only read internally as
scratch or save/restore mechanics.

```asm
; @in HL pointer to zero-terminated text
; @in A raw key code
```

### `@out`

Declares registers or flags that carry meaningful returned values. An output is
not an accidental clobber.

```asm
; @out A normalized direction
; @out carry set when movement succeeds
```

If a routine intentionally transforms a register in place, the same carrier may
appear in both `@in` and `@out`:

```asm
; @in DE raw coordinate
; @out DE normalized coordinate
```

### `@clobbers`

Declares externally visible scratch damage. The caller must preserve these
carriers if it needs their incoming values after the call.

```asm
; @clobbers A,BC,DE,HL
```

Do not list carriers as clobbered when they are declared with `@out`; outputs
are intentional return channels.

Do not list flags as clobbered merely because ordinary Z80 instructions update
them. Flags should appear in source contracts when they are semantic outputs,
such as `@out carry set when blocked`. Detailed audit reports may still show
all inferred flag writes.

### `@preserves`

Declares carriers restored to their incoming value before return.

```asm
; @preserves BC,DE,HL
```

A register used internally with push/pop protection should be documented as
preserved, not clobbered.

Generated source-facing contracts should omit `@preserves` by default. In AZMDoc,
unlisted carriers are assumed not to be part of the routine's externally visible
damage. Use `@preserves` only when an external boundary or human-facing API
needs to make restoration explicit.

### `@routine`

Starts an explicit routine contract in a detached block or unusual layout. It is
not needed for an ordinary doc block immediately before a label.

```asm
; @routine DRAW_CELL
```

### `@extern`

Starts a contract for a routine whose body is not available to the analyzer.

```asm
; @extern MON_SCANKEYS
```

### `@expect-out`

Declares a caller-local expectation for the next call. This is a hint for an
ambiguous call site, not the preferred way to document a stable routine API.

```asm
; @expect-out DE normalized coordinate
call NORMALISE_COORD
```

If many call sites need the same `@expect-out`, the callee needs a proper
routine or extern contract.

### `@end`

Ends a detached `@routine` or `@extern` block.

```asm
; @end
```

`@end` is not required for implicit routine doc blocks.

## Carrier names

Tools should understand individual 8-bit register carriers:

```text
A B C D E H L IXH IXL IYH IYL SPH SPL
```

Register pairs are shorthand for their constituent carriers:

```text
BC = B,C
DE = D,E
HL = H,L
IX = IXH,IXL
IY = IYH,IYL
SP = SPH,SPL
```

Flags may be named individually:

```text
carry zero sign parity halfCarry
```

Use `carry` for the carry flag. Use `C` for register C. `F` is not a true
programmer-facing register-care carrier; tools may accept bare `F` as a
compatibility spelling for all individual flags, but generated metadata should
avoid `F` and `AF`. When a flag is semantically meaningful, generated metadata
should name that individual flag, for example `@out carry`.

## Tooling behavior

AZMDoc-aware tools should:

- ignore unknown `@` tags unless a strict documentation mode is enabled
- ignore prose that is not part of a known tag
- treat generated `; ========================== AZM` blocks as tool-owned and
  replaceable
- preserve comments when emitting source
- never change generated bytes because of AZMDoc metadata alone
- prefer warnings before hard failures while a source tree is being annotated
- allow syntax highlighters to style known tags and carrier names distinctly

AZMDoc gives tools structured information, but the source remains ordinary Z80
assembly with comments.
