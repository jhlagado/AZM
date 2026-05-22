# Stage 9 Evidence: Visible Op Expansion

Status: active evidence pack; first visible-op expansion slice in progress.

Stage 9 starts the retained AZM `op` surface in AZM Next. Current AZM remains
the source of truth. Ops are structured AST-level assembly idioms, not text
macros, functions, hidden compiler lowering, or typed-memory operations.

## Evidence Read

Current AZM tests, source, and docs inspected:

- `test/frontend/pr476_parse_op_helpers.test.ts`
- `test/lowering/pr510_op_expansion_execution_helpers.test.ts`
- `test/lowering/pr510_op_expansion_orchestration_helpers.test.ts`
- `test/lowering/pr510_op_substitution_helpers.test.ts`
- `test/lowering/pr504_op_matching_helpers.test.ts`
- `test/lowering/pr1367_op_port_imm_substitution.test.ts`
- `test/registerCare/opExpansion.integration.test.ts`
- `test/pr268_op_diagnostics_matrix.test.ts`
- `test/fixtures/pr16_op_cycle.asm`
- `test/fixtures/pr267_op_ambiguous_incomparable.asm`
- `test/fixtures/pr268_op_no_match_diagnostics.asm`
- `test/fixtures/pr268_op_arity_mismatch_diagnostics.asm`
- `test/fixtures/pr270_op_invalid_expansion_diagnostics.asm`
- `src/frontend/parseOp.ts`
- `src/frontend/parseParams.ts`
- `src/lowering/opMatching.ts`
- `src/lowering/opSubstitution.ts`
- `src/lowering/opExpansionExecution.ts`
- `src/lowering/opExpansionOrchestration.ts`
- `src/lowering/opExpansionStream.ts`
- `docs/design/azm-ops-subset.md`
- `docs/design/azm-language-direction.md`
- `docs/reference/source-overview.md`

## Proven Behavior

Ops are visible inline assembly expansions:

- `op Name(...)` starts an op declaration.
- Plain `end` terminates an op declaration. It is distinct from top-level
  `.end`.
- Op declarations do not emit bytes and do not move labels.
- A call site expands to ordinary assembly items before downstream assembly and
  analysis.
- A minimal proven smoke form is:

  ```asm
  op clear_a()
    xor a
  end

  main:
    clear_a
    ret
  ```

  The emitted object contains the same `xor a` instruction the programmer could
  have written directly.

- Register-care evidence confirms op invocations do not create call
  boundaries; downstream consumers should see expanded instructions.

Parameterized ops and overloads:

- Parameters have names and matchers such as fixed tokens, register classes,
  immediates, memory/effective-address forms, conditions, and ports.
- Op overload selection distinguishes arity mismatch, no match, ambiguity, and
  successful selection.
- Fixed-token overloads can be more specific than general register-class
  overloads.
- Operands are substituted as AST operands, not text.
- Op-local labels are renamed during expansion so repeated call sites cannot
  collide with each other or with public labels.

Diagnostics:

- Current AZM has specific diagnostics for arity mismatch, no matching
  overload, ambiguous overloads, cyclic expansion, and invalid expanded
  instructions.
- Invalid op expansions include call-site context, expanded instruction text,
  op definition context, and expansion-chain context.

## First AZM Next Slice Boundary

This first slice implements only the evidence-backed smoke surface:

- Parse zero-operand declarations: `op Name()` ... `end`.
- Op names are case-sensitive programmer-defined names.
- Expand zero-operand invocation lines into the parsed body items.
- Keep declarations non-emitting.
- Feed expanded body items into the existing canonical assembly path.

Deferred Stage 9 behavior:

- Parameter parsing and matcher validation.
- Overload selection.
- Operand substitution.
- Op-local label renaming.
- Nested op expansion and cycle detection.
- Full current-AZM op diagnostics for arity, no match, ambiguity, invalid
  expansion, and expansion chains.
- Register-care integration over the expanded stream.
