# Changelog

## Unreleased

- None.

## 0.3.3 - 2026-07-11

- Verify explicit `.routine` contracts against their own body-effect summaries.
  A body write that the declaration preserves or leaves unmentioned is reported
  as `declaration_contract_mismatch` under register-contracts error/strict
  modes. Bare `.routine` still infers from the body.

## 0.3.2 - 2026-07-11

- Kept repeated nonreturning control-flow cycles separate from returning exits
  during register-contract inference. Cycle inputs remain visible alongside
  returning paths, and wholly nonreturning routines retain their cycle writes
  without producing false stack or output contracts.

## 0.3.1 - 2026-07-11

- Made register-contract analysis treat direct cross-routine `JR`/`JR cc`
  transfers as tail calls alongside `JP`/`JP cc`, including declared routines
  and explicit interface contracts.
- Made tail-call summary, liveness, stack, and direct-boundary analysis follow
  control-flow paths without dropping conditional fallthroughs, dead-code
  boundaries, repeated include occurrences, recursive calls, or unowned source
  instructions.

## 0.3.0 - 2026-07-11

- Breaking AZM 0.3 source model: `.routine` now declares register-contract
  routines, `@` marks exports only, and leading-underscore labels are local to
  their nearest non-local owner. Labels, equates and ops are case-sensitive;
  native Z80 mnemonics remain case-insensitive.
- Replaced semantic `;!` and `; expects out` comments with `.routine`,
  `.contracts`, `.rcignore` and `.expectout` directives.
- Made source and project register-contract policies effective across
  diagnostics, reports, inference, annotations and ratchets, with normalized
  public routine identities for same-named private routines.
- Extended D8 symbols with declaration identity, visibility and source-unit
  metadata so owner-local and imported private symbols remain distinguishable
  without exposing assembler-internal names.

## 0.2.17 - 2026-07-09

- Made label privacy routine-scoped, consistently across the whole program:
  a plain label defined after an `@` entry label is now local to that routine
  (visible until the next `@` label in the same privacy unit), so two
  routines may each define the same local label without colliding. Labels
  before a unit's first `@` label stay file-level — global in the entry file
  and its `.include`s, private to their source unit in `.import`ed files.
  Programs that never use `@` labels keep the classic fully-global
  behaviour.
- Added a visibility diagnostic for references to another routine's local
  label, suggesting `@`-exporting the label or moving it above the first `@`
  label.
- Ambiguous routine-local names now appear in symbol tables and Debug80 maps
  as `Routine.label`; unambiguous locals keep their plain display names.
- Added the MON-3 `_random` API (RST $10, C=49) to the mon3
  register-contract profile: outputs A, clobbers B and flags, preserves the
  remaining registers.

## 0.2.16 - 2026-07-06

- Accepted `.equ` constants (0..7) as bit indices in `bit`/`set`/`res`.
- Scoped imported private labels by source unit internally, so duplicate
  private labels in different imported source units assemble without
  colliding.

## 0.2.15 - 2026-07-02

- Made `RST` selector range contracts project-configured through `.asmi`
  interface files, including forms such as
  `service rst $10 C >= $60 TECMATE_EXPANSION_SERVICE`.
- Removed the hardwired `C >= $60` TecMate expansion-service fallback from the
  built-in MON3 register-contract profile. Projects should now declare their
  own conservative range fallback and tighter exact service contracts where
  appropriate.
- Improved register-contract stack proof for local dispatcher and tail-dispatch
  arms that restore a shared pushed frame before returning or tail-jumping.
- Fixed control-flow label indexing so branch analysis targets the first
  instruction for a label.

## 0.2.14 - 2026-07-01

- Added MON3/TecMate register-contract profile support for the `RST $10`
  `C=$53` bank-call ABI, including its caller-prepared `AF`/`DE`/`HL` stack
  frame.

## 0.2.13 - 2026-06-29

- Added mixed-mode register contract workflows for projects that combine strict
  new code with retained legacy source: scoped strict/audit/off policy, strict
  boundary enforcement, local suppressions with reasons, ratchet baselines, and
  machine-readable audit reports.
- Added register contract interface service declarations for indirect monitor
  APIs, including selector-based `RST` service contracts.
- Added register contract inference exports in JSON and Markdown so migration
  work can review draft routine contracts and caller-output evidence without
  rewriting source.

## 0.2.10 - 2026-06-12

- Added compact semicolon-separated register contract source comments, such as
  `;! in A; out A; clobbers F`, while preserving support for older
  one-clause-per-line contract comments.
- Updated generated register contract source annotations to write the compact
  single-line form and compact full flag clobbers as `F`.

## 0.2.9 - 2026-06-12

- Added first-slice `.import "file.asm"` support. Imported files assemble at
  the import point, public `@` labels are visible to outside source, plain
  imported labels are private to their import unit, repeated imports are
  idempotent, and recursive import/include stacks produce source diagnostics.
- Extended Debug80 map provenance so imported physical files appear in D8 file
  lists, symbols and source-attributed segments.
- Integrated `.import` with strict register contracts so imported public
  routines and their private helpers are analyzed as internal routines.
- Made ASM80-lowered `.z80` output reject `.import` programs with `AZMN_ASM80`
  instead of silently flattening module boundaries.

## 0.2.8 - 2026-06-04

- Fixed strict register contracts stack inference so ordinary internal direct
  calls to known, stack-balanced routines no longer poison callers with unknown
  stack effects.
- Treated `RET cc` as a routine exit for stack inference while still rejecting
  conditional returns that can leave pushed stack values unrestored.
- Made `.regcontracts.txt` reports explicitly opt-in debug/export artifacts and
  documented diagnostics as the normal register contracts workflow.

## 0.2.6 - 2026-05-31

- Added MON3-aware register-care dispatch for `RST $10` calls selected by the
  proven value in register `C`, with conservative fallback to generic `RST_$10`
  when the selector is unknown.
- Added named MON3 API contracts for the full `APITable` service range, with
  precise contracts for the matrix keyboard and LCD services used by Debug80
  matrix-keyboard experiments.

## 0.2.5

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
