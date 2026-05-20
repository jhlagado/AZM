# AZM Test Discovery Guide

Use this file to find the right existing tests before adding a new one. For local commands, fixture refresh steps, and CI expectations, use [docs/reference/testing-verification-guide.md](../docs/reference/testing-verification-guide.md).

## Subsystem layout (in progress)

Tests are migrating from a flat `test/prNNN_*.test.ts` layout into subsystem folders:

- `test/cli/` — CLI and artifact contracts
- `test/backend/` — Z80 encoder and opcode-family unit tests
- `test/frontend/` — parser, grammar, and frontend-adjacent tests (migration ongoing)
- `test/semantics/` — semantics, env, and layout tests (migration ongoing)
- `test/lowering/` — lowering helper seams and asm-emission integration tests
  (most current AZM lowering seams now live here; inherited ZAX retirement
  tests may still be top-level)

New tests should prefer the subsystem directory that matches the code under test. Older tests may still live at `test/prNNN_*.test.ts` until moved.
CI now rejects newly added top-level `test/prNNN_*.test.ts` files unless you explicitly update the guardrail.

## How to navigate this tree

- The `prNNN_*` names preserve issue history. Treat the prefix as provenance, not as the primary way to discover coverage.
- Start from the feature-area index below, then narrow with `npm run test:all -- --run test/<file>.test.ts`.
- Small helper utilities live in `test/helpers/` (import conventions: [test/helpers/README.md](helpers/README.md)) and shared assertions live in `test/test-helpers.ts`.

## Pick the right test shape

### Prefer a unit or helper test when

- the behavior is isolated to one parser, encoder, or lowering helper module
- the contract is AST shape, operand normalization, opcode selection, or a small pure helper result
- you can assert without running the full compile pipeline

Representative files:

- `frontend/pr476_parse_*.test.ts` for parser helpers
- `backend/pr477_encode_*.test.ts` for encoder families
- `lowering/pr509_*.test.ts`, `lowering/pr510_*.test.ts`, `lowering/pr528_*.test.ts`, `lowering/pr529_*.test.ts`, `lowering/pr530_*.test.ts`, `lowering/pr531_*.test.ts`, and `lowering/pr532_asm_instruction_lowering_integration.test.ts` for lowering helper seams

### Prefer an integration test when

- the change crosses phase boundaries inside the compiler
- the contract depends on `parseProgram(...)` or `compile(...)`
- you need to validate emitted bytes, lowered instruction shape, fixups, register
  contracts, textual includes, op expansion, or ASM80 compatibility

Representative files:

- `frontend/azm_native_top_level_parser.test.ts` and
  `frontend/azm_flat_module_asm.test.ts` for native AZM parser boundaries
- `asm80/asm80_directives_integration.test.ts` and
  `frontend/asm80_classic_module.test.ts` for ASM80-compatible assembly
- `registerCare/opExpansion.integration.test.ts` for op expansion in the
  retained assembler model
- `examples_compile.test.ts` for checked-in example programs

### Prefer a corpus or golden-style test when

- the checked-in artifact is the contract, not just an intermediate shape
- you need deterministic output across runs or platforms
- the user-visible guarantee is textual ASM80 output, HEX bytes, or generated tutorial/corpus assets

Representative files:

- `determinism_artifacts.test.ts` for artifact stability
- `cli/pr990_asm80_emitter_validation.test.ts` when external ASM80 compatibility is the contract

## Feature-area index

| Area                                       | Start with                                                                                                                                                                                                                                                           | Notes                                                                                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CLI behavior and artifact selection        | `cli/cli_contract_matrix.test.ts`, `cli/cli_failure_contract_matrix.test.ts`, `cli/cli_artifacts.test.ts`, `cli/cli_azm_smoke.test.ts`                                                                                                                               | Use `test/helpers/index.js` (barrel) or `test/helpers/cli.js` for end-to-end CLI execution; see [helpers/README.md](helpers/README.md).                                                                                |
| Parser dispatch and recovery               | `frontend/pr468_parser_dispatch_integration.test.ts`, `frontend/pr798_addr_expr_parser.test.ts`, `pr227_parser_toplevel_malformed_spans.test.ts`, `pr238_parser_malformed_decl_header_spans_matrix.test.ts`                                                                                                              | Use helper-level `frontend/pr476_parse_*.test.ts` files for isolated parser seams.                                                              |
| Grammar and token tables                   | `frontend/pr762_grammar_data_conformance.test.ts`, `frontend/pr250_parser_instruction_head_casing.test.ts`, `frontend/pr252_parser_register_token_canonicalization.test.ts`, `frontend/pr253_parser_control_cc_canonicalization.test.ts`, `frontend/pr578_legacy_syntax_warnings.test.ts`                                                                                                      | Good home for reserved-word and canonicalization changes.                                                                              |
| Semantics and layout                       | `semantics/semantics_layout.test.ts`, `semantics/semantics_layout_extra.test.ts`, `pr285_alias_init_parser_semantics_matrix.test.ts`, `pr980_local_alias_legality.test.ts`                                                                                           | Use these when type size, offsets, alias legality, or compile-time rules change.                                                       |
| Register care and AZMDoc contracts         | `test/registerCare/**`, `cli/register_care_cli.test.ts`, `registerCare/opExpansion.integration.test.ts`                                                                                                                                                              | Covers routine summaries, caller/callee contracts, annotations, and op-expanded call sites.                                             |
| Lowering helper seams                      | `lowering/pr509_*.test.ts`, `lowering/pr510_*.test.ts`, `lowering/pr511_*.test.ts`, `lowering/pr528_emission_core_helpers.test.ts`, `lowering/pr529_fixup_emission_helpers.test.ts`, `lowering/pr530_asm_utils_helpers.test.ts`, `lowering/pr531_value_materialization_helpers.test.ts`, `lowering/pr532_asm_instruction_lowering_integration.test.ts` | Prefer these before adding another broad compile test. |
| Layout constants and enums                 | `semantics/layout_constants_azm.test.ts`, `semantics/layout_cast_constants_azm.test.ts`, `frontend/azm_enum_constants.test.ts`                                                                                                                                       | Use for `sizeof`, `offset`, layout casts that fold to constants, type/union layout, and enum constants.                                |
| Encoder behavior                           | `pr24_isa_core.test.ts`, `backend/pr477_encode_*.test.ts`, `backend/pr468_encoder_dispatch_integration.test.ts`, `backend/pr694_encoder_registry_dispatch.test.ts`, `pr203_ld_diag_matrix.test.ts`, `pr240_isa_register_target_diag_matrix.test.ts`                   | Prefer direct encoder tests when lowering is not involved.                                                                             |
| Examples, smoke, and determinism           | `examples_compile.test.ts`, `smoke.test.ts`, `determinism_artifacts.test.ts`                                                                                                                                                                                          | Use for broad regressions and checked-in examples.                                                                                     |
| External backend compatibility             | `cli/pr990_asm80_emitter_validation.test.ts`, `pr991_asm80_comment_preservation.test.ts`                                                                                                                                                                               | Only use these when emitted artifact text or external-tool compatibility is the contract.                                              |
| Policy and infrastructure                  | `ci_change_classifier.test.ts`, `pr472_source_file_size_guard.test.ts`, `backend/pr241_d8m_contract_hardening.test.ts`                                                                                                                                               | For repo policy, CI classification, and artifact contract checks.                                                                      |

Inherited ZAX behavior is not a model for new AZM coverage. Tests whose only
purpose is generated frames, named sections, typed assignment/storage, ZAX
imports, or structured control should be deleted or rewritten as ASM80/AZM
tests.

## Where to put new tests

- Add the test next to the nearest existing feature cluster instead of creating a new naming family unless the behavior is genuinely new.
- New tests for lowering seams: prefer `test/lowering/` with the same `prNNN_*.test.ts` naming pattern when adding alongside migrated files.
- New parser helper or frontend-parser integration tests: prefer `test/frontend/` with the same `prNNN_*.test.ts` naming pattern when adding alongside migrated files.
- Keep CLI tests under `test/cli/` (`cli_*.test.ts` filenames). Do not bury CLI behavior in a lower-level integration file.
- Prefer helper-level files when a single extracted module owns the behavior.
- Prefer `compile(...)` integration coverage when the interaction between phases is the real risk.
- Prefer corpus or golden assertions only when checked-in bytes/text are the intended stable output.
- Put reusable compile/assertion helpers in `test/helpers/` or `test/test-helpers.ts`, not in ad hoc copies inside new tests.
