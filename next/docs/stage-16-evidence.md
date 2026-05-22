# AZM Next Stage 16 Evidence: Differential Burn-In and Promotion Slice A

Status: in progress

## Evidence Inspected

- `next/test/differential/minimal.fixture.test.ts`
- `next/test/differential/current-azm-runner.ts`
- `next/test/differential/next-azm-runner.ts`
- `next/test/differential/compare-results.ts`
- current `src/compile.ts` and related CLI/package behavior used as oracle for this baseline

## Proven Behavior Used

- Current AZM compile API (`src/compile.ts`) can be driven programmatically from an entry path and produces in-memory
  `hex` and (optionally) other artifacts.
- Current and next runners should be compared by canonical fields: exit code and hex text for a baseline fixture.
- A first differential check is the fastest possible validation to confirm runner wiring before expanding fixture coverage.

## Implemented Slice Boundary

- Implemented `next/test/differential/current-azm-runner.ts`:
  - writes the provided source text to a temporary `.asm` file,
  - runs current AZM compile entry point with explicit artifact controls (`emitHex: true`, `emitBin: false`, `emitD8m: false`, `emitListing: false`),
  - extracts canonical hex text and diagnostics.
- Unskipped and enabled `AZM Next differential minimal fixture` (`next/test/differential/minimal.fixture.test.ts`).
- The minimal fixture now runs a true current-vs-next comparison path.

## Deferred / Out of Scope in this Slice

- Differential runner portability, corpus-wide fixture expansion, and full `BIN`/diagnostic parity comparison.
- Result canonicalization and script/format normalization across all current fixture families.
