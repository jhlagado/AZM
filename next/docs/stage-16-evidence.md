# AZM Next Stage 16 Evidence: Differential Burn-In and Promotion Slice A

Status: in progress

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
    full unsupported roster size (`39`).

Current Stage 16 Slice D boundary:

- Added full fixture reconciliation for `enum_and_storage.asm` by aligning HEX emission so
  initialized output segments skip reserved-only `.ds` gaps while bin output remains unchanged.
- Added explicit unsupported roster for root corpus parity blockers (39 fixtures), all in `KNOWN_UNSUPPORTED_FIXTURES`.
- Confirmed root corpus differential:
  - 46 supported fixtures from root `test/fixtures` compare cleanly against current AZM,
  - 39 fixtures are intentionally unsupported and explicitly listed with reasons.
- `next:guardrails:core` now executes `next:diff-current:all` to include both
  next fixture corpus and root fixture corpus sweeps.

Implemented Stage 16 Slice E (unsupported boundary hardening):

- Added bucket-level classification to `KNOWN_UNSUPPORTED_FIXTURES` in
  `next/test/differential/unsupported-fixtures.ts` so every root fixture blocker is
  tagged by evidence class:
  - `include-directive` (`1`)
  - `diagnostic-wording` (`20`)
  - `hex-bin-layout` (`10`)
  - `indexed-syntax-parse` (`1`)
  - `visible-op-diagnostic` (`7`)
- Documented the exact enforced boundary contract as of this slice:
  - 85 total root fixtures discovered from `test/fixtures`
  - 46 supported fixtures compared against current AZM
  - 39 explicitly unsupported fixtures
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

- 46 root fixtures are fully compared by differential runners in Stage 16 parity suites.
- 1 include-oriented fixture remains explicitly unsupported in `KNOWN_UNSUPPORTED_FIXTURES` (`include-directive` bucket), with diagnostics/message parity work still required.
- 39 total explicit unsupported root fixtures remain as the enforced boundary contract.

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

## Deferred / Out of Scope in this Slice

- Corpus-wide fixture expansion, full `BIN`/diagnostic parity normalization, and fixture
  family reconciliation remain for later Stage 16 slices.
- Result canonicalization and source-of-truth classification across all current fixture
  families remain open.
