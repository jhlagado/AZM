# Test helpers (`test/helpers`)

Shared utilities for Vitest suites: diagnostic matchers, CLI runners, lowered-program inspection, and Vitest setup.

## Preferred imports (new tests)

Import from the **barrel** so new code converges on one path:

```ts
import { expectDiagnostic, runCli, compilePlacedProgram } from '../helpers/index.js';
```

Adjust the relative prefix to your file depth:

| Test location             | Barrel import                |
| ------------------------- | ---------------------------- |
| `test/*.test.ts`          | `from './helpers/index.js'`  |
| `test/<subdir>/*.test.ts` | `from '../helpers/index.js'` |

Use **named exports** only (the barrel re-exports the public surfaces of each module).

Prefer the **barrel** (`helpers/index.js`) for **new** tests so imports stay consistent when internals move.

## Submodule paths (advanced)

You may import directly from implementation folders when you need a symbol that is not re-exported from the barrel, or for type-only imports that mirror runtime modules:

- `helpers/diagnostics/index.js` — diagnostic matchers and `DiagnosticExpectation`
- `helpers/cli/index.js` — `runCli`, path helpers

Avoid duplicating the same helper import across **three** styles (barrel + shim + deep path) in one file; pick one style per test file.

## Vitest setup (`toHaveDiagnostic`)

`vitest.config.ts` sets `setupFiles: ['test/helpers/setup.ts']`. That file registers the custom matcher **`toHaveDiagnostic`** (see `test/helpers/vitest.d.ts`). Use `expect(diagnostics).toHaveDiagnostic({ id, severity, messageIncludes?, line?, column?, file? })` for full control, or the shorthand `expect(diagnostics).toHaveDiagnostic(DiagnosticIds.EmitError, 'error')`. Tests rely on this global setup; they do not need to import `setup.ts` themselves.

## What the barrel includes

`index.ts` re-exports:

- `./diagnostics/index.js`
- `./cli/index.js`
- `./cli/build.js`
- `./lowered_program.js` (aggregates lowered-program helpers; not a folder shim)
- `./setup.js` (normally only loaded via Vitest config, not imported from tests)
