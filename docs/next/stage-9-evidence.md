# Stage 9 Evidence: Visible Op Expansion

Status: Stage 9 visible-op expansion complete for the current AZM Next
assembler surface.

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

## Implemented AZM Next Boundary

The first zero-operand slice implements the evidence-backed smoke surface:

- Parse zero-operand declarations: `op Name()` ... `end`.
- Op names are case-sensitive programmer-defined names.
- Expand zero-operand invocation lines into the parsed body items.
- Keep declarations non-emitting.
- Feed expanded body items into the existing canonical assembly path.

The parameterized implementation covers the evidence-backed matching surface
needed for structured op calls without importing the full inherited lowering
stack:

- Parse parameter declarations using `name matcher` pairs.
- Match `reg8`, `reg16`, `imm8`, `imm16`, `cc`, `idx16`, `ea`, `mem8`,
  `mem16`, and fixed-token matchers.
- Preserve case-sensitive op names and parameter names.
- Select the best overload when a fixed-token matcher is strictly more specific
  than a register-class or condition-class matcher for the same operand.
- Report arity mismatch, no matching overload, and ambiguous overload
  diagnostics at the call site.
- Substitute bound operands into instruction operands as structured operands for
  the retained AZM Next Z80 forms, with direct handling for `LD`, `IN`, `OUT`,
  `INC`/`DEC`, branch, and ALU forms plus parser-backed fallback for other
  currently retained forms.
- Substitute `imm8` parameters into immediate port operands such as `out (p),a`
  and `in a,(p)`.
- Expand nested op calls and report direct or indirect expansion cycles.
- Rename op-local labels per call site so repeated expansions cannot collide.
- Report invalid expanded instructions with expanded instruction text and
  expansion-chain context.

Deferred Stage 9 behavior:

- Register-care parity remains outside AZM Next until the Next assembler has a
  register-care pipeline. Current AZM evidence is preserved here: op expansion
  must remain visible to any future register-care pass and must not create call
  boundaries.
