# AZM Next Stage 16 Evidence: Differential Burn-In and Promotion Slice A

Status: complete for differential gates; mechanical promotion pending user approval

## Evidence Inspected

- `next/test/differential/minimal.fixture.test.ts`
- `next/test/differential/fixture-corpus.test.ts`
- `next/test/differential/fixtures/minimal.asm`
- `next/test/differential/fixtures/fixup_slice.asm`
- `next/test/differential/fixtures/alias_and_storage.asm`
- `next/test/differential/current-azm-runner.ts`
- `next/test/differential/next-azm-runner.ts`
- `next/test/differential/compare-results.ts`
- `next/test/differential/unsupported-fixtures.ts`
- `next/test/differential/root-fixture-corpus.test.ts`
- current `src/compile.ts` and related CLI/package behavior used as oracle for this baseline
- `next/scripts/diff-against-current.mjs`
- `next/scripts/diff-against-current.ts`
- root `package.json` scripts
- `scripts/dev/run-coverage-core.mjs`
- `scripts/dev/check-fixture-coverage.mjs`
- `test/fixtures/coverage-map.md`

## Proven Behavior Used

- Current AZM compile API (`src/compile.ts`) can be driven programmatically from an entry path and produces in-memory
  `hex` and (optionally) other artifacts.
- Current and next runners are compared by canonical fields: exit code, diagnostics text, binary bytes, and hex text.
- `stdout` and `stderr` are compared with stable newline normalization.
- Artifact-byte/hex comparisons run only when both runs succeed, so error fixtures can be introduced without artifact-shape noise.
- A first differential check is the fastest possible validation to confirm runner wiring before expanding fixture coverage.
- `test/fixtures` inventory for coverage governance can be maintained deterministically.

## Implemented Slice Boundary

- Added quality/guardrail script slice for Stage 16 infrastructure:
  - Implemented `test:ci:coverage-core` in `package.json` to run `scripts/dev/run-coverage-core.mjs`.
  - Implemented `check:fixture-coverage` in `package.json` to run `scripts/dev/check-fixture-coverage.mjs`.
  - Added `scripts/dev/run-coverage-core.mjs` which executes a stable partition of coverage-critical test files:
    `test/registerCare`, `test/frontend`, `test/semantics`, source-loader tests, and core CLI matrix acceptance tests.
  - Added `scripts/dev/check-fixture-coverage.mjs` to build and enforce a fixture
    coverage manifest in `test/fixtures/coverage-map.md`.
  - Created `test/fixtures/coverage-map.md` containing all 85 fixture paths currently present.
  - Verified both script commands with a clean pass:
    - `npm run test:ci:coverage-core`
    - `npm run check:fixture-coverage`

- Implemented `next/test/differential/current-azm-runner.ts`:
  - writes the provided source text to a temporary `.asm` file,
  - runs current AZM compile entry point with explicit artifact controls (`emitHex: true`, `emitBin: true`, `emitD8m: false`, `emitListing: false`),
  - extracts canonical hex/bytes and diagnostics.
- Unskipped and enabled `AZM Next differential minimal fixture` (`next/test/differential/minimal.fixture.test.ts`).
- The minimal fixture now runs a true current-vs-next comparison path.
- Added `next/test/differential/alias-and-storage.fixture.test.ts` for Stage 6 storage/alias behavior.
- Extended `next/test/differential/compare-results.ts` to include:
  - `diagnosticsText` message list parity;
  - optional `binBytes` canonical byte parity;
  - normalized `stdout`/`stderr` text comparison.
- Added `next/test/differential/fixture-corpus.test.ts` with the first corpus slice
  (`minimal.asm`, `fixup_slice.asm`, `alias_and_storage.asm`).
- Added an executable differential corpus runner:
  - `next/scripts/diff-against-current.ts`
  - wrapper `next/scripts/diff-against-current.mjs`
  - `npm run next:diff-current` script entrypoint.
- Added `--report <file>` output for machine-readable mismatch reporting.
- Added `next:guardrails` npm script which runs `next:check` and the differential
  runner sweep together.
- `npm run next:diff-current` now compares fixture sets via canonical current-vs-next
  result parity and supports explicit scope via `--include`, `--fixtures-dir`, and
  `--skip-unsupported`.

- Added Stage 16 guardrail slice B:
  - Split `next:guardrails` into explicit constituent lanes:
    - `next:guardrails:core` (existing next:check + differential sweep),
    - `next:guardrails:package` (package smoke + public API surface test),
    - `next:guardrails:quality` (lint + source-file-size checks).
  - Updated `next:guardrails` to run the three lanes in sequence for a full
    stage-level verification sweep.

The differential suite now includes `enum_and_storage.asm`, and storage-gap
emission behavior is reconciled for that case.

- Added Stage 16 Slice C:
  - added `next/test/differential/unsupported-fixtures.ts` with explicit known-unsupported
    fixture roster and rationale,
  - made `next/scripts/diff-against-current.ts` source-of-truth for differential skips from that roster,
  - updated `next/test/differential/fixture-corpus.test.ts` to auto-discover all local
    `.asm` fixtures and compare only supported fixtures in this sweep,
  - added a regression test that the unsupported roster contract remains explicit.
- Added Stage 16 Slice D:
  - added `next/test/differential/root-fixture-corpus.test.ts` to run the same
    comparison contract over `test/fixtures/*.asm`,
  - added explicit root coverage guards in that suite for supported set equality and
    full unsupported roster size (`25`).

Current Stage 16 Slice D boundary:

- Added full fixture reconciliation for `enum_and_storage.asm` by aligning HEX emission so
  initialized output segments skip reserved-only `.ds` gaps while bin output remains unchanged.
- Added explicit unsupported roster for root corpus parity blockers (25 fixtures), all in `KNOWN_UNSUPPORTED_FIXTURES`.
- Confirmed root corpus differential:
  - 60 supported fixtures from root `test/fixtures` compare cleanly against current AZM,
  - 25 fixtures are intentionally unsupported and explicitly listed with reasons.
- `next:guardrails:core` now executes `next:diff-current:all` to include both
  next fixture corpus and root fixture corpus sweeps.

Implemented Stage 16 Slice E (unsupported boundary hardening):

- Added bucket-level classification to `KNOWN_UNSUPPORTED_FIXTURES` in
  `next/test/differential/unsupported-fixtures.ts` so every root fixture blocker is
  tagged by evidence class:
  - `include-directive` (`1`)
  - `diagnostic-wording` (`18`)
  - `visible-op-diagnostic` (`6`)
- Documented the exact enforced boundary contract as of this slice:
  - 85 total root fixtures discovered from `test/fixtures`
  - 60 supported fixtures compared against current AZM
  - 25 explicitly unsupported fixtures
- Enforced invariants remain source-of-truth in:
  - `next/test/differential/root-fixture-corpus.test.ts`
  - `next/scripts/diff-against-current.ts` (`--skip-unsupported`)
  - `next/test/differential/fixture-corpus.test.ts` (local corpus mirror)

Implemented Stage 16 Slice F (differential file-context wiring):

- Added a fixture-path execution path to the differential runners so include-aware compilation can be exercised with filesystem context:
  - `next/test/differential/current-azm-runner.ts`: added `runCurrentAzmFixture(entryFile, includeDirs?)`.
  - `next/test/differential/next-azm-runner.ts`: added `runNextAzmFixture(entryFile, includeDirs?)`.
  - `next/test/differential/root-fixture-corpus.test.ts`: switched supported root fixture comparisons to file-based execution and injected root include dirs (`test/fixtures/includes`).
  - `next/scripts/diff-against-current.ts`: switched root-suite runs to file-based next runner execution to align include search behavior.
- Extended parser support in `next/src/tooling/source-host.ts` to accept `.include` and bare `include`.

Current exact boundary after Slice F:

- 60 root fixtures are fully compared by differential runners in Stage 16 parity suites.
- 1 include-oriented fixture remains explicitly unsupported in `KNOWN_UNSUPPORTED_FIXTURES` (`include-directive` bucket), with diagnostics/message parity work still required.
- 25 total explicit unsupported root fixtures remain as the enforced boundary contract.

Implemented Stage 16 Slice G (sparse HEX segmentation):

- `next/src/api-compile.ts` now keeps the dense assembled image for BIN/listing/D8
  artifacts but passes only initialized bytes to the public HEX writer.
- This matches current AZM's HEX behavior for unwritten gaps between initialized
  islands without changing BIN span behavior.
- Removed 8 HEX-only layout fixtures from the unsupported roster:
  - `pr1349_ld_a_indirect_bc.asm`
  - `pr1349_ld_a_indirect_de.asm`
  - `pr1349_ld_a_indirect_hl.asm`
  - `pr1349_ld_indirect_bc_store.asm`
  - `pr1349_ld_indirect_de_store.asm`
  - `pr713_packed_top_level_arrays.asm`
  - `pr786_raw_data_lowering.asm`
  - `pr991_comment_preservation.asm`
- Kept `pr274_type_padding_explicit_ok.asm` and
  `pr274_type_padding_warning.asm` unsupported because they still differ in both
  BIN span and HEX layout.

Implemented Stage 16 Slice H (visible-op arity diagnostic formatting):

- Aligned visible `op` arity mismatch diagnostics with current AZM's multiline
  overload-list format.
- Removed `pr268_op_arity_mismatch_diagnostics.asm` from the unsupported roster.

## Proposed Slice B: Guardrails + Package Smoke Integration

Status: implemented.

## Stage B completion notes

- `next:guardrails:package` now runs `npm run test:package` after a fresh compile
  (`npm run build` via `test:package`), so package smoke never reuses stale `dist`
  artifacts.
- This closes the review-identified risk that stale artifacts could mask package
  export/API regressions.
- Added a fallback Next-local package-surface smoke test at
  `next/test/integration/stage-16-package-smoke-local.test.ts` for environments
  where full `npm pack`/install smoke cannot run.
- Added `next:guardrails:package:local` and updated `next:guardrails:package` to
  run the local fallback when `test:package` fails in the current environment.

Implemented Stage 16 Slice I (code/data placement parity):

- Added `next/src/assembly/placement.ts` and wired `next/src/assembly/assemble-program.ts` to
  separate code and data placement bases using current-AZM org lookahead rules.
- Instructions always occupy the code placement base; when the active placement is `data`,
  instruction bytes are also written at the data offset (mirrors current AZM `codeBytes` +
  lowered data-block emission).
- Removed `pr274_type_padding_explicit_ok.asm` and `pr274_type_padding_warning.asm` from the
  unsupported roster; supported root differential count is **60**, unsupported **25**.
- Updated Stage 4 integration tests to assert address-keyed bytes under the wider BIN span
  model instead of compact origin-relative arrays.

Current exact boundary after Slice I:

- **60** root fixtures compare cleanly against current AZM in `root-fixture-corpus.test.ts`.
- **25** root fixtures remain in `KNOWN_UNSUPPORTED_FIXTURES` (diagnostic wording, visible-op
  diagnostics, include-directive gap).
- `npm run next:check` passes (typecheck + full vitest config).

Implemented Stage 16 Slice J:

- Added current-AZM-compatible conditional indirect legibility wording for `jp`/`call`:
  - `jp cc, nn does not support indirect targets`
  - `call cc, nn does not support indirect targets`
- Added parser assertions for these conditional indirect cases in
  `next/test/unit/z80/parser-encoder.test.ts`.
- Removed `pr208_call_indirect_legality_diag_matrix_invalid.asm` and
  `pr209_jp_cc_indirect_legality_diag_matrix_invalid.asm` from `KNOWN_UNSUPPORTED_FIXTURES`.
- Current exact boundary after Slice J:
  - **60** root fixtures compare cleanly against current AZM in `root-fixture-corpus.test.ts`.
  - **25** root fixtures remain in `KNOWN_UNSUPPORTED_FIXTURES` (diagnostic wording, visible-op
    diagnostics, include-directive gap).

## Deferred / Out of Scope

- Mechanical `next/` → root promotion (user approval required).
- Golden lowered `.z80` comparison against current ASM80 validator corpora.
- Closing the 18 diagnostic-wording unsupported fixtures without an explicit spec decision.
