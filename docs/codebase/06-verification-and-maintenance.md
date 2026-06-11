---
layout: default
title: 'Chapter 6 - Verification and Maintenance'
parent: 'AZM Engineering Manual'
nav_order: 6
---

[<- Interfaces and Output Artifacts](05-interfaces-and-output-artifacts.md) | [Appendices ->](appendices/)

# Chapter 6 - Verification and Maintenance

AZM's verification suite is organised by compiler boundary. A parser change has
a parser test. A byte-emission change has an encoder or integration test. A
public API change has a type-surface test. Reading the tests beside the
implementation is often the fastest way to understand a subsystem.

## Test Directory Map

```text
test/
  unit/
  integration/
  cli/
  asm80/
  differential/
  fixtures/
  helpers/
  types/
```

Start with the narrowest useful test, then add the integration or CLI coverage
that proves the user-facing behaviour.

## Unit and Integration Tests

Unit tests live under `test/unit/` and mirror implementation directories:

| Directory                  | Boundary                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| `unit/syntax/`             | Line parsing, expression parsing and directive aliases.             |
| `unit/source/`             | Logical line and comment handling.                                  |
| `unit/z80/`                | Instruction parsing, diagnostics and encoding.                      |
| `unit/outputs/`            | Artifact writer behaviour.                                          |
| `unit/expansion/`          | Op collection and expansion.                                        |
| `unit/register-contracts/` | Register contract carriers, summaries, liveness, reports and fixes. |

Unit tests are small and direct. A new indexed operand form belongs in
`test/unit/z80/` before it appears in a full source fixture. The unit test proves
the instruction parser and encoder agree on that one form.

Integration tests under `test/integration/` assemble real source snippets
through multiple compiler stages. Layout features, ops and register contracts
interactions usually need this level of test because the behaviour exists
between modules rather than inside one helper.

Source-loading and tooling provenance changes belong here as well. The
`stage-11-tooling-api.test.ts` integration suite covers include and import
resolution, recursive load failures and the span ownership metadata that tools
read from parsed items.

## CLI, ASM80 and Differential Tests

`test/cli/` verifies the command-line contract: options, artifact writing,
failure modes, determinism, case-style linting and register contract switches.
Users experience the command-line behaviour through argument parsing,
diagnostics, output paths and exit status.

CLI tests also protect deterministic output. `compareDiagnosticsForCli()` sorts
diagnostics by file, line, column, severity, code and message. A CLI test can
catch changes that leave the compiler correct but make terminal output unstable.

`test/asm80/` and `test/differential/` protect compatibility and byte parity.
These tests compare AZM behaviour against ASM80 expectations, lowered output and
real-program fixtures. For an assembler, a one-byte difference is a behavioural
change.

## Fixtures and Helpers

`test/fixtures/` contains small source programs named after the issue or
behaviour they cover. A good fixture shows the source shape that matters. It
includes enough context to assemble and diagnose the behaviour, then stops.

`test/helpers/` contains shared helpers for CLI runs, diagnostics, temporary
source files and acceptance tests. Use helpers for repetitive setup. Keep test
expectations close to the test itself so failures stay easy to read.

`test/types/` and `test/public_api_surface.test.ts` protect the package export
surface. Run them whenever changing `src/index.ts`, `src/api-compile.ts`,
`src/api-tooling.ts`, `src/outputs/types.ts` or `package.json` exports.

## Guardrails

The main package scripts are:

```sh
npm run build
npm run typecheck
npm run lint
npm run test:azm:alpha
npm run test:azm:corpus
npm run next:guardrails:core
npm run next:guardrails:package
npm run next:guardrails:quality
npm run next:guardrails
npm test
```

Additional guardrails live under `scripts/ci/` and `scripts/dev/`. They answer
larger questions: does the alpha lane still pass, does ASM80 parity still hold,
does the package work after build output is generated, does lowered ASM80 still
cover the intended source set, do source files remain within the size budget and
does the corpus still match the accepted compatibility baseline.

Use this map when choosing a verification lane:

| Change                      | Tests                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| Parser or expression syntax | `test/unit/syntax/**`, relevant integration tests.                   |
| Source loading or tooling provenance | `test/integration/stage-11-tooling-api.test.ts`, relevant unit tests in `test/unit/source/**`. |
| Z80 instruction support     | `test/unit/z80/**`, diagnostic matrices, ASM80 parity when relevant. |
| Layout semantics            | layout integration tests and output tests.                           |
| Ops                         | `test/unit/expansion/**`, op integration tests.                      |
| Register contracts          | register contract unit, integration and CLI tests.                   |
| CLI options                 | `test/cli/**`.                                                       |
| Output artifacts            | `test/unit/outputs/**`, CLI artifact tests.                          |
| Public API                  | type tests, public API surface tests and tooling API tests.          |
| ASM80 lowering or parity    | `check:asm80-coverage`, `test:ci:asm80-parity`, corpus guardrails.   |
| Package export surface      | `test:package`, public API surface tests.                            |

For subtle compiler changes, use a narrow test that names the broken layer and
a broader test that proves the public behaviour. That combination makes failures
easy to diagnose.

## Maintenance Boundaries

AZM is stable enough that changes should preserve the existing boundaries. A
maintainer can usually decide where a change belongs before editing code:
source loading, parsing, expression evaluation, address planning, Z80 encoding,
op expansion, register contracts, artifact writing, CLI or public API.

Ask what kind of fact the change affects:

- Text and files belong in `node/` and `source/`.
- Syntax belongs in `syntax/` or the structural parsing section of
  `core/compile.ts`.
- Assembler-time facts belong in `assembly/` and `semantics/`.
- Instruction forms belong in `z80/`.
- Inline source generation belongs in `expansion/`.
- Routine contracts and liveness belong in `register-contracts/`.
- Artifact shape belongs in `outputs/`.
- User commands belong in `cli/`.
- Package consumers belong in `api-compile.ts`, `api-tooling.ts` and
  `index.ts`.

This boundary choice determines the files to read, the tests to write and the
documentation to update.

## Structured Data and Compatibility

AZM passes structured data between stages. When a later stage needs more
information, add it to the earlier structured model and carry it forward.
Source provenance belongs on logical lines and source items. Syntax shape
belongs in `SourceItem`. Instruction shape belongs in `Z80Instruction`. Layout
facts belong in layout records and type expressions. Artifact metadata belongs
in output types.

Directive aliases and ASM80 lowering serve compatibility. Native AZM syntax
stays clean inside the compiler model when compatibility forms are converted to
canonical source items early and compatibility output is serialized late.

## Diagnostics and Manual Updates

Diagnostics should name the source location, the failing construct and the
reason. Parser diagnostics should recover where possible. Assembly diagnostics
should be deterministic. CLI output should sort diagnostics consistently.

This book should change when:

- a source directory is added, removed or repurposed
- the compile flow changes
- public package exports change
- CLI option groups change
- output artifact shapes change
- a major subsystem gains a new responsibility
- tests or guardrails are reorganised

Small implementation changes usually need test updates. Structural changes need
tests and manual updates.

## Suggested Change Workflow

1. Identify the boundary.
2. Read the relevant chapter and appendix entry.
3. Add or revise the closest test for the behaviour.
4. Change the implementation.
5. Run the focused test.
6. Run the broader guardrail that matches the public behaviour.
7. Update docs when the contract or architecture changed.

This workflow leaves evidence at the level where future maintainers will look:
the affected boundary, the public behaviour and the engineering manual when the
structure changes.
