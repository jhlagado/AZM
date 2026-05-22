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
