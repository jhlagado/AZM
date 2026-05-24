# Changelog

## Unreleased

- Retired the historical oracle tree and removed package, script, and test
  dependencies on `legacy-root-azm/`.
- Replaced legacy differential gates with promoted implementation self-checks,
  external ASM80 round-trip checks, package smoke tests, and real-program
  ASM80 acceptance gates.

## 0.2.1 - 2026-05-24

AZM Next release candidate: the promoted repository-root assembler replaces the
old implementation for normal CLI and package use.

- Promoted the AZM Next assembler under `src/` with the legacy implementation
  retained only as a short-lived release audit reference.
- Added stable package entry points for `@jhlagado/azm`,
  `@jhlagado/azm/compile`, `@jhlagado/azm/tooling`, and `@jhlagado/azm/cli`.
- Added the file-backed `compile()` API, tooling load/analyze APIs, Debug80 map
  artifact support, and register-care tooling outputs.
- Implemented the retained AZM source surface: Z80 assembly, directive spelling
  compatibility, textual includes, register-care contracts, AZMDoc comments,
  `op` expansion, enums, `.type` / `.union` layout metadata, `sizeof`, `offset`,
  layout casts, string directives, binary range controls, BIN, HEX, listing,
  Debug80 `.d8.json`, and optional ASM80-compatible `.z80` output.
- Removed old high-level ZAX source behavior from the current AZM source
  boundary: modules/imports, `func`, formal arguments, generated frames,
  structured control flow, typed assignment lowering, hidden typed load/store
  lowering, text macros, and local-label documentation.
- Added real-program acceptance proof for Tetro, Pacmo, and MON3 against fresh
  ASM80-built reference binaries when the local source trees are present.
- Added release guardrails for package smoke tests, source-size checks, ASM80
  lowering coverage, external ASM80 round-trip parity, and optional real-program
  ASM80 lowering acceptance.
- Refreshed the README and active docs to point users to the Debug80 AZM book:
  <https://jhlagado.github.io/debug80-docs/azm-book/book4/>.

## 0.2.0

- Previous published AZM package line.
