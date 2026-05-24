# AZM 0.2.1 Release Readiness Evidence

Date: 2026-05-24

Status: release-ready pending GitHub Release creation for `v0.2.1`.

This note records the evidence used to decide that the AZM Next rewrite is ready
to cut over as `@jhlagado/azm` 0.2.1.

## Release State

- Current main: `bb538c1 chore: prepare 0.2.1 release (#202)`
- Open PRs before this evidence PR: none
- Package metadata: `@jhlagado/azm` `0.2.1`
- Package-lock metadata: root package `0.2.1`
- npm registry before publish: `0.1.0`, `0.1.1`, `0.2.0`; `0.2.1` is not
  published yet
- Publish workflow: `.github/workflows/publish-npm.yml` publishes from a GitHub
  Release tag that matches `package.json` version

## Feature Completeness Boundary

Release scope is the promoted AZM assembler, not the retired ZAX high-level
source layer.

Included and verified:

- `.asm` and `.z80` source entries
- Z80 instruction parsing and encoding
- canonical dotted directives and common undotted directive spelling
  compatibility
- textual `.include`
- labels and `@` routine-entry labels
- `.equ`, `.org`, `.db`, `.dw`, `.ds`
- `.cstr`, `.pstr`, `.istr`
- `.align`, `.binfrom`, `.binto`
- enums and qualified enum constants
- `.type`, `.union`, `.field`, `.byte`, `.word`, `.addr`
- `sizeof`, `offset`, and constant-only layout casts
- visible `op` expansion
- register-care contracts, AZMDoc comments, `.asmi` interfaces, and register-care
  reports
- BIN, HEX, listing, Debug80 `.d8.json`, and optional ASM80-compatible `.z80`
  output
- CLI and package API entry points

Explicitly not part of the release surface:

- text macros
- local labels as user-facing AZM syntax
- modules/imports
- `func`, formal arguments, generated frames, and locals
- structured control flow
- typed assignment lowering and hidden typed load/store lowering
- named section blocks

## Real-Program Proof

These checks were run locally against real source trees present on the release
machine.

| Program                | Command                                                                                                                                                           | Evidence                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tetro                  | `AZM_RUN_TETRO_ACCEPTANCE=1 npm run test:asm80:tetro`                                                                                                             | AZM compiled Tetro and matched a fresh ASM80-built reference binary byte-for-byte                                      |
| Pacmo                  | `AZM_RUN_PACMO_ACCEPTANCE=1 npm run test:asm80:pacmo`                                                                                                             | AZM compiled Pacmo and matched a fresh ASM80-built reference binary byte-for-byte                                      |
| MON3                   | `AZM_RUN_MON3_ACCEPTANCE=1 npm run test:asm80:mon3`                                                                                                               | AZM compiled MON3 and matched a fresh ASM80-built reference binary byte-for-byte                                       |
| MON3 CLI               | `node dist/src/cli.js --type bin --output <tmp>/mon3.bin --nohex --nolist --nod8m /Users/johnhardy/projects/MON3/src/mon3.z80` plus fresh ASM80 binary comparison | CLI-produced `mon3.bin` was 16 KiB; reference was 16 KiB; first mismatch: none                                         |
| Tetro/Pacmo CLI corpus | `npm run test:azm:corpus`                                                                                                                                         | Tetro and Pacmo HEX output matched ASM80; MON3 is not configured in that corpus script and is covered separately above |

## Guardrail Proof

Commands verified during release-readiness work:

| Command                                         | Result                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run build`                                 | pass                                                                         |
| `npm run test:package`                          | pass for `jhlagado-azm-0.2.1.tgz`                                            |
| `npm run next:guardrails:quality`               | pass; expected source-size warnings remain documented                        |
| `npm run test:ci:asm80-parity`                  | pass                                                                         |
| `npm run build && npm run next:guardrails:core` | pass after shared Vitest timeout was raised to match real full-suite runtime |
| `npm view @jhlagado/azm versions --json`        | confirms `0.2.1` is unpublished before release                               |

CI evidence:

- PR #200 passed macOS, Ubuntu, and Windows after the shared Vitest timeout fix.
- PR #202 passed macOS, Ubuntu, and Windows for the `0.2.1` release-prep
  package metadata and changelog.

## Remaining Release Action

Create and publish a GitHub Release with tag `v0.2.1` from current `main`.
The publish workflow verifies that the release tag matches `package.json` before
running `npm publish --access public`.

Do not publish from a branch where `npm run test:ci:asm80-parity` has been
removed or weakened.
