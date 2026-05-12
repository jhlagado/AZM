# Changelog

## Unreleased

- Started the ASM80-first language direction as an exploratory design track.

## 0.3.0

- Released the current mature ZAX assembler line before the ASM80-first grammar work.
- Added stable `exports` entry points for `@jhlagado/zax`, `@jhlagado/zax/tooling`, and `@jhlagado/zax/compile`.
- Added a tooling API with `loadProgram()` for parse/load access, entry-buffer `preloadedText`, and `analyzeProgram()` for semantics-only validation.
- Documented the public API, semver policy, syntax-highlighting example, and migration away from deep `dist/src/*` imports.
- Added fallow dead-code and duplication audit scripts/configuration.

## 0.2.4

- Op expansion: `imm8` / `imm16` parameters now substitute into immediate port operands (`in a,(n)` / `out (n), r` — `PortImm8`).
