# AZM Next Scripts

Helper scripts for AZM implementation.

Current script:

- `diff-against-current.mjs`: executes a fixture sweep by assembling the same source
  through both current AZM and AZM Next and comparing exit code, diagnostics,
  bytes, and HEX output through a shared result comparator.

Run:

```sh
node scripts/diff-against-current.mjs --skip-unsupported
node scripts/diff-against-current.mjs --skip-unsupported --report /tmp/azm-diff-report.json
```

You can scope the sweep by directory or file:

```sh
node scripts/diff-against-current.mjs --fixtures-dir test/differential/fixtures
node scripts/diff-against-current.mjs --include minimal.asm --include fixup_slice.asm
node scripts/diff-against-current.mjs fixup_slice.asm
```

For parity gate automation:

```sh
npm run next:guardrails
```

If you need the legacy minimal gate only:

```sh
npm run next:guardrails:core
```
