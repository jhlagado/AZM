# Stage 5 Evidence: Z80 Instruction Parser and Encoder

Status: active evidence pack

This document records the AZM evidence used before implementing the first Z80
instruction parser/encoder foundation in AZM Next. It follows
`source-of-truth.md`: tests and fixtures first, then docs and book examples.

## Evidence Read

- `test/backend/pr24_isa_core.test.ts`
- `test/backend/pr56_isa_misc.test.ts`
- `test/backend/pr57_isa_im_rst.test.ts`
- `test/backend/pr1349_ld_a_indirect_hl_regression.test.ts`
- `test/backend/pr477_encode_control_family.test.ts`
- `test/backend/pr477_encode_ld_family.test.ts`
- `test/backend/pr477_encode_alu_family.test.ts`
- `test/backend/pr477_encode_core_ops_family.test.ts`
- `test/backend/pr477_encode_io_family.test.ts`
- `test/backend/pr468_encoder_dispatch_integration.test.ts`
- `test/fixtures/pr24_isa_core.asm`
- `test/fixtures/pr24_rel8_backward.asm`
- `test/fixtures/pr37_forward_label_call.asm`
- `test/fixtures/pr56_isa_misc.asm`
- `test/fixtures/pr57_isa_im_rst.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

## Proven Instruction Surface

Current AZM tests and docs prove a broad retained classic Z80 surface:

- control flow: `JP`, conditional `JP`, indirect `JP`, `JR`, conditional `JR`,
  `DJNZ`, `CALL`, conditional `CALL`, `RET`, conditional `RET`, `RST`
- loads: register/register, register/immediate, register indirect, indexed
  indirect, absolute memory, `A` with `(BC)` / `(DE)`, `SP <- HL/IX/IY`, block
  transfer forms
- arithmetic and logic: `ADD`, `ADC`, `SUB`, `SBC`, `AND`, `OR`, `XOR`, `CP`
- core ops: `INC`, `DEC`, `PUSH`, `POP`, `EX`, `EXX`, `HALT`
- bit/rotate/shift: `BIT`, `RES`, `SET`, `RLC`, `RL`, `RRC`, `RR`, `SLA`,
  `SRA`, `SRL`, plus classic undocumented `SLL` / `SLS`
- I/O and interrupt state: `IN`, `OUT`, `IM`, `DI`, `EI`, `RETI`, `RETN`
- block operations: `LDI`, `LDIR`, `LDD`, `LDDR`, `CPI`, `CPIR`, `CPD`,
  `CPDR`, `INI`, `INIR`, `IND`, `INDR`, `OUTI`, `OTIR`, `OUTD`, `OTDR`

The AZM book appendices classify the same surface as classic Z80 support, with
documented prefix families and selected undocumented-but-classic forms.

## Proven Encodings for First Slices

Current backend tests prove these representative encodings:

- `nop` -> `00`
- `ret` -> `C9`
- `ld a,n` -> `3E nn`
- `ld b,2` -> `06 02`
- `ld bc,1234H` -> `01 34 12`
- `ld (hl),a` -> `77`
- `ld a,(hl)` -> `7E`
- `ld a,(bc)` -> `0A`
- `ld a,(de)` -> `1A`
- `ld (bc),a` -> `02`
- `ld (de),a` -> `12`
- `call 1234H` -> `CD 34 12`
- `jr nz,-2` -> `20 FE`
- `djnz` backward by two bytes -> `10 FE`
- `jp (ix)` -> `DD E9`
- `add a,b` -> `80`
- `add a,(hl)`, `add a,$7F` compile cleanly
- `add hl,bc`, `add hl,de`, `add hl,hl`, `add hl,sp` compile cleanly
- `adc a,c`, `adc a,(hl)`, `adc a,$01` compile cleanly
- `adc hl,bc`, `adc hl,de`, `adc hl,hl`, `adc hl,sp` compile cleanly
- `sub a,b` -> `90`
- `sub 1` -> `D6 01`
- `sbc a,e`, `sbc a,(hl)`, `sbc a,$03` compile cleanly
- `sbc hl,bc`, `sbc hl,de`, `sbc hl,hl`, `sbc hl,sp` compile cleanly
- `and $F0` -> `E6 F0`
- `or a` -> `B7`
- `xor $55` -> `EE 55`
- `cp (hl)` -> `BE`
- `sub d`, `sub (hl)`, `sub $02` compile cleanly
- `and h`, `and (hl)`, `and $F0` compile cleanly
- `or l`, `or (hl)`, `or $0F` compile cleanly
- `xor a`, `xor (hl)`, `xor $55` compile cleanly
- `cp b`, `cp (hl)`, `cp $10` compile cleanly
- `di`, `ei`, `scf`, `ccf`, `cpl`, `ex de,hl`, `ex (sp),hl`, `exx`, `halt`
  -> `F3 FB 37 3F 2F EB E3 D9 76`
- `im 1`, `rst 0`, `rst 8`, `rst 56`, `reti`, `retn` ->
  `ED 56 C7 CF FF ED 4D ED 45`

## First Implemented Slice

The first Stage 5 implementation slice is intentionally smaller than the
proven full surface. It creates a pure `next/src/z80` parser/encoder foundation
for the instruction forms already accepted by the minimal assembler and proven
by current fixtures:

- `NOP`
- `RET`
- `LD A,n`
- `JP nn`
- `CALL nn`
- `JR target`
- `JR NZ/Z/NC/C,target`
- `DJNZ target`

The pure Z80 encoder emits byte-template fragments only. It does not resolve
symbols, evaluate expressions, create assembler diagnostics, or patch fixups.
Those remain assembly responsibilities.

Future Stage 5 slices should add one instruction family at a time from the
proven surface above, with source-level and pure-encoder tests for each family.

## LD Slice

Additional LD evidence read for the LD slice:

- `test/backend/pr477_encode_ld_family.test.ts`
- `test/backend/pr1349_ld_a_indirect_hl_regression.test.ts`
- `test/fixtures/pr1349_ld_a_indirect_hl.asm`
- `test/fixtures/pr1349_ld_a_indirect_bc.asm`
- `test/fixtures/pr1349_ld_a_indirect_de.asm`
- `test/fixtures/pr1349_ld_indirect_bc_store.asm`
- `test/fixtures/pr1349_ld_indirect_de_store.asm`
- `test/fixtures/pr24_isa_core.asm`

The first LD slice implements only:

- 8-bit register immediate: `ld r,n`
- 8-bit register/register: `ld r,r`
- 16-bit register-pair immediate for `BC`, `DE`, `HL`, and `SP`: `ld rr,nn`
- register indirect with `(HL)`: `ld r,(hl)` and `ld (hl),r`
- accumulator-only register indirect with `(BC)` and `(DE)`: `ld a,(bc)`,
  `ld a,(de)`, `ld (bc),a`, and `ld (de),a`

It intentionally does not yet implement indexed `IX/IY`, absolute memory,
`SP <- HL/IX/IY`, `I/R` transfers, block forms, half-index-register forms, or
diagnostic parity for invalid LD forms. Those remain future evidence slices.

## ALU Slice

Additional ALU evidence read for this slice:

- `test/backend/pr24_isa_core.test.ts`
- `test/backend/pr123_isa_alu_a_core.test.ts`
- `test/backend/pr477_encode_alu_family.test.ts`
- `test/fixtures/pr24_isa_core.asm`
- `test/fixtures/pr123_isa_alu_a_core.asm`
- `test/fixtures/pr123_isa_alu_a_core_invalid.asm`

The first ALU slice implements only the accumulator-style base forms proven by
those tests and fixtures:

- `sub r`, `sub n`, `sub (hl)`, plus explicit `sub a,r/n/(hl)`
- `and r`, `and n`, `and (hl)`, plus explicit `and a,r/n/(hl)`
- `or r`, `or n`, `or (hl)`, plus explicit `or a,r/n/(hl)`
- `xor r`, `xor n`, `xor (hl)`, plus explicit `xor a,r/n/(hl)`
- `cp r`, `cp n`, `cp (hl)`, plus explicit `cp a,r/n/(hl)`

It intentionally does not yet implement `ADD`, `ADC`, `SBC`, indexed
`IX/IY+d` ALU operands, half-index-register operands, or full current-AZM
diagnostic parity for invalid ALU forms.

## ADD/ADC/SBC Accumulator Slice

Additional evidence read for this slice:

- `test/backend/pr123_isa_alu_a_core.test.ts`
- `test/backend/pr477_encode_alu_family.test.ts`
- `test/backend/pr468_encoder_dispatch_integration.test.ts`
- `test/fixtures/pr123_isa_alu_a_core.asm`
- `test/fixtures/pr123_isa_alu_a_core_invalid.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

The first ADD/ADC/SBC slice implements only the explicit accumulator forms
proven by PR123 and representative encoder tests:

- `add a,r`, `add a,n`, `add a,(hl)`
- `adc a,r`, `adc a,n`, `adc a,(hl)`
- `sbc a,r`, `sbc a,n`, `sbc a,(hl)`

It intentionally does not yet implement `ADD HL,ss`, `ADD IX/IY,pp`,
`ADC HL,ss`, `SBC HL,ss`, indexed `IX/IY+d` ALU operands, or half-index
register operands.

## 16-bit HL Arithmetic Slice

Additional evidence read for this slice:

- `test/backend/pr91_isa_hl16_adc_sbc.test.ts`
- `test/backend/pr477_encode_alu_family.test.ts`
- `test/fixtures/pr91_isa_hl16_adc_sbc.asm`
- `test/fixtures/pr91_isa_hl16_adc_sbc_invalid.asm`
- `test/fixtures/pr202_add_diag_matrix_invalid.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

The first 16-bit arithmetic slice implements only the `HL` register-pair forms
proved by the current tests and book tables:

- `add hl,bc`, `add hl,de`, `add hl,hl`, `add hl,sp`
- `adc hl,bc`, `adc hl,de`, `adc hl,hl`, `adc hl,sp`
- `sbc hl,bc`, `sbc hl,de`, `sbc hl,hl`, `sbc hl,sp`

It intentionally does not yet implement `ADD IX/IY,pp`, indexed ALU operands,
or half-index-register operands.

## Core Ops Slice

Additional evidence read for this slice:

- `test/backend/pr56_isa_misc.test.ts`
- `test/backend/pr131_isa_zero_operand_core_diag.test.ts`
- `test/backend/pr477_encode_core_ops_family.test.ts`
- `test/fixtures/pr56_isa_misc.asm`
- `test/fixtures/pr131_isa_zero_operand_core_invalid.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

The first core-ops slice implements only the no-operand and exchange forms
proved by PR56 and the book tables:

- `di`, `ei`
- `scf`, `ccf`, `cpl`
- `ex de,hl`
- `ex (sp),hl`
- `exx`
- `halt`

It intentionally does not yet implement `INC`, `DEC`, `PUSH`, `POP`, indexed
`EX (SP),IX/IY`, `EX AF,AF'`, `DAA`, `NEG`, rotate/shift forms, or block
operations.

## IM/RST Interrupt-State Slice

Additional evidence read for this slice:

- `test/backend/pr57_isa_im_rst.test.ts`
- `test/backend/pr130_isa_inout_im_rst_arity_diag.test.ts`
- `test/backend/pr144_isa_ed_cb_diag_matrix.test.ts`
- `test/backend/pr1140_encode_error_paths.test.ts`
- `test/fixtures/pr57_isa_im_rst.asm`
- `test/fixtures/pr130_isa_inout_im_rst_arity_invalid.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

This slice implements only the interrupt-state and restart forms proved by
PR57, with arity and range diagnostics proved by the current diagnostic tests:

- `im 0`, `im 1`, `im 2`
- `rst n` for numeric constant vectors `0`, `8`, `16`, `24`, `32`, `40`,
  `48`, and `56`
- `reti`
- `retn`

The pure parser accepts mixed-case mnemonics and numeric constant expressions
for `IM` modes and `RST` vectors. It intentionally does not yet support
symbolic or forward-referenced `RST` vectors, because the current Next
instruction encoder emits concrete opcode bytes and Stage 5 evidence for this
slice proves numeric vectors only. The documented current diagnostics are:

- `im expects one operand`
- `im expects 0, 1, or 2`
- `rst expects one operand`
- `rst expects an imm8 multiple of 8 (0..56)`
- `reti expects no operands`
- `retn expects no operands`

## Conditional Control-Flow and Indirect JP Slice

Additional evidence read for this slice:

- `test/backend/pr477_encode_control_family.test.ts`
- `test/backend/pr1140_encode_error_paths.test.ts`
- `test/pr58_jp_indirect.test.ts`
- `test/pr149_condition_diag_matrix.test.ts`
- `test/pr207_jp_indirect_legality_diag_matrix.test.ts`
- `test/pr208_call_indirect_legality_diag_matrix.test.ts`
- `test/pr209_jp_cc_indirect_legality_diag_matrix.test.ts`
- `test/pr210_jp_call_condition_vs_imm_diag_matrix.test.ts`
- `test/fixtures/pr58_jp_indirect.asm`
- `test/fixtures/pr149_condition_diag_matrix_invalid.asm`
- `test/fixtures/pr207_jp_indirect_legality_diag_matrix_invalid.asm`
- `test/fixtures/pr208_call_indirect_legality_diag_matrix_invalid.asm`
- `test/fixtures/pr209_jp_cc_indirect_legality_diag_matrix_invalid.asm`
- `test/fixtures/pr210_jp_call_condition_vs_imm_diag_matrix_invalid.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/02-registers-flags-and-conditions.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

This slice implements only the conditional absolute control-flow and indirect
jump forms proved by the current tests and book tables:

- `ret cc` for `NZ`, `Z`, `NC`, `C`, `PO`, `PE`, `P`, and `M`
- `jp cc,nn` for `NZ`, `Z`, `NC`, `C`, `PO`, `PE`, `P`, and `M`
- `call cc,nn` for `NZ`, `Z`, `NC`, `C`, `PO`, `PE`, `P`, and `M`
- `jp (hl)`, `jp (ix)`, and `jp (iy)`

The pure encoder emits ABS16 fragments for conditional `JP` and `CALL` targets,
leaving expression evaluation and fixup patching in the assembly layer. It
intentionally does not yet implement register-care effects, conditional
diagnostic parity for every invalid form, or indexed addressing beyond the
documented indirect `JP` forms.

## INC/DEC/PUSH/POP Core-Ops Slice

Additional evidence read for this slice:

- `test/backend/pr477_encode_core_ops_family.test.ts`
- `test/backend/pr1140_encode_error_paths.test.ts`
- `test/pr133_arity_diag_matrix.test.ts`
- `test/pr147_known_head_diag_matrix.test.ts`
- `test/pr148_known_heads_no_fallback_matrix.test.ts`
- `test/fixtures/pr133_arity_diag_matrix_invalid.asm`
- `test/fixtures/pr147_known_head_diag_matrix_invalid.asm`
- `test/fixtures/pr148_known_heads_no_fallback_matrix.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

This slice implements the non-displacement core operation forms proved by the
current encoder tests and book tables:

- `inc r`, `inc rr`, `inc (hl)`, `inc ixh`, `inc ixl`, `inc iyh`, `inc iyl`
- `dec r`, `dec rr`, `dec (hl)`, `dec ixh`, `dec ixl`, `dec iyh`, `dec iyl`
- `push bc`, `push de`, `push hl`, `push af`, `push ix`, `push iy`
- `pop bc`, `pop de`, `pop hl`, `pop af`, `pop ix`, `pop iy`

The implemented `rr` set for `INC` and `DEC` is `BC`, `DE`, `HL`, `SP`, `IX`,
and `IY`. Indexed displacement forms such as `inc (ix+d)` and `dec (iy+d)` are
documented as retained AZM surface but intentionally left for a later
indexed-addressing slice, because they need a displacement operand model and
range diagnostics shared with indexed `LD`, ALU, bit, rotate, and shift forms.

## Indexed Addressing Foundation Slice

Additional evidence read for this slice:

- `test/backend/pr477_encode_ld_family.test.ts`
- `test/backend/pr477_encode_alu_family.test.ts`
- `test/backend/pr1140_encode_error_paths.test.ts`
- `test/asm80/asm80_directives_integration.test.ts`
- `test/frontend/asm_enum_constants.test.ts`
- `test/fixtures/pr137_indexed_bracket_syntax_invalid.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

This slice adds the shared indexed memory operand model for `(IX+d)` and
`(IY+d)` and implements the first byte-template forms that reuse it:

- `ld r,(ix+d)` and `ld r,(iy+d)`
- `ld (ix+d),r` and `ld (iy+d),r`
- `ld (ix+d),n` and `ld (iy+d),n`
- `add a,(ix+d)`, `add a,(iy+d)`
- `adc a,(ix+d)`, `adc a,(iy+d)`
- `sbc a,(ix+d)`, `sbc a,(iy+d)`
- `sub/and/or/xor/cp (ix+d)` and `(iy+d)`
- `inc (ix+d)`, `inc (iy+d)`
- `dec (ix+d)`, `dec (iy+d)`

The encoder emits a dedicated `disp8` fragment so displacement expressions are
evaluated by the assembly layer with a signed `-128..127` range check. The
parser accepts explicit `+` and `-` displacement syntax and rejects bracket
spelling such as `ix[1]`, matching current diagnostic evidence. Indexed bit,
rotate, shift, result-copy, and full indexed `LD`/half-register combinations
remain future Stage 5 slices.

## Indexed LD Half-Register Slice

Additional evidence read for this slice:

- `test/pr447_direct_index_high_low.test.ts`
- `test/backend/pr477_encode_ld_family.test.ts`
- `test/backend/pr1140_encode_error_paths.test.ts`
- `test/pr203_ld_diag_matrix.test.ts`
- `test/fixtures/pr146_known_head_no_unsupported.asm`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

This slice implements the direct-register `LD` forms proved by PR447 and the
representative backend encoder tests:

- `ld ixh,r`, `ld ixl,r`, `ld r,ixh`, `ld r,ixl`, and same-family
  `ld ixh,ixl` / `ld ixl,ixh` combinations, where `r` is `A`, `B`, `C`, `D`,
  or `E`
- `ld iyh,r`, `ld iyl,r`, `ld r,iyh`, `ld r,iyl`, and same-family
  `ld iyh,iyl` / `ld iyl,iyh` combinations, where `r` is `A`, `B`, `C`, `D`,
  or `E`
- `ld ix,nn` and `ld iy,nn`
- `ld sp,hl`, `ld sp,ix`, and `ld sp,iy`

The parser keeps the PR447 invalid boundaries explicit:

- plain `H`/`L` counterpart operands are not accepted with `IXH`/`IXL` or
  `IYH`/`IYL`
- direct loads between `IX*` and `IY*` byte registers are not accepted
- register-pair-to-register-pair `LD` remains limited to `SP <- HL/IX/IY`

Absolute-memory `LD` forms, `I`/`R` transfers, block-load mnemonics, and
additional diagnostic parity remain future Stage 5 slices.

## Absolute LD and I/R Transfer Slice

Additional evidence read for this slice:

- `test/asm80/asm80_directives_integration.test.ts`
- `test/asm80/asm80_equ_aliases.test.ts`
- `test/pr474_trace_format_helpers.test.ts`
- `src/z80/encodeLd.ts`
- sibling checkout
  `debug80-docs/azm-book/appendices/02-registers-flags-and-conditions.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

This slice implements the absolute-memory `LD` forms proved by ASM80
integration tests, equate-alias tests, current encoder behavior, and the AZM
book tables:

- `ld a,(nn)` and `ld (nn),a`
- `ld hl,(nn)` and `ld (nn),hl`
- `ld bc,(nn)` and `ld (nn),bc`
- `ld de,(nn)` and `ld (nn),de`
- `ld sp,(nn)` and `ld (nn),sp`
- `ld ix,(nn)` and `ld (nn),ix`
- `ld iy,(nn)` and `ld (nn),iy`

It also implements the documented interrupt-vector and refresh-register
transfers:

- `ld i,a` and `ld a,i`
- `ld r,a` and `ld a,r`

The pure encoder emits `abs16` fragments for all absolute-memory addresses so
symbol resolution and range checking remain assembly-layer responsibilities.
Parenthesized `BC`, `DE`, `HL`, `IX+d`, and `IY+d` operands keep their existing
register-indirect or indexed meaning; other parenthesized expressions are
absolute memory. Memory-to-memory `LD` remains explicitly unsupported.

Block-load mnemonics, remaining ED-family operations, and diagnostic parity for
all invalid absolute forms remain future Stage 5 slices.

## Non-Indexed CB Bit/Rotate/Shift Slice

Additional evidence read for this slice:

- `test/backend/pr477_encode_bitops_family.test.ts`
- `test/backend/pr1140_encode_error_paths.test.ts`
- `test/backend/pr144_isa_ed_cb_diag_matrix.test.ts`
- `test/pr150_ed_cb_diag_hardening_matrix.test.ts`
- `test/fixtures/pr126_cb_bitops_invalid_reg_matrix.asm`
- `test/fixtures/pr148_known_heads_no_fallback_matrix.asm`
- `test/fixtures/pr150_ed_cb_diag_hardening_matrix.asm`
- `src/z80/encodeBitOps.ts`
- sibling checkout
  `debug80-docs/azm-book/appendices/03-addressing-prefixes-and-instruction-forms.md`
- sibling checkout
  `debug80-docs/azm-book/appendices/04-classic-z80-instruction-support.md`

This slice implements the first non-indexed CB-prefix forms proved by current
encoder tests and the AZM book tables:

- `bit b,r` and `bit b,(hl)`
- `res b,r` and `res b,(hl)`
- `set b,r` and `set b,(hl)`
- `rlc r`, `rrc r`, `rl r`, `rr r`, `sla r`, `sra r`, `sll r` / `sls r`,
  and `srl r`
- `rlc (hl)`, `rrc (hl)`, `rl (hl)`, `rr (hl)`, `sla (hl)`, `sra (hl)`,
  `sll (hl)` / `sls (hl)`, and `srl (hl)`

The parser accepts only constant bit indexes `0..7` for this slice. It emits
specific diagnostics for bit-index range errors, missing operands, invalid
single-operand rotate/shift operands, and the two-operand rotate/shift form
that is reserved for indexed result-copy forms.

Indexed `DDCB`/`FDCB` forms, indexed result-copy forms, and the accumulator-only
base rotate mnemonics (`RLCA`, `RRCA`, `RLA`, `RRA`) remain future Stage 5
slices.
