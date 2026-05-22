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
- `sub a,b` -> `90`
- `sub 1` -> `D6 01`
- `and $F0` -> `E6 F0`
- `or a` -> `B7`
- `xor $55` -> `EE 55`
- `cp (hl)` -> `BE`
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
