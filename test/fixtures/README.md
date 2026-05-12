# Fixture Naming Conventions

This directory holds shared fixtures referenced by tests across subsystems. These conventions
match current usage and are intended to keep new additions consistent.

## Core shape

- Prefer `prNNN_<topic>_<qualifier>.zax` for test-linked fixtures.
- Keep the `prNNN_` prefix aligned with the test file name that owns the fixture.
- Use underscores, not hyphens, inside the suffix to mirror existing fixtures.

Examples:

- `pr24_isa_core.zax`
- `pr131_isa_zero_operand_core_invalid.zax`
- `pr286_nonscalar_param_compat_negative.zax`

## Positive/negative conventions

- Use `_positive` and `_negative` when the fixture is paired by expectation.
- Use `_invalid` when the fixture exists purely to drive a diagnostic matrix.
- Use `_matrix` only when the fixture itself is a matrix corpus (e.g. multiple cases in one file).

Examples:

- `pr286_nonscalar_param_compat_positive.zax`
- `pr129_isa_ed_zero_operand_invalid.zax`
- `pr138_rel8_out_of_range_matrix.zax`

## Test name mirroring

- If the test file is `test/**/prNNN_<name>.test.ts`, prefer fixtures that start with
  `prNNN_<name>` so searches remain trivial.
- When a test needs multiple fixtures, keep the shared prefix and vary only the suffix.

Example cluster:

- `pr980_local_alias_global_typed.zax`
- `pr980_local_alias_raw_aggregate.zax`
- `pr980_local_alias_bad_param.zax`

## Matrix and corpus fixtures

- Matrix fixtures that are run through multiple assertions should use the `_matrix` suffix.
- Corpus files should live under `test/fixtures/corpus/` and use descriptive names
  (for example, `manifest.json`).

## Support and non-ZAX fixtures

- Keep non-ZAX fixtures next to their related ZAX fixtures with the same prefix when possible.
- Preserve the existing extension and prefix (for example, `pr17_hex_basic.zax` vs `pr17_hex_overlap.zax`).

## Paths after test moves

- Tests moved into subsystem folders should reference fixtures via:
  `join(__dirname, '..', 'fixtures', '<name>.zax')`
- This keeps fixture access stable even as tests migrate into `test/backend`, `test/semantics`, etc.

## Coverage map (`coverage-map.md`)

- `coverage-map.md` is **generated** by `scripts/dev/fixture-coverage.js` (static test references plus
  fixture `include` / `import` edges; assumptions match the banner in that file).
- After changing fixtures or tests that affect the map, regenerate from the repo root:
  `node scripts/dev/fixture-coverage.js > test/fixtures/coverage-map.md`
- CI runs `npm run check:fixture-coverage` (fails if the committed map drifts from the generator).
