# v0.4 Priority Queue

This is the active short-form developer queue for the v0.4 era.

v0.4 is focused on code quality and maintainability only.

Current hard blocker:

- `src/lowering/emit.ts` is still over the hard cap at 4170 lines.
- v0.4 is not complete until `emit.ts` is under 1000 lines.
- Preferred end state is under 750 lines.

## Active order

### 1. Extract emission core and step-pipeline helpers

Issue:

- `#528`

Why first now:

- this is the first remaining large cohesive cluster in `src/lowering/emit.ts`
- it pulls out the byte emission, trace, SP-tracking, and typed step emission path
- it should materially reduce the current hard-cap breach

Priority focus:

- `src/lowering/emit.ts`
- `emitInstr(...)`
- `emitStepPipeline(...)`

### 2. Extract fixup emission and condition helpers

Issue:

- `#529`

Why second:

- the fixup and branch-helper cluster is still tightly packed in `emit.ts`
- it is a clear next slice after the emission core cluster
- it further reduces emitter-local encoding utility noise

### 3. Extract operand clone and asm utility helpers

Issue:

- `#530`

Why third:

- `emit.ts` still contains a broad AST/operand utility cluster
- those helpers are reusable and should not stay buried in the emitter
- this slice reduces local utility sprawl before deeper lowering extraction

### 4. Extract value push and memory materialization helpers

Issue:

- `#531`

Why fourth:

- this is the next heavy lowering helper cluster still trapped in `emit.ts`
- it moves the value/materialization path out before the large dispatcher move
- it prepares the emitter for the later final orchestration split

### 5. Extract asm instruction lowering dispatcher

Issue:

- `#532`

Why fifth:

- a major remaining body in `emit.ts` is the asm instruction lowering dispatcher
- this is a substantial reduction step and should happen only after the helper
  clusters above are already out

### 6. Extract the remaining declaration/function lowering orchestration

Issue:

- `#533`

Why sixth:

- this is the final structural reduction pass for `emit.ts`
- the goal is to make `emit.ts` the outer coordinator only
- this slice must leave `emit.ts` under the 1000-line hard cap

### 7. Coverage hardening after the emitter is under the cap

Issue:

- `#468`

Why after the split:

- the structural refactor is still the blocker
- targeted tests remain important, but they are not the current size-policy
  failure
- once `emit.ts` is below the cap, remaining weak spots can be hardened

## Completed enabling work

These v0.4 items are no longer the active blocker:

- `#465` — audit completed
- `#466` — umbrella refactor track completed by its child slices
- `#467` — docs consolidation completed
- `#472` through `#477` — prior structural slices completed
- `#504` through `#511` — earlier emitter decomposition slices completed or in
  progress where already landed

## Activation rule

- Break each queue item into explicit issues before developer implementation.
- Prefer one narrowly scoped cleanup/refactor issue per PR.
- Keep behavior-preserving cleanup separate from intended semantic changes.

## Boundary

- v0.3 is treated as complete.
- v0.4 starts as a code-quality cycle, not a feature-expansion cycle.
- The active v0.4 blocker is structural: `src/lowering/emit.ts` must be
  reduced below the hard cap before v0.4 can be considered complete.
