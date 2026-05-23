# Changelog

## Unreleased

- Started the ASM80-first language direction as an exploratory design track.

## 0.2.1

- Document honest status for `emitAsm80` / lowered `.z80` output (beta, incomplete
  for real programs and parts of the ISA).
- `compile()`: `AZMN_ASM80` no longer discards bin/hex/d8/listing artifacts when
  assembly succeeded before lowering failed.
- Added `npm run check:asm80-coverage` to measure `AZMN_ASM80` across fixtures
  and optional MON3/Tetro/Pacmo sources.
- Lowered-output fix: CB rotate/shift instructions (`rlc`, `rrc`, `rl`, `rr`,
  `sla`, `sra`, `sll`, `srl`) in `write-asm80`.

## 0.3.0

- Released the current mature ZAX assembler line before the ASM80-first grammar work.
- Added stable `exports` entry points for `@jhlagado/zax`, `@jhlagado/zax/tooling`, and `@jhlagado/zax/compile`.
- Added a tooling API with `loadProgram()` for parse/load access, entry-buffer `preloadedText`, and `analyzeProgram()` for semantics-only validation.
- Documented the public API, semver policy, syntax-highlighting example, and migration away from deep `dist/src/*` imports.
- Added fallow dead-code and duplication audit scripts/configuration.

## 0.2.4

- Op expansion: `imm8` / `imm16` parameters now substitute into immediate port operands (`in a,(n)` / `out (n), r` — `PortImm8`).
