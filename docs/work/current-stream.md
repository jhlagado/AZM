# Current Stream

## Current language direction

The active ergonomics stream has landed its core language work:
- `:=` is the assignment surface on `main`
- scalar path-to-path `:=` is implemented on `main`
- `step` on typed scalar paths is implemented on `main`

The old `move` surface is removed. The rolled-back `addr` / ops-first addressing
stream is not the active language direction.

### Current implementation state

- Typed storage transfers use `:=` on `main`.
- Scalar path-to-path `:=` is implemented on `main`.
- `step` typed-path lowering is implemented on `main`.
- Grouped and ranged `select case` values are implemented.
- Parser/grammar convergence work remains active.
- Typed reinterpretation syntax `<Type>base.tail` is implemented on `main`.
- Raw data directives and raw-label semantics are implemented on `main`.
- `@path` address-of storage paths are implemented on `main`.

### Immediate priority

1. Sweep obvious load/store shuttle patterns to scalar path-to-path `:=` in live examples/docs/tests.
2. Sweep obvious scalar update patterns to `step` in live examples/docs/tests.
3. Continue parser/grammar convergence work.

### Deferred until re-planned

- Pascal-style counted `for`
- any reintroduction of `addr` as a source-language feature
- broad addressing-surface redesign
- further addressing-surface redesign beyond the current typed-path model
