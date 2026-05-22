# AZM Next Scripts

This directory is reserved for AZM Next helper scripts.

Current script:

- `diff-against-current.mjs`: executes a fixture sweep by assembling the same source
  through both current AZM and AZM Next and comparing exit code, diagnostics,
  bytes, and HEX output through a shared result comparator.

Run:

```sh
node next/scripts/diff-against-current.mjs --skip-unsupported
node next/scripts/diff-against-current.mjs --skip-unsupported --report /tmp/next-diff-report.json
```

You can scope the sweep by directory or file:

```sh
node next/scripts/diff-against-current.mjs --fixtures-dir next/test/differential/fixtures
node next/scripts/diff-against-current.mjs --include minimal.asm --include fixup_slice.asm
node next/scripts/diff-against-current.mjs fixup_slice.asm
```

For parity gate automation:

```sh
npm run next:guardrails
```

If you need the legacy minimal gate only:

```sh
npm run next:guardrails:core
```
