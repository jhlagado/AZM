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
- current `src/compile.ts` and related CLI/package behavior used as oracle for this baseline
- `next/scripts/diff-against-current.mjs`
- `next/scripts/diff-against-current.ts`

## Proven Behavior Used

- Current AZM compile API (`src/compile.ts`) can be driven programmatically from an entry path and produces in-memory
  `hex` and (optionally) other artifacts.
- Current and next runners are compared by canonical fields: exit code, diagnostics text, binary bytes, and hex text.
- `stdout` and `stderr` are compared with stable newline normalization.
- Artifact-byte/hex comparisons run only when both runs succeed, so error fixtures can be introduced without artifact-shape noise.
- A first differential check is the fastest possible validation to confirm runner wiring before expanding fixture coverage.

## Implemented Slice Boundary

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

`alias_and_storage.asm` is currently excluded from this slice because it depends on
layout/enum details currently outside the proven differential boundary.

## Deferred / Out of Scope in this Slice

- Corpus-wide fixture expansion, full `BIN`/diagnostic parity normalization, and fixture
  family reconciliation remain for later Stage 16 slices.
- Result canonicalization and source-of-truth classification across all current fixture
  families remain open.
