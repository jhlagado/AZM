# AZM 0.3 Declarations, Local Symbols and Routines

This document defines the AZM 0.3 source model. It replaces the overloaded
AZM 0.2 `@` routine/export marker and semantic `;!` comments with separate
syntax for symbol visibility, local names and register-contract routines.

## Design Rules

AZM keeps four concerns independent:

| Concern                       | Syntax                                            |
| ----------------------------- | ------------------------------------------------- |
| Source-unit symbol            | `Name`                                            |
| Exported symbol               | `@Name` at its declaration                        |
| Local symbol                  | `_name` at its declaration and references         |
| Routine and register contract | `.routine ...` immediately before its entry label |

The prefixes are declaration syntax. `@` is not part of the exported symbol's
lookup name. A local underscore remains visible in source and debug displays,
but AZM qualifies it internally by its owning non-local symbol.

`@_name` is always invalid. Exported and local visibility are mutually
exclusive.

Every declaration also has an internal identity containing its source ownership
unit, declaration kind, exact case-sensitive name and source span. Display names
are not semantic identity. This permits two imported modules to contain private
symbols or routines with the same spelling without sharing contracts, summaries
or call targets.

## Non-Local and Exported Symbols

An unprefixed declaration is non-local. In the entry source unit and textual
`.include`s it is translation-unit global. In an `.import` source unit it is
private to that source unit.

An `@` declaration exports the same symbol from an imported source unit:

```asm
@PORT_LCD_DATA  .equ 0x84
@Colour         .enum Red, Green, Blue

@SharedTable:
        .db 1, 2, 3, 4
```

References omit `@`:

```asm
        ld      a,PORT_LCD_DATA
        ld      hl,SharedTable
```

At root or in a textual include, `@` is accepted even though no module boundary
needs crossing. This lets an importable source unit also assemble directly.

The export marker must work consistently for labels, equates, enums, layout
types, type aliases and ops. For declarations whose name follows a keyword,
the marker remains attached to the name:

```asm
op @callService(service imm8)
        ; ...
end
```

Exporting a declaration exports it as a unit. Enum members and layout fields do
not each require `@`.

## Local Symbols

A declaration beginning with one underscore is local to the nearest preceding
non-local label in the same source ownership unit:

```asm
DrawSprite:
_rowLoop:
        djnz    _rowLoop

SharedTable:
_first:
        .db     1
```

AZM internally qualifies these as `DrawSprite._rowLoop` and
`SharedTable._first`. The same local spelling may be reused under another
non-local owner. A local reference resolves only against its current owner.

Local declarations before any non-local owner are invalid. Local declarations
cannot be exported. Existing identifiers with two leading underscores remain
reserved for AZM-generated implementation symbols and are not user-local
syntax.

Equates, enums, types, aliases and ops do not rebind the owner of a following
local label. Local ownership is label-based. If local forms are later supported
for non-label declarations, they use the same nearest-label owner and
declaration identity model.

An underscore elsewhere in an identifier has no visibility meaning. Constants
such as `PORT_LCD_DATA` remain ordinary non-local declarations.

## Routine Directive

`.routine` declares the next non-local label as an executable routine and a
register-contract analysis boundary:

```asm
.routine in A,HL out carry,zero clobbers B,F preserves DE
CheckTile:
        ; ...
        ret
```

The directive and contract are always one physical line. Clauses are delimited
by their keywords rather than semicolons:

```text
.routine [in carriers] [out outputs] [maybe-out outputs]
         [clobbers carriers] [preserves carriers]
```

Canonical clause order is `in`, `out`, `maybe-out`, `clobbers`, `preserves`.
Carrier grammar remains the same as AZM 0.2 contracts. Named output suffixes
are not part of the AZM 0.3 source grammar; contracts describe register and
flag carriers directly.

Contract clauses are assertions over the inferred routine summary. `in` may
overlap `out` to describe a transformed value. `out` and `clobbers` may not
overlap, because an output is meaningful while a clobber is not. `preserves`
may not overlap `out` or `clobbers`. `maybe-out` is an inference candidate and
may overlap `clobbers` until accepted. AZM diagnoses invalid overlaps after
register-pair and flag expansion.

When a `.routine` line declares any contract clause, AZM also checks that
declaration against the routine's own body-effect summary. A body write that
the declaration lists under `preserves`, or leaves unmentioned (unmentioned
registers are preserved for callers), is a `declaration_contract_mismatch`.
Bare `.routine` has no declared assertions and keeps infer-from-body behaviour.
Annotation writes the complete current inferred contract in canonical order.

A bare directive is an explicit routine with a contract to be inferred:

```asm
.routine
CheckTile:
```

Contract annotation rewrites that directive in place:

```asm
.routine in A,HL out carry clobbers B
CheckTile:
```

The directive must be followed by one unprefixed or exported non-local label in
the same physical file and source ownership unit. Blank lines, ordinary
comments and instruction-attached contract directives may intervene. It cannot
cross an emitted instruction, data declaration, `.end` or end-of-file, and it
cannot target a local label. Flattened items from an imported source unit do not
consume a pending directive in the importer; conditionally excluded text does
not produce source items. Keep `.routine` adjacent to its declaration in source
so those loader details are not observable.

Routine state is maintained independently per source ownership unit. Items from
an interleaved imported unit cannot close or extend a routine in its importer.

The routine owns instructions and local labels until the next non-local label
in the same ownership unit after its first instruction. Consecutive non-local
labels before the first instruction are entry aliases for the same routine. The
first data or storage directive before any instruction makes the declaration an
invalid routine. The next post-instruction non-local label may have its own
`.routine`, or it may be ordinary data. No `.endroutine` directive is required:

```asm
.routine
DrawSprite:
_loop:
        jr      _loop

SharedTable:            ; ends DrawSprite and starts ordinary data
        .db     1, 2, 3, 4
```

A non-local label containing callable code without `.routine` is not a declared
routine. Strict register-contract analysis reports direct `call` and executable
tail-jump targets that are not declared routines. Audit mode may offer a source
action that inserts `.routine` and an inferred contract.

An exported routine combines independent syntax:

```asm
.routine in A out HL
@ReadKey:
        ret
```

`.routine` has no export effect, and `@` has no register-contract effect.

Direct calls and executable tail jumps resolve to declaration identities before
contract lookup. A tail jump is a direct `jp`, `jp cc`, `jr`, or `jr cc` whose
resolved target is a declared routine. Unconditional jumps to unresolved
non-local symbols remain direct boundaries so strict analysis can report the
missing contract. Conditional jumps must resolve to a declared routine or a
target with an explicit interface/profile contract because otherwise they
cannot be distinguished from ordinary conditional control flow.

## Register-Contract Directives

AZM 0.3 emits no semantic `;!` comments. Existing source forms migrate as
follows:

```asm
;! in A; out HL; clobbers BC
@ReadKey:
```

becomes:

```asm
.routine in A out HL clobbers BC
@ReadKey:
```

when `ReadKey` is exported, or:

```asm
.routine in A out HL clobbers BC
ReadKey:
```

when it is source-unit private.

File policy and local suppressions also become directives:

```asm
.contracts strict
.rcignore definite_contract_violation "legacy wrapper preserves the ABI"
```

`.contracts` accepts `strict`, `audit` and `off`. Project-configured policy
globs continue to take precedence according to the documented policy model.
At most one `.contracts` directive may occur in a physical file. It applies to
the whole physical file regardless of position. Precedence is: matching project
policy glob, then source `.contracts`, then CLI fallback mode.

`.rcignore` applies to the next emitted instruction in the same physical file
and consumes one matching finding there. It skips blank lines and ordinary
comments but cannot cross another semantic directive, declaration or physical
file. It requires a finding kind and a quoted non-empty reason. Multiple
findings require multiple suppressions; an unconsumed suppression produces a
stale-suppression diagnostic. Op-expanded findings bind to their effective
call-site instruction. The directive emits no bytes and does not alter symbol
or routine scope.

Caller output confirmation also becomes a directive placed immediately before
the call-site instruction:

```asm
.expectout A,carry
        call    ScanKeys
```

It follows the same physical attachment rules as `.rcignore`. AZM 0.3 does not
emit semantic `; expects out ...` comments.

External `.asmi` interfaces keep their existing line-oriented syntax.

## Compatibility Boundary

This is a breaking source-language revision and must ship as AZM 0.3. Canonical
AZM 0.3 output never writes `;!` contracts and never interprets `@` as a routine
boundary.

AZM 0.3 does not provide a mixed-semantics mode. Source must be migrated before
it is compiled with AZM 0.3, because the assembler must not guess whether an
old `@Name` means a routine boundary or a new export. Recognized legacy `;!`
and `; expects out` forms produce targeted migration diagnostics rather than
becoming inert comments.

## Tooling and Debug Maps

Debug maps retain exported symbols without `@`. Every symbol record carries
declaration identity and visibility. Local symbols use qualified display names,
for example `DrawSprite._loop`; when private owners collide across imported
units, the deterministic display fallback also includes a source-unit
qualifier. Breakpoints and source lookup continue to use declaration identity,
source span and bank identity, not display-name spelling.

Register-contract reports list only `.routine` declarations. Data labels,
exported constants and exported ops do not become empty routines.

Syntax highlighting must render:

- `.routine`, `.contracts` and `.rcignore` as directives;
- the label following `.routine` as a routine declaration;
- `@Name` declarations as exports;
- `_name` declarations and references as locals;
- register-contract clause keywords distinctly from Z80 opcodes.
