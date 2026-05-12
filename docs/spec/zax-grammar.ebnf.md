# ZAX Grammar (EBNF Companion)

This file provides a single syntax-oriented grammar reference for ZAX.

Authority note:

- `docs/spec/zax-spec.md` remains the sole normative language authority.
- If this grammar and the spec ever diverge, `docs/spec/zax-spec.md` wins.

## 1. Lexical

```ebnf
identifier      = letter , { letter | digit | "_" } ;
letter          = "A".."Z" | "a".."z" | "_" ;
digit           = "0".."9" ;

int_dec         = [ "-" ] , digit , { digit } ;
int_hex         = "$" , hex_digit , { hex_digit } ;
hex_digit       = digit | "A".."F" | "a".."f" ;

string_lit      = '"' , { any_char_except_quote } , '"' ;
char_lit        = "'" , char_body , "'" ;
char_body       = any_char_except_quote | escape_seq ;
escape_seq      = "\\" , ( escape_simple | "x" , hex_digit , hex_digit ) ;
newline         = "\n" ;
```

Lexical normalization notes:

- In instruction streams, a visible backslash separator (`\` followed by whitespace) is normalized to a newline-equivalent statement separator before parsing.
- This companion grammar writes those boundaries as `newline` for readability.
- `include "path"` is a pre-parse text-insertion directive. It is not modeled as an ordinary production in this grammar because it is expanded before parsing.

Generated parser-atom note:

- The block below is generated from `src/frontend/grammarData.ts`.
- It documents parser-level atom syntax only; semantic restrictions still live in `docs/spec/zax-spec.md`.
- Parser recovery behavior remains implementation-defined by the hand-written parser.

<!-- BEGIN GENERATED: grammar-atoms -->
```ebnf
(* Generated from src/frontend/grammarData.ts. Re-run node scripts/generate-grammar-atoms.mjs. *)
top_level_keyword       = "func" | "const" | "enum" | "data" | "import" | "type" | "union"
                        | "globals" | "var" | "extern" | "bin" | "hex" | "op" | "section"
                        | "align" ;

asm_control_keyword     = "if" | "else" | "end" | "while" | "repeat" | "until" | "break"
                        | "continue" | "select" | "case" ;
condition_code          = "z" | "nz" | "c" | "nc" | "pe" | "po" | "m" | "p" ;

named_section_kind      = "code" | "data" ;
legacy_section_kind     = named_section_kind | "var" ;

scalar_type             = "byte" | "word" | "addr" ;
return_reg              = "HL" | "DE" | "BC" | "AF" ;

reg8                    = "A" | "B" | "C" | "D" | "E" | "H" | "L" ;
reg8_extended           = "IXH" | "IXL" | "IYH" | "IYL" | "I" | "R" ;
reg16                   = "HL" | "DE" | "BC" | "SP" | "IX" | "IY" ;
reg16_special           = "AF" ;
reg16_shadow            = "AF'" ;
register_name           = reg8 | reg8_extended | reg16 | reg16_special | reg16_shadow ;
assignment_reg          = "A" | "B" | "C" | "D" | "E" | "H" | "L" | "IXH" | "IXL" | "IYH"
                        | "IYL" | "BC" | "DE" | "HL" | "IX" | "IY" ;
move_reg_atom           = "A" | "B" | "C" | "D" | "E" | "H" | "L" | "HL" | "DE" | "BC" | "SP"
                        | "IX" | "IY" | "AF" | "IXH" | "IXL" | "IYH" | "IYL" ;
index_reg16             = "HL" | "DE" | "BC" ;
typed_reinterpret_base_reg= "HL" | "DE" | "BC" | "IX" | "IY" ;
index_mem_base_reg      = "IX" | "IY" ;

matcher_type_symbolic   = "reg8" | "reg16" | "idx16" | "cc" | "imm8" | "imm16" | "ea" | "mem8"
                        | "mem16" ;

imm_unary_op            = "+" | "-" | "~" ;
imm_mul_op              = "*" | "/" | "%" ;
imm_add_op              = "+" | "-" ;
imm_shift_op            = "<<" | ">>" ;
imm_and_op              = "&" ;
imm_xor_op              = "^" ;
imm_or_op               = "|" ;

escape_simple           = "n" | "r" | "t" | "0" | "\\" | "'" | "\"" ;
```
<!-- END GENERATED: grammar-atoms -->

## 2. Module Structure

```ebnf
module          = { module_item } ;

module_item     = import_decl
                | named_section_decl
                | align_decl
                | const_decl
                | enum_decl
                | type_decl
                | union_decl
                | bin_decl
                | hex_decl
                | extern_block
                | func_decl
                | op_decl ;

import_decl     = "import" , ( identifier | string_lit ) ;
named_section_decl = "section" , section_kind , identifier ,
                     [ "at" , imm_expr , [ ( "size" , imm_expr ) | ( "end" , imm_expr ) ] ] ,
                     newline , { section_item } , "end" ;
section_item    = const_decl
                | enum_decl
                | type_decl
                | union_decl
                | data_section_block
                | data_decl
                | raw_data_decl
                | bin_decl
                | hex_decl
                | extern_block
                | func_decl
                | op_decl ;
section_kind    = named_section_kind ;
align_decl      = "align" , imm_expr ;
```

## 3. Types and Declarations

```ebnf
const_decl      = [ "export" ] , "const" , identifier , "=" , imm_expr ;

enum_decl       = [ "export" ] , "enum" , identifier , enum_member , { "," , enum_member } ;
enum_member     = identifier ;

type_decl       = [ "export" ] , "type" , identifier , type_body ;
union_decl      = [ "export" ] , "union" , identifier , field_block ;

type_body       = type_expr
                | field_block ;

field_block     = newline , field_decl , { newline , field_decl } , newline , "end" ;
field_decl      = identifier , ":" , type_expr ;

type_expr       = scalar_type
                | type_name
                | type_expr , "[" , [ imm_expr ] , "]" ;

type_name       = identifier , { "." , identifier } ;

```

## 4. Storage Declarations

```ebnf
data_section_block = "data" , newline , data_decl , { newline , data_decl } ;
data_decl          = identifier , ":" , type_expr , [ "=" , data_init_expr ] ;

raw_label       = identifier , ":" ;
raw_data_decl   = raw_label , [ newline ] , raw_directive ;
raw_directive   = "db" , raw_db_list
                | "dw" , raw_dw_list
                | "ds" , imm_expr ;
raw_db_list     = raw_db_item , { "," , raw_db_item } ;
raw_db_item     = imm_expr | string_lit ;
raw_dw_list     = imm_expr , { "," , imm_expr } ;

bin_decl        = "bin" , identifier , "in" , section_kind , "from" , string_lit ;
hex_decl        = "hex" , identifier , "from" , string_lit ;
```

## 5. Functions and Ops

```ebnf
func_decl       = [ "export" ] , "func" , identifier , "(" , [ param_list ] , ")" ,
                  [ ":" , ret_regs ] , newline , [ local_var_block ] , instr_stream , "end" ;

ret_regs        = return_reg , { "," , return_reg } ;
param_list      = param , { "," , param } ;
param           = identifier , ":" , type_expr ;

local_var_block = "var" , newline , local_decl , { newline , local_decl } , newline , "end" ;

local_decl      = identifier , ":" , type_expr                              (* local scalar decl *)
                | identifier , ":" , type_expr , "=" , value_init_expr      (* local scalar value-init *)
                | identifier , "=" , rhs_alias_expr ;                        (* local alias-init to direct module-scope storage *)

op_decl         = "op" , identifier , [ "(" , [ op_param_list ] , ")" ] ,
                  newline , instr_stream , "end" ;

op_param_list   = op_param , { "," , op_param } ;
op_param        = identifier , ":" , matcher_type ;

matcher_type    = matcher_type_symbolic
                | "A" | "HL" | "DE" | "BC" | "SP" ;
```

## 6. Instruction Stream and Structured Control

```ebnf
instr_stream    = { instr_line } ;

instr_line      = step_stmt
                | z80_instruction
                | assign_stmt
                | move_stmt
                | op_invoke
                | func_call
                | if_stmt
                | while_stmt
                | repeat_stmt
                | select_stmt
                | asm_label
                | local_jump ;

assign_stmt     = assign_target , ":=" , assign_source ;
assign_target   = assignment_reg | ea_expr ;
assign_source   = assignment_reg | ea_expr | move_addr | imm_expr ;

step_stmt       = "step" , ea_expr , [ "," , imm_expr ] ;

move_stmt       = "move" , move_reg_atom , "," , move_src
                | "move" , move_path , "," , move_reg_atom ;
move_src        = move_addr | move_path ;
move_path       = ea_expr ;
move_addr       = "@" , ea_expr ;  (* move_addr is only valid as the source operand in v1 *)

if_stmt         = "if" , condition_code , newline , instr_stream ,
                  [ "else" , newline , instr_stream ] , "end" ;

while_stmt      = "while" , condition_code , newline , instr_stream , "end" ;

repeat_stmt     = "repeat" , newline , instr_stream , "until" , condition_code ;

select_stmt     = "select" , select_expr , newline ,
                  case_clause , { case_clause } , [ else_clause ] , "end" ;

case_clause     = "case" , case_item , { "," , case_item } , newline , instr_stream ;
case_item       = imm_expr | imm_expr , ".." , imm_expr ;
else_clause     = "else" , newline , instr_stream ;

asm_label       = [ "." ] , identifier , ":" ;
local_jump      = ( "jp" | "jr" | "djnz" ) , "." , identifier ;
```

## 7. Expressions

```ebnf
imm_expr        = imm_or ;
imm_or          = imm_xor , { imm_or_op , imm_xor } ;
imm_xor         = imm_and , { imm_xor_op , imm_and } ;
imm_and         = imm_shift , { imm_and_op , imm_shift } ;
imm_shift       = imm_add , { imm_shift_op , imm_add } ;
imm_add         = imm_mul , { imm_add_op , imm_mul } ;
imm_mul         = imm_unary , { imm_mul_op , imm_unary } ;
imm_unary       = [ imm_unary_op ] , imm_primary ;
imm_primary     = int_dec | int_hex | char_lit | imm_name | "(" , imm_expr , ")"
                | "sizeof" , "(" , type_expr , ")"
                | "offsetof" , "(" , type_expr , "," , field_path , ")" ;

imm_name        = identifier , { "." , identifier } ;

field_path      = identifier , { "." , identifier | "[" , imm_expr , "]" } ;

ea_expr         = ea_term , { ( "+" | "-" ) , imm_expr } ;
ea_term         = ea_base , { ea_segment }
                | typed_reinterpret_expr ;
ea_base         = identifier | "(" , ea_expr , ")" ;
ea_segment      = "." , identifier | "[" , ea_index , "]" ;
typed_reinterpret_expr = "<" , type_expr , ">" , reinterpret_base , ea_segment , { ea_segment } ;
reinterpret_base = reinterpret_reg
                 | reinterpret_name
                 | "(" , reinterpret_addr_expr , ")" ;
reinterpret_addr_expr = reinterpret_atom , ( "+" | "-" ) , imm_expr ;
reinterpret_atom = reinterpret_reg | reinterpret_name ;
reinterpret_reg  = typed_reinterpret_base_reg ;
reinterpret_name = identifier ;
ea_index        = imm_expr | reg8 | index_reg16 | "(" , "HL" , ")" | "(" , index_mem_base_reg , [ ( "+" | "-" ) , imm_expr ] , ")" | ea_expr ;

value_init_expr = imm_expr | "0" ;
rhs_alias_expr  = ea_expr ;
data_init_expr  = string_lit | aggregate_init | imm_expr ;
aggregate_init  = "{" , [ init_item , { "," , init_item } ] , "}" ;
init_item       = imm_expr | aggregate_init ;

```

## 8. Known Current Constraints (Semantic)

These are semantic constraints enforced beyond pure grammar:

- Typed alias form is invalid in function-local `var`:
  - `name: Type = rhsAlias`
- `import` remains module-scope only. It is not valid inside a named section.
- Variable declarations inside a `code` named section are a compile error.
- Local non-scalar value-init declarations are invalid.
- Local non-scalar declarations are alias-only (`name = GlobalStorageName`).
- In function-local `var`, the alias RHS must be a direct module-scope storage name.
- Function-local aliases may not target parameters, locals, aliases, field paths, indexed paths, constants, or labels.
- `@path` is not a general expression operator. In v1 it is accepted only on the source side of `rr := @path` (with transitional `move rr, @path` still supported).
- Raw data directives (`db`/`dw`/`ds`) and `raw_label` are only valid inside `section data` blocks.
- A `raw_label` must be followed by a raw directive; it cannot stand alone.
- In `step_stmt`, the first operand must semantically denote typed scalar storage (`byte` or `word`), not a raw register or non-scalar path.
- In `step_stmt`, the optional amount must be a compile-time integer expression.
- Typed-path `step` forms are not currently supported inside `op` bodies.
- Typed reinterpretation requires at least one tail segment after the cast head.
- `reinterpret_name` is limited semantically to scalar names of type `word` or `addr`.
- Bare aggregate storage names are not valid reinterpret bases.
- Raw instruction name resolution is semantic, not purely syntactic:
  - module-scope storage names behave as raw labels in raw Z80 instruction operands
  - scalar function args/locals may act as symbolic IX-relative slot offsets in raw instruction operands/immediates
  - non-scalar parameters do not participate in that raw IX-offset form
  - legal function-local aliases denote module-scope storage in raw instruction contexts; they do not denote frame slots

## 9. Maintenance Rule

When parser grammar changes land:

1. Update this file in the same PR.
2. Update `docs/spec/zax-spec.md` if behavior changed.
3. Include at least one positive and one negative parser/semantic test for the changed production.
