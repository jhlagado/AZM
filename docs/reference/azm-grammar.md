---
layout: default
title: 'AZM Grammar Reference'
nav_order: 92
---

# AZM Grammar Reference

This document describes the grammar implemented by the current AZM parser. It
is an implementation reference, not a tutorial. The TypeScript parser and tests
remain the final source of truth when behavior changes.

Code paths audited for this reference:

- `src/node/source-host.ts`
- `src/source/*.ts`
- `src/core/compile.ts`
- `src/core/conditional-assembly.ts`
- `src/syntax/*.ts`
- `src/expansion/*.ts`
- `src/z80/parse-*.ts`

## Notation

The grammar below uses EBNF-like notation:

```text
*      zero or more
+      one or more
?      optional
|      alternative
"..."  literal text
```

Whitespace between tokens is generally insignificant except where a production
explicitly requires separation. Comments are removed before most parsing.

## Lexical Rules

```text
newline        ::= "\n" | "\r\n" | "\r"
space          ::= " " | "\t" | other JavaScript whitespace
comment        ::= ";" comment-text
quoted-string  ::= '"' string-char* '"'
quoted-byte    ::= "'" byte-char "'" | '"' byte-char '"'
identifier     ::= [A-Za-z_] [A-Za-z0-9_]*
symbol-name    ::= [A-Za-z_.$?] [A-Za-z0-9_.$?]*
entry-label    ::= "@"? symbol-name
```

Comments begin at the first semicolon that is not inside a single- or
double-quoted string. `AF'` is treated as a register token, not as the start of a
quoted string.

Single-character quoted values are accepted as numeric byte expressions in
expression contexts. Multi-character string fragments are accepted only where a
directive expects string data.

Escaped byte characters accepted in quoted byte expressions:

```text
\0 \n \r \t \' \" \\
```

## File Loading

The loader accepts `.asm` and `.z80` entry files.

```text
source-file     ::= logical-line*
load-directive  ::= include-directive | import-directive
include-directive ::= include-head quoted-string
include-head      ::= ".include" | "include"  ; case-insensitive
import-directive  ::= ".import" quoted-string
```

`.include` inlines the target file each time it appears. `.import` inlines the
target file once per compilation and assigns the imported file its own source
unit. Recursive include/import chains are rejected.

Source-load directives are recognized before ordinary line parsing. They must
occupy their physical line apart from whitespace and comments.

## Parse Pipeline

AZM does not parse a file with one monolithic grammar. The pipeline applies
these layers in order:

1. Source loading expands `.include` and `.import`.
2. Conditional assembly removes inactive regions.
3. `op` declarations are collected.
4. Layout declarations are parsed as whole blocks.
5. Top-level `op` invocations are expanded.
6. Chained instruction lines are split and parsed segment by segment.
7. Remaining single lines are parsed as labels, directives, declarations or
   instructions.

## Conditional Assembly

```text
conditional-line ::= if-line | else-line | endif-line
if-line          ::= ".if" expression
else-line        ::= ".else"
endif-line       ::= ".endif"
```

Conditional directives are lowercase dotted directives. They are evaluated
before ordinary parsing. `.if` expressions may refer to earlier `.equ` constants
that are not location-dependent. `$` is not available during conditional
assembly.

## Logical Lines

After comment stripping and alias normalization, a normal logical line has one
of these forms:

```text
logical-line       ::= blank-line
                     | comment-only-line
                     | label-only-line
                     | label-statement-line
                     | statement-line
                     | chained-instruction-line

label-only-line    ::= entry-label ":"
label-statement-line ::= entry-label ":" statement
statement-line     ::= statement
```

`@Name:` and `Name:` both define address labels. The `@` prefix is not part of
the symbol name stored by the assembler; it marks an entry/public label and a
register-contract boundary.

## Chained Instruction Lines

AZM normally uses one statement per physical line. A physical line may contain
multiple instruction or `op` invocation segments separated by a spaced
backslash.

```text
chained-instruction-line ::= first-chain-segment chain-separator chain-segment
                             (chain-separator chain-segment)* comment?

chain-separator          ::= space+ "\\" space+
first-chain-segment      ::= entry-label ":" instruction-or-op
                           | instruction-or-op
chain-segment            ::= instruction-or-op
instruction-or-op        ::= z80-instruction | op-invocation
```

Examples:

```asm
Loop:   ld      a,(hl) \ inc hl \ djnz Loop
        clear_a \ ret
```

Rules:

- Backslashes inside quoted strings or quoted byte values do not split the line.
- `;` still starts a comment and terminates the physical line.
- Empty segments are rejected.
- A label is allowed only before the first segment.
- Directives and declarations are rejected anywhere on a chained line.
- Chained instruction syntax is also accepted inside `op` bodies.

Rejected examples:

```asm
        .org $8000 \ ld a,0
        ld a,0 \ .db 1
        ld a,b \ Next: inc a
Loop:   \ inc a
        ld a,b \
```

## Statements

```text
statement          ::= declaration
                     | directive
                     | layout-header
                     | instruction
                     | op-invocation
```

The parser tries directive/declaration forms before Z80 instruction parsing in
single-line parsing. In chained parsing it accepts only instructions and `op`
invocations.

## Declarations

```text
equ-declaration    ::= symbol-name colon? ".equ" expression-or-string
enum-declaration   ::= identifier colon? ".enum" enum-member-list
type-alias         ::= identifier colon? ".typealias" type-expr

enum-member-list   ::= identifier ("," identifier)*
```

The optional colon in these declaration forms is accepted for compatibility with
older source style. Canonical AZM style omits the colon.

Examples:

```asm
COUNT       .equ 8
SPACE:      .equ " "
Colour      .enum Red, Green, Blue
SpriteArray .typealias Sprite[16]
```

`.equ` accepts a numeric expression. A whole quoted string with more than one
character is retained as a string constant for data emission.

## Directives

```text
directive          ::= org-directive
                     | data-directive
                     | storage-directive
                     | align-directive
                     | end-directive
                     | binary-range-directive
                     | string-directive

org-directive      ::= ".org" expression
data-directive     ::= ".db" data-list
                     | ".dw" expression-list
storage-directive  ::= ".ds" ds-size ("," expression)?
align-directive    ::= ".align" expression
end-directive      ::= ".end"
binary-range-directive ::= ".binfrom" expression
                         | ".binto" expression
string-directive   ::= ".cstr" quoted-string
                     | ".pstr" quoted-string
                     | ".istr" quoted-string

data-list          ::= data-value ("," data-value)*
data-value         ::= expression | string-fragment
expression-list    ::= expression ("," expression)*
ds-size            ::= expression | type-expr
string-fragment    ::= quoted-string | "'" string-char* "'"
```

`.db` may contain numeric expressions and string fragments. `.dw` contains only
expressions. `.ds` accepts a byte count expression or a type expression, plus an
optional fill expression.

String directives require one double-quoted string argument. `.db` string
fragments may use single or double quotes.

## Layout Declarations

```text
layout-declaration ::= record-declaration | union-declaration

record-declaration ::= identifier colon? ".type" newline
                       layout-field*
                       ".endtype"

union-declaration  ::= identifier colon? ".union" newline
                       layout-field*
                       ".endunion"

layout-field       ::= identifier ".byte"
                     | identifier ".word"
                     | identifier ".addr"
                     | identifier ".field" field-type

field-type         ::= unsigned-decimal
                     | "byte"
                     | "word"
                     | "addr"
                     | type-expr
```

Old prefix headers such as `.type Sprite` and `.union Value` are rejected with a
diagnostic that points to the name-left form.

## Type Expressions

```text
type-expr          ::= identifier array-suffix?
array-suffix       ::= "[" unsigned-decimal "]"
```

Examples:

```asm
Sprite
Sprite[16]
byte
word
addr
```

`type-expr` is used by `.typealias`, `.ds`, `sizeof`, `offset`, layout fields
and layout casts.

## Expressions

```text
expression         ::= binary-expression
binary-expression  ::= unary-expression (binary-operator unary-expression)*
unary-expression   ::= unary-operator unary-expression
                     | primary
primary            ::= number
                     | quoted-byte
                     | symbol-reference
                     | "$"
                     | "(" expression ")"
                     | byte-function
                     | layout-function
                     | layout-cast

unary-operator     ::= "+" | "-" | "~"
binary-operator    ::= "|" | "^" | "&" | "<<" | ">>" | "+" | "-" | "*" | "/" | "%"
```

Binary precedence, from lowest to highest:

```text
|  ^  &  << >>  + -  * / %
```

Binary operators are left-associative. Unary `+`, unary `-` and bitwise `~`
bind as primary expressions.

Number forms:

```text
decimal            ::= [0-9]+
hex-prefix         ::= "$" [0-9A-Fa-f]+ | "0x" [0-9A-Fa-f]+
hex-suffix         ::= [0-9] [0-9A-Fa-f]* [Hh]
binary-prefix      ::= "%" [01]+ | "0b" [01]+
binary-suffix      ::= [01]+ [Bb]
current-location   ::= "$"
```

Function and layout terms:

```text
byte-function      ::= "LSB" "(" expression ")"
                     | "MSB" "(" expression ")"

layout-function    ::= "sizeof" "(" type-expr ")"
                     | "offset" "(" type-expr "," offset-path ")"

offset-path        ::= offset-part ("." offset-part)*
offset-part        ::= identifier | "[" unsigned-decimal "]"

layout-cast        ::= "<" type-expr ">" layout-base layout-path
layout-base        ::= symbol-reference
layout-path        ::= layout-part+
layout-part        ::= "." identifier | "[" expression "]"
```

`LSB` and `MSB` are uppercase AZM functions. `sizeof` and `offset` are lowercase
AZM functions.

## Z80 Instructions

Instruction mnemonics and registers are case-insensitive. Operand lists are
split on commas that are not inside parentheses or quotes.

The instruction parser supports the Z80 instruction families represented by
`src/z80/parse-*.ts`, including:

```text
no-operand         ::= nop | ccf | cpl | daa | di | ei | exx | halt
                    | neg | reti | retn | rla | rlca | rra | rrca
                    | rld | rrd | scf
                    | ldi | ldir | ldd | lddr | cpi | cpir | cpd | cpdr
                    | ini | inir | ind | indr | outi | otir | outd | otdr
return             ::= ret | ret condition
branch             ::= jp expression
                    | jp condition "," expression
                    | jp "(" ( "hl" | "ix" | "iy" ) ")"
                    | jr expression
                    | jr condition "," expression
                    | djnz expression
call               ::= call expression
                    | call condition "," expression
rst                ::= rst expression
load               ::= ld operand "," operand
stack              ::= push stack-register | pop stack-register
inc-dec            ::= inc operand | dec operand
alu                ::= add operand "," operand
                    | adc operand "," operand
                    | sbc operand "," operand
                    | sub operand
                    | and operand
                    | or operand
                    | xor operand
                    | cp operand
                    | sub "a" "," operand
                    | and "a" "," operand
                    | or  "a" "," operand
                    | xor "a" "," operand
                    | cp  "a" "," operand
bit                ::= bit bit-index "," cb-operand
                    | res bit-index "," cb-operand
                    | set bit-index "," cb-operand
                    | res bit-index "," indexed-operand "," reg8
                    | set bit-index "," indexed-operand "," reg8
rotate-shift       ::= rlc cb-operand | rrc cb-operand | rl cb-operand
                    | rr cb-operand | sla cb-operand | sra cb-operand
                    | sll cb-operand | sls cb-operand | srl cb-operand
                    | rotate-shift indexed-operand "," reg8
exchange           ::= ex forms parsed by src/z80/parse-exchange.ts
io                 ::= in forms parsed by src/z80/parse-io-control.ts
                    | out forms parsed by src/z80/parse-io-control.ts
im                 ::= im expression
```

This document does not duplicate every legal `ld`, `in`, `out` and `ex` operand
combination. Those are maintained in the Z80 parser and encoder tests.

## Ops

```text
op-declaration     ::= "op" op-name "(" op-params? ")" newline
                       op-body-line*
                       "end"

op-params          ::= op-param ("," op-param)*
op-param           ::= identifier op-matcher
op-matcher         ::= "reg8" | "reg16" | "imm8" | "imm16"
                     | "cc" | "idx16" | "ea" | "mem8" | "mem16"
                     | fixed-token

op-body-line       ::= blank-line
                     | comment-only-line
                     | instruction-template
                     | source-statement
                     | chained-instruction-line

op-invocation      ::= op-name op-operand-list?
op-operand-list    ::= op-operand ("," op-operand)*
```

`op` headers and `end` are case-insensitive. Op invocation names are parsed as
identifier heads; nested template instruction names are currently normalized to
lowercase.

Op operands are parsed as registers, `(hl)`, indexed operands, parenthesized
absolute memory expressions, or immediate expressions.

## Directive Aliases

Directive aliases are a compatibility layer, not additional grammar in the
canonical language. Alias normalization happens before ordinary single-line
parsing.

Built-in aliases include:

```text
ALIGN   -> .align
BINFROM -> .binfrom
BINTO   -> .binto
CSTR    -> .cstr
DB      -> .db
DS      -> .ds
DW      -> .dw
END     -> .end
EQU     -> .equ
INCLUDE -> .include
ISTR    -> .istr
ORG     -> .org
PSTR    -> .pstr
```

Project alias files may add non-reserved directive heads. Alias keys may not
collide with baseline directive aliases, Z80 instruction heads or AZM language
keywords.

Aliases normalize only directive heads. They do not rename labels, constants,
instruction mnemonics, op names or expression functions.

## Register Contract Comments

Register contract lines are comments at the assembler grammar level. They are
recognized later by the register-contract subsystem.

```text
contract-line      ::= ";!" contract-clause (";" contract-clause)*
contract-clause    ::= contract-key register-list
contract-key       ::= "in" | "out" | "maybe-out" | "clobbers" | ...
```

The multiline historical form is still read, but generated contracts use the
compact semicolon-separated form.

## Unsupported or Deliberately Rejected Forms

The current parser deliberately rejects:

- Multiple ordinary statements separated by semicolons.
- Directives or declarations in chained instruction lines.
- Labels after the first segment of a chained instruction line.
- Prefix layout headers such as `.type Sprite`.
- Uppercase conditional directives such as `.IF`.
- Text macros.

Leading-dot labels such as `.loop:` are accepted by the current parser as
ordinary globally visible labels, not as scoped local labels.
