# `test/cli/`

End-to-end CLI behavior: flags, artifacts, determinism, and slow/reliability suites. Helpers:
`test/helpers/cli.ts`, `test/helpers/cliBuild.ts`.

## Long timeouts (180s)

Several CLI tests opt into a 180,000 ms timeout via `it(..., 180_000)`. This is intentional
because these cases:

- build the CLI end-to-end (cold caches in CI)
- spawn processes and write multiple artifact files
- are most sensitive to Windows and macOS I/O variability

Current files using the 180s timeout:

- `test/cli/cli_acceptance_matrix_strictness.test.ts`
- `test/cli/cli_artifacts.test.ts`
- `test/cli/cli_case_style_lint.test.ts`
- `test/cli/cli_contract_matrix.test.ts`
- `test/cli/cli_determinism_contract.test.ts`
- `test/cli/cli_failure_contract_matrix.test.ts`
- `test/cli/cli_path_parity_contract.test.ts`
- `test/cli/cli_zax_smoke.test.ts`

### When a long timeout is justified

- The test performs a full CLI build or end-to-end CLI invocation.
- The test writes or reads multiple artifacts and relies on filesystem timing.
- The test runs a determinism or matrix suite with repeated CLI executions.

### When it is not justified

- Pure argument parsing or validation that does not invoke a build.
- CLI helper tests that only validate small pieces of behavior.
- Tests that can be restructured to use a prebuilt CLI binary.

### When to revisit or reduce

- If CLI prebuilds are added for the suite, reduce per-test timeouts.
- If a test stops doing full CLI work, drop back to the default timeout.
- If a single test needs more than 180s, that is a smell; prefer isolating the slow step or
  fixing the underlying build cost instead of raising the timeout.
