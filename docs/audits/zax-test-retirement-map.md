# ZAX Test Retirement Map

Status: audit, no deletion yet
Date: 2026-05-19

## Purpose

Classify tests inherited from ZAX so AZM can retire high-level behavior without
accidentally removing assembler foundation coverage.

This map is intentionally conservative. A test appearing here is not approved
for deletion. It is assigned to a bucket so later work can decide whether it
belongs in normal AZM CI, an AZM-focused rewritten form, a preserved ZAX
compatibility lane, or an archive branch.

## Categories

- **AZM foundation:** keep in normal CI.
- **AZM layout constants:** keep or adapt to exact layout-only semantics.
- **Ops:** keep if it validates AST-level op expansion.
- **ZAX compatibility:** preserve temporarily, but not part of AZM alpha.
- **Retirement candidate:** old high-level behavior with no AZM path.

## Classification rules

- Tests for ASM80 parsing, directive compatibility, includes, Z80 encoding,
  binary writers, diagnostics, register-care analysis, and AZMDoc are AZM
  foundation.
- Tests for `type`, records, unions, arrays, `sizeof`, `offsetof`, and explicit
  layout-cast expressions are AZM layout constants when they only protect
  compile-time layout facts.
- Tests for `op` declaration, matching, substitution, expansion diagnostics, and
  stack-policy checks are Ops. They need an AZM-safe syntax/policy decision, but
  they are not retirement candidates by default.
- Tests for `func`, generated frames, local `var`, typed arguments, typed calls,
  ZAX `import`, named `section`, structured `if`/`while`/`repeat`/`select`,
  `:=`, typed storage lowering, and implicit typed effective-address lowering
  are ZAX compatibility or retirement candidates.
- Tests that mix a kept feature with old high-level lowering should be split
  before any deletion. Preserve the assembler or layout assertion separately
  from the high-level ZAX behavior.

## Test map

| Test file                                                          | Primary feature                    | Category             | Notes                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| `test/registerCare/carriers.test.ts`                               | register carrier decomposition     | AZM foundation       | Keep; supports register-care contracts.                                                 |
| `test/registerCare/effects.test.ts`                                | Z80 register/flag effects          | AZM foundation       | Keep; core safety model.                                                                |
| `test/registerCare/integration.test.ts`                            | register-care integration          | AZM foundation       | Keep; protects source contracts and reports.                                            |
| `test/registerCare/liveness.test.ts`                               | caller-side liveness               | AZM foundation       | Keep; key modern AZM feature.                                                           |
| `test/registerCare/programModel.test.ts`                           | routine boundaries and labels      | AZM foundation       | Keep; protects `@Routine:` analysis policy.                                             |
| `test/registerCare/report.test.ts`                                 | register-care reporting            | AZM foundation       | Keep; protects compact AZMDoc contracts.                                                |
| `test/registerCare/smartComments.test.ts`                          | AZMDoc contract parsing            | AZM foundation       | Keep; parser for generated and legacy metadata.                                         |
| `test/registerCare/summary.test.ts`                                | routine summaries                  | AZM foundation       | Keep; avoids false contract inference.                                                  |
| `test/registerCare/tooling.test.ts`                                | register-care tool API             | AZM foundation       | Keep; tooling-facing surface.                                                           |
| `test/asm80/asm80_align_directive.test.ts`                         | `.align` compatibility             | AZM foundation       | Keep; ASM80-family directive baseline.                                                  |
| `test/asm80/asm80_baseline_workflow.test.ts`                       | ASM80 baseline workflow            | AZM foundation       | Keep; corpus guardrail.                                                                 |
| `test/asm80/asm80_directives_integration.test.ts`                  | classic directives                 | AZM foundation       | Keep; raw assembler surface.                                                            |
| `test/asm80/asm80_equ_aliases.test.ts`                             | `EQU` alias behavior               | AZM foundation       | Keep; needed by MON3/Tetro style source.                                                |
| `test/asm80/asm80_string_directives.test.ts`                       | `.cstr`/`.pstr`/`.istr`            | AZM foundation       | Keep; accepted ASM80-family additions.                                                  |
| `test/asm80/mon3_acceptance.test.ts`                               | MON3 corpus parity                 | AZM foundation       | Keep as optional/local guard.                                                           |
| `test/asm80/mon3_opcode_gap.test.ts`                               | MON3 opcode coverage               | AZM foundation       | Keep; guards encoder gaps.                                                              |
| `test/asm80/tetro_acceptance.test.ts`                              | Tetro/Pacmo corpus parity          | AZM foundation       | Keep as optional/local guard.                                                           |
| `test/frontend/asm80_classic_line.test.ts`                         | classic line parser                | AZM foundation       | Keep; `.asm`/`.z80` input path.                                                         |
| `test/frontend/asm80_classic_module.test.ts`                       | classic module parser              | AZM foundation       | Keep; source-mode foundation.                                                           |
| `test/frontend/directiveAliases.test.ts`                           | directive alias policy             | AZM foundation       | Keep; compatibility without macros.                                                     |
| `test/moduleLoader_asm80_include.test.ts`                          | ASM80 include loading              | AZM foundation       | Keep; include resolution baseline.                                                      |
| `test/backend/pr24_isa_core.test.ts`                               | core Z80 encoding                  | AZM foundation       | Keep; machine-code foundation.                                                          |
| `test/backend/pr477_encode_ld_family.test.ts`                      | `LD` encoder family                | AZM foundation       | Keep; broad Z80 coverage.                                                               |
| `test/backend/pr477_encode_control_family.test.ts`                 | jump/call/return encoding          | AZM foundation       | Keep; branch encoding coverage.                                                         |
| `test/backend/pr477_encode_io_family.test.ts`                      | I/O instruction encoding           | AZM foundation       | Keep; Z80 hardware surface.                                                             |
| `test/backend/pr991_asm80_comment_preservation.test.ts`            | comment/lowered ASM preservation   | AZM foundation       | Keep; important for source-to-ASM output.                                               |
| `test/cli/register_care_cli.test.ts`                               | register-care CLI switches         | AZM foundation       | Keep; public safety tooling.                                                            |
| `test/cli/cli_contract_matrix.test.ts`                             | CLI artifact contract              | AZM foundation       | Keep; public command behavior.                                                          |
| `test/pr8_sizeof.test.ts`                                          | `sizeof(Type)` expressions         | AZM layout constants | Keep/adapt; should move toward exact layout-only semantics.                             |
| `test/semantics/semantics_layout.test.ts`                          | record/array layout semantics      | AZM layout constants | Keep/adapt; preserve exact packed layout assertions.                                    |
| `test/semantics/semantics_layout_extra.test.ts`                    | extra layout edge cases            | AZM layout constants | Keep/adapt; review for rounded-size assumptions.                                        |
| `test/semantics/layout_edge_cases.test.ts`                         | recursive/invalid layouts          | AZM layout constants | Keep/adapt; useful for robust layout diagnostics.                                       |
| `test/pr50_union_field_access.test.ts`                             | union field offsets/access         | AZM layout constants | Split; keep union offset facts, retire hidden access lowering if present.               |
| `test/pr713_packed_top_level_arrays.test.ts`                       | packed arrays                      | AZM layout constants | Keep/adapt; aligns with exact-size array policy.                                        |
| `test/pr819_exact_scale_lowering.test.ts`                          | exact scale/index lowering         | AZM layout constants | Review; preserve constant scale facts, retire hidden runtime lowering.                  |
| `test/pr820_exact_size_cleanup.test.ts`                            | exact size cleanup                 | AZM layout constants | Keep/adapt; likely important for removing rounded storage size.                         |
| `test/frontend/azm_source_mode_deprecations.test.ts`               | AZM warnings for ZAX constructs    | AZM foundation       | Keep; controls retirement pressure.                                                     |
| `test/frontend/pr476_parse_op_helpers.test.ts`                     | op parser helper coverage          | Ops                  | Keep; classify under AZM-safe op subset.                                                |
| `test/lowering/pr504_op_matching_helpers.test.ts`                  | op overload matching               | Ops                  | Keep; AST-level abstraction mechanism.                                                  |
| `test/lowering/pr510_op_expansion_execution_helpers.test.ts`       | op expansion execution             | Ops                  | Keep; needs AZM-safe boundaries.                                                        |
| `test/lowering/pr510_op_expansion_orchestration_helpers.test.ts`   | op expansion orchestration         | Ops                  | Keep; protects recursion/cycle machinery.                                               |
| `test/lowering/pr510_op_substitution_helpers.test.ts`              | op operand substitution            | Ops                  | Keep; AST substitution rather than text macros.                                         |
| `test/pr268_op_diagnostics_matrix.test.ts`                         | op diagnostics                     | Ops                  | Keep; useful for a constrained op feature.                                              |
| `test/pr271_op_stack_policy_alignment.test.ts`                     | op stack policy                    | Ops                  | Keep under review; stack safety still matters for ops.                                  |
| `test/pr104_lowering_op_control_interactions.test.ts`              | ops mixed with structured control  | ZAX compatibility    | Split later; op facts may survive, structured-control interaction likely not AZM alpha. |
| `test/frontend/pr689_callable_header_parser.test.ts`               | callable header parser             | ZAX compatibility    | Preserve temporarily; tied to `func`/old callable declarations.                         |
| `test/frontend/pr638_return_regs_canonicalization.test.ts`         | function return register lists     | ZAX compatibility    | Preserve temporarily; not current AZM register-care syntax.                             |
| `test/frontend/pr171_func_missing_asm_recovery.test.ts`            | malformed `func` recovery          | ZAX compatibility    | Keep only in compatibility lane.                                                        |
| `test/frontend/pr192_func_var_end_block.test.ts`                   | `func` plus `var` block parsing    | ZAX compatibility    | Keep only in compatibility lane.                                                        |
| `test/pr102_lowering_frame_invariants.test.ts`                     | generated function frames          | ZAX compatibility    | Preserve temporarily; candidate for archive once frame lowering is retired.             |
| `test/pr103_lowering_mixed_return_paths.test.ts`                   | mixed generated return paths       | ZAX compatibility    | Preserve temporarily; old frame/retcc lowering.                                         |
| `test/pr330_frames_epilogue_and_access.test.ts`                    | frames, epilogues, access          | ZAX compatibility    | Preserve temporarily; high-level frame machinery.                                       |
| `test/pr364_call_with_arg_and_local_regression.test.ts`            | args/locals baseline               | ZAX compatibility    | Preserve temporarily; old function-frame behavior.                                      |
| `test/pr365_args_locals_basics_regression.test.ts`                 | arguments and locals               | ZAX compatibility    | Preserve temporarily; old function-frame behavior.                                      |
| `test/pr405_byte_call_scalar_arg.test.ts`                          | typed scalar call arguments        | ZAX compatibility    | Preserve temporarily; not AZM-native calling convention.                                |
| `test/pr320_extern_call_preservation.test.ts`                      | typed extern call preservation     | ZAX compatibility    | Preserve temporarily; replace with AZMDoc `.azmi` contracts where possible.             |
| `test/pr159_extern_base_block_unsupported.test.ts`                 | extern base blocks                 | ZAX compatibility    | Preserve temporarily; external AZM interfaces should use `.azmi`.                       |
| `test/pr163_import_extern_base_relative_call.test.ts`              | ZAX import plus extern base calls  | ZAX compatibility    | Preserve temporarily; native AZM uses textual includes instead.                         |
| `test/pr242_import_resolution_diag_spans.test.ts`                  | ZAX import diagnostics             | ZAX compatibility    | Preserve temporarily; native AZM should reject ZAX import.                              |
| `test/pr243_module_id_collision_diag_span.test.ts`                 | ZAX module identity diagnostics    | ZAX compatibility    | Preserve temporarily; native AZM should not grow module identity rules.                 |
| `test/frontend/pr158_extern_block_multifunc.test.ts`               | extern function blocks             | ZAX compatibility    | Preserve temporarily; old typed extern declarations.                                    |
| `test/frontend/pr184_func_extern_param_return_diag_matrix.test.ts` | func/extern diagnostics            | ZAX compatibility    | Preserve temporarily; old callable syntax diagnostics.                                  |
| `test/pr848_break_continue_integration.test.ts`                    | structured loop escape             | Retirement candidate | High-level structured control is not an AZM alpha goal.                                 |
| `test/pr738_select_case_ranges.test.ts`                            | structured `select` lowering       | Retirement candidate | Old high-level control lowering; archive unless ops need a piece split out.             |
| `test/pr219_lowering_retcc_structured_control_matrix.test.ts`      | retcc through structured control   | Retirement candidate | Old structured lowering plus generated return paths.                                    |
| `test/pr220_lowering_retcc_ifelse_repeat_matrix.test.ts`           | retcc with `if`/`repeat`           | Retirement candidate | Old high-level control flow behavior.                                                   |
| `test/pr863_assignment_lowering.test.ts`                           | typed `:=` lowering                | Retirement candidate | Hidden typed memory transfer; outside AZM layout-constant scope.                        |
| `test/pr863_assignment_byte_widening_integration.test.ts`          | assignment widening                | Retirement candidate | Old assignment semantics.                                                               |
| `test/pr869_assignment_reg8_lowering.test.ts`                      | reg8 assignment lowering           | Retirement candidate | Old typed assignment behavior.                                                          |
| `test/pr875_assignment_ixiy_integration.test.ts`                   | IX/IY assignment lowering          | Retirement candidate | Old typed assignment behavior.                                                          |
| `test/pr887_assignment_half_index_lowering.test.ts`                | half-index assignment lowering     | Retirement candidate | Old typed assignment behavior.                                                          |
| `test/pr896_assignment_ea_ea_integration.test.ts`                  | path-to-path assignment            | Retirement candidate | Hidden typed transfer; not assembly-first.                                              |
| `test/frontend/pr862_assignment_parser.test.ts`                    | assignment parser                  | Retirement candidate | Parser support may remain only in `.zax` compatibility mode.                            |
| `test/frontend/pr895_assignment_ea_ea_parser.test.ts`              | EA assignment parser               | Retirement candidate | Old high-level syntax.                                                                  |
| `test/pr1049_record_named_init_data_lowering.test.ts`              | typed record data initializers     | Retirement candidate | Keep layout facts elsewhere; old typed data lowering should be retired.                 |
| `test/pr51_data_inferred_array_len.test.ts`                        | typed `data` inferred array length | Retirement candidate | Replace with explicit `.db`/`.ds` plus layout constants.                                |
| `test/frontend/pr611_parser_data_marker_enforcement.test.ts`       | data marker enforcement            | Retirement candidate | Old typed data grammar.                                                                 |
| `test/pr3_var_duplicates.test.ts`                                  | typed variable duplicates          | Retirement candidate | Old `var`/storage symbol behavior.                                                      |
| `test/frontend/pr189_globals_parser_matrix.test.ts`                | `globals` parser matrix            | Retirement candidate | Old typed global storage grammar.                                                       |
| `test/pr254_module_var_renamed_globals.test.ts`                    | module `var` renamed globals       | Retirement candidate | Old storage declaration migration.                                                      |
| `test/semantics/pr849_local_init_consts.test.ts`                   | local `var` initializers           | Retirement candidate | Old local storage machinery; constant expression pieces should be split if useful.      |
| `test/language-tour/*.zax`                                         | ZAX course/language examples       | ZAX compatibility    | Preserve as historical compatibility corpus, not AZM alpha teaching material.           |
| `test/codegen-corpus/*.zax`                                        | generated ZAX lowering corpus      | ZAX compatibility    | Preserve temporarily; use to identify deletion blast radius before archive.             |

## First quarantine batch

Inventory command:

```bash
rg -n "func |export func|:=|section code|section data|globals|extern func|\bif\b|\bwhile\b|\brepeat\b|\bselect\b" test src docs/audits
```

The broad scan is intentionally noisy because it includes source implementation
and test prose, but the test-file hits confirm the high-level ZAX surface is
still concentrated around these forbidden features:

| Forbidden feature               | Test-file hits | First-pass examples                                                             |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------- |
| `func` / `export func`          | 65             | callable parser/recovery, frame lowering, old CLI artifact cases                |
| `:=`                            | 21             | assignment parser/lowering, typed storage migration, typed EA integration       |
| `section code` / `section data` | 26             | named-section parser/lowering, old placed ZAX fixtures                          |
| `globals`                       | 27             | typed global storage parser/lowering and migration tests                        |
| `extern func`                   | 10             | typed extern parser diagnostics and call-preservation tests                     |
| ZAX `import` / module identity  | 3              | import resolution diagnostics, imported extern base calls, module id collisions |
| structured `if`                 | 73             | parser recovery, structured lowering, retcc/frame interactions                  |
| structured `while`              | 20             | structured loop lowering and stack diagnostics                                  |
| structured `repeat`             | 8              | repeat/until lowering and stack diagnostics                                     |
| structured `select`             | 11             | select lowering, parser recovery, retcc interactions                            |

Current runner state: this checkout has `npm run test:azm:alpha` and
`npm run test:zax:compat`, backed by `scripts/dev/run-zax-compat-tests.mjs`.
The safe first quarantine batch is limited to files already named in that
compatibility runner.

First compatibility-only batch:

| Test file                                               | Forbidden dependency              | Quarantine status    | Notes                                                       |
| ------------------------------------------------------- | --------------------------------- | -------------------- | ----------------------------------------------------------- |
| `test/pr770_typed_reinterpretation_integration.test.ts` | typed reinterpretation paths      | In `test:zax:compat` | Hidden typed EA behavior; not AZM-native layout constants.  |
| `test/pr781_ld_typed_storage_migration_diag.test.ts`    | typed storage migration           | In `test:zax:compat` | Migration diagnostics for old typed storage.                |
| `test/pr863_assignment_lowering.test.ts`                | typed `:=` lowering               | In `test:zax:compat` | Unit-level lowering helper tests for hidden typed transfer. |
| `test/pr869_assignment_reg8_integration.test.ts`        | register typed `:=` integration   | In `test:zax:compat` | `.zax` compatibility behavior.                              |
| `test/pr875_assignment_ixiy_integration.test.ts`        | IX/IY typed `:=` integration      | In `test:zax:compat` | `.zax` compatibility behavior.                              |
| `test/pr887_assignment_half_index_integration.test.ts`  | half-index typed `:=` integration | In `test:zax:compat` | `.zax` compatibility behavior.                              |
| `test/semantics/pr895_assignment_acceptance.test.ts`    | assignment semantics acceptance   | In `test:zax:compat` | `.zax` compatibility behavior.                              |
| `test/pr896_assignment_ea_ea_integration.test.ts`       | typed EA-to-EA assignment         | In `test:zax:compat` | Hidden typed transfer behavior.                             |
| `test/pr1049_record_named_init_data_lowering.test.ts`   | typed record data initializers    | In `test:zax:compat` | Old typed data lowering; keep layout facts elsewhere.       |
| `test/lowering/pr1334_typed_aggregate_local.test.ts`    | typed aggregate locals            | In `test:zax:compat` | Old local aggregate lowering.                               |
| `test/lowering/pr1340_aggregate_param.test.ts`          | typed aggregate parameters        | In `test:zax:compat` | Old typed call/frame lowering.                              |
| `test/lowering/pr1344_addr_of_type.test.ts`             | address-of typed storage          | In `test:zax:compat` | Old typed storage/addressing behavior.                      |

Next compatibility candidates, not yet covered by the runner:

| Test file                                                  | Forbidden dependency                        | Status            | Notes                                                                          |
| ---------------------------------------------------------- | ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `test/pr163_import_extern_base_relative_call.test.ts`      | ZAX `import` graph                          | Not yet in runner | Native AZM uses textual include; old import behavior belongs in compatibility. |
| `test/pr242_import_resolution_diag_spans.test.ts`          | ZAX import diagnostics                      | Not yet in runner | Add before deleting import-resolution diagnostics.                             |
| `test/pr243_module_id_collision_diag_span.test.ts`         | ZAX module identity diagnostics             | Not yet in runner | Add before deleting module identity behavior.                                  |
| `test/frontend/pr638_return_regs_canonicalization.test.ts` | function return register lists              | Not yet in runner | Old callable metadata; not current native register-care syntax.                |
| `test/frontend/pr689_callable_header_parser.test.ts`       | callable header parser                      | Not yet in runner | Tied to old `func`/callable declarations.                                      |
| `test/frontend/pr171_func_missing_asm_recovery.test.ts`    | malformed `func` recovery                   | Not yet in runner | `.zax` fixture only; old parser recovery.                                      |
| `test/frontend/pr192_func_var_end_block.test.ts`           | `func` with local `var` block               | Not yet in runner | `.zax` fixture only; old function-body parser/lowering behavior.               |
| `test/pr102_lowering_frame_invariants.test.ts`             | generated frames with `if`/`while`/`repeat` | Not yet in runner | `.zax` fixtures only; old stack/frame diagnostics.                             |
| `test/pr103_lowering_mixed_return_paths.test.ts`           | generated return paths with structured `if` | Not yet in runner | `.zax` fixtures only; old ret/retcc frame behavior.                            |
| `test/pr330_frames_epilogue_and_access.test.ts`            | frame slots and synthetic epilogue          | Not yet in runner | `.zax` fixtures only; generated frame machinery.                               |
| `test/pr364_call_with_arg_and_local_regression.test.ts`    | typed args and locals                       | Not yet in runner | `.zax` fixture only; old call/frame lowering stability test.                   |
| `test/pr365_args_locals_basics_regression.test.ts`         | typed args and locals                       | Not yet in runner | `.zax` fixture only; old call/frame lowering stability test.                   |
| `test/pr405_byte_call_scalar_arg.test.ts`                  | typed scalar call argument                  | Not yet in runner | `.zax` fixture only; not AZM-native calling convention.                        |
| `test/pr738_select_case_ranges.test.ts`                    | structured `select` lowering                | Not yet in runner | `.zax` fixtures only; retirement candidate.                                    |
| `test/pr848_break_continue_integration.test.ts`            | structured `while`/`repeat` escape lowering | Not yet in runner | `.zax` fixtures only; retirement candidate.                                    |

No compiler implementation files are approved for deletion by this batch. The
next safe action is to keep the compatibility runner green, then add the next
candidate set explicitly before moving, skipping, or deleting any tests.

## High-risk split candidates

These tests protect at least one useful AZM concept but are entangled with old
ZAX lowering. They should be split before any retirement PR:

1. `test/pr50_union_field_access.test.ts`: union layout is useful; hidden field
   access lowering is not.
2. `test/pr819_exact_scale_lowering.test.ts`: exact scaling is useful when it
   produces constants; runtime typed indexing is not.
3. `test/pr104_lowering_op_control_interactions.test.ts`: op expansion is
   useful; structured control interaction is not alpha scope.
4. `test/pr1049_record_named_init_data_lowering.test.ts`: record field order and
   offsets are useful; typed data initializer lowering is not.
5. `test/semantics/pr849_local_init_consts.test.ts`: constant-expression
   evaluation is useful; local `var` initializer semantics are not.

## First ZAX Compatibility Runner

The first explicit compatibility lane is `npm run test:zax:compat`. It keeps the
following inherited high-level `.zax` tests out of the default AZM alpha lane:

- `test/pr770_typed_reinterpretation_integration.test.ts`
- `test/pr781_ld_typed_storage_migration_diag.test.ts`
- `test/pr863_assignment_lowering.test.ts`
- `test/pr869_assignment_reg8_integration.test.ts`
- `test/pr875_assignment_ixiy_integration.test.ts`
- `test/pr887_assignment_half_index_integration.test.ts`
- `test/semantics/pr895_assignment_acceptance.test.ts`
- `test/pr896_assignment_ea_ea_integration.test.ts`
- `test/pr1049_record_named_init_data_lowering.test.ts`
- `test/lowering/pr1334_typed_aggregate_local.test.ts`
- `test/lowering/pr1340_aggregate_param.test.ts`
- `test/lowering/pr1344_addr_of_type.test.ts`

This first runner is intentionally narrow. It covers typed high-level ZAX
behavior first; it does not yet cover every import, function-frame,
named-section, or structured-control test that should eventually live in the
compatibility lane.

## Recommended next actions

1. Expand `npm run test:zax:compat` with the next import/function/section
   compatibility batch before deleting those parser or lowering paths.
2. Split the high-risk candidates above into AZM foundation/layout tests and
   ZAX compatibility tests.
3. Move `language-tour` and `codegen-corpus` expectations behind a preserved
   ZAX compatibility lane before deleting lowering code.
4. Do not remove any test until its row in this map has been reviewed and either
   migrated, archived, or explicitly accepted as obsolete.
