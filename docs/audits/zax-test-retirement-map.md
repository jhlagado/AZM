# ZAX Test Retirement Map

Status: audit, no deletion yet
Date: 2026-05-20

## Purpose

This map separates AZM guardrails from inherited ZAX tests that still protect
old high-level language behavior. The goal is to stop default AZM validation
from depending on old ZAX features while keeping those tests visible until each
feature is deleted or rewritten.

No test should be deleted just because it appears here. A retirement row means:
keep it out of AZM alpha guardrails, run it through `npm run test:zax:retirement`,
and decide later whether the behavior has an AZM replacement.

## Buckets

- **AZM foundation:** assembler, includes, diagnostics, Z80 encoding, writers,
  register-care analysis, AZMDoc, and public CLI/API behavior. Keep in normal
  AZM validation.
- **AZM layout constants:** `type`, records, unions, arrays, `sizeof`, `offset`,
  and layout-cast expressions when the test only protects compile-time layout
  facts. Keep or rewrite toward layout-only semantics.
- **AZM enum constants:** qualified enum members used as compile-time integer
  constants. Keep as constant namespaces, not runtime type semantics.
- **Ops:** `op` declaration, matching, substitution, expansion diagnostics, and
  stack-policy checks. Keep under an AZM-safe op policy unless the test depends
  on structured ZAX control.
- **ZAX retirement runner:** inherited high-level behavior that is not an AZM
  alpha promise and is now isolated in `npm run test:zax:retirement`.
- **Split before retiring:** tests that mix a useful AZM/layout fact with hidden
  ZAX lowering. Split the useful assertion before deleting the high-level path.
- **Review later:** likely high-level ZAX tests that still need a smaller audit
  before moving into the runner.

## Current Script Boundaries

`npm test` and `npm run test:azm:alpha` are intentionally assembler-focused. In this checkout they
run the build plus register-care, AZM native parser/boundary tests, AZM layout
constant tests, directive aliases, AZM/ASM80 includes, and ASM80 directive
guardrails. It does not run ZAX import, `func`, named-section lowering, typed
assignment, generated frames, typed call lowering, or structured control
lowering tests.

CI coverage core uses the same boundary: it excludes the explicit
`scripts/dev/zax-retirement-test-list.mjs` set. That keeps old high-level ZAX
behavior measurable without letting it define whether AZM is green.

`npm run test:zax:retirement` is the explicit lane for old high-level ZAX tests.
Adding a test to that runner does not endorse the feature for AZM; it keeps the
old behavior measurable while removal work proceeds.

`npm run test:all` runs the broad historical Vitest suite when a full sweep is
useful.

## Retirement Runner Coverage

These tests are already isolated in `scripts/dev/run-zax-retirement-tests.mjs`.

| Test file | High-level dependency | Retirement note |
| --- | --- | --- |
| `test/moduleLoader_zax_import.test.ts` | ZAX `import` graph | Old module loader behavior; native AZM uses textual include paths. |
| `test/pr163_import_extern_base_relative_call.test.ts` | imported extern base calls | Old import plus typed extern call lowering. |
| `test/pr242_import_resolution_diag_spans.test.ts` | ZAX import diagnostics | Keep only while removing or rewriting import diagnostics. |
| `test/pr243_module_id_collision_diag_span.test.ts` | ZAX module identity | Native AZM should not grow module-id collision rules. |
| `test/zax_import_visibility_scaffolding.test.ts` | ZAX export/import visibility | Old import-graph visibility behavior; native AZM includes source text instead. |
| `test/zax_import_visible_symbol_resolver.test.ts` | qualified exported symbol resolver | Old import-graph visibility resolver; enum qualification remains covered elsewhere. |
| `test/frontend/pr156_export_whitespace_forms.test.ts` | `export` parser acceptance | Native AZM rejects `export`; keep only while old `.zax` parser remains. |
| `test/frontend/pr157_export_malformed_matrix.test.ts` | malformed `export` diagnostics | Old parser diagnostics for module visibility syntax. |
| `test/frontend/pr638_return_regs_canonicalization.test.ts` | `func` return register metadata | Old callable AST shape, not current register-care syntax. |
| `test/frontend/pr689_callable_header_parser.test.ts` | callable header parser | Shared old `func`/`op` header helper; split op-only coverage if needed. |
| `test/frontend/pr171_func_missing_asm_recovery.test.ts` | malformed `func` recovery | Old parser recovery for function declarations. |
| `test/frontend/pr192_func_var_end_block.test.ts` | `func` plus local `var` block | Old function-body parser and lowering path. |
| `test/pr102_lowering_frame_invariants.test.ts` | generated frames with structured control | Old locals/frame stack diagnostics. |
| `test/pr103_lowering_mixed_return_paths.test.ts` | generated return paths | Old mixed `ret`/`ret cc` frame behavior. |
| `test/pr330_frames_epilogue_and_access.test.ts` | frame slots and synthetic epilogues | High-level frame machinery. |
| `test/pr364_call_with_arg_and_local_regression.test.ts` | typed args and locals | Old call/frame lowering stability test. |
| `test/pr365_args_locals_basics_regression.test.ts` | typed args and locals | Old call/frame lowering stability test. |
| `test/pr405_byte_call_scalar_arg.test.ts` | typed scalar call argument | Old typed calling convention, not AZM-native. |
| `test/pr770_typed_reinterpretation_integration.test.ts` | typed reinterpretation paths | Hidden typed effective-address behavior. |
| `test/pr781_ld_typed_storage_migration_diag.test.ts` | typed storage migration | Old migration diagnostics for `:=` and typed storage. |
| `test/pr863_assignment_lowering.test.ts` | typed `:=` lowering | Hidden typed memory transfer. |
| `test/pr869_assignment_reg8_integration.test.ts` | register typed `:=` integration | Old assignment lowering. |
| `test/pr875_assignment_ixiy_integration.test.ts` | IX/IY typed `:=` integration | Old assignment lowering. |
| `test/pr887_assignment_half_index_integration.test.ts` | half-index typed `:=` integration | Old assignment lowering. |
| `test/semantics/pr895_assignment_acceptance.test.ts` | assignment acceptance | Old typed assignment semantics. |
| `test/pr896_assignment_ea_ea_integration.test.ts` | typed EA-to-EA assignment | Hidden typed transfer behavior. |
| `test/pr1049_record_named_init_data_lowering.test.ts` | typed record data initializers | Keep layout facts elsewhere; retire typed data lowering. |
| `test/lowering/boundary_conditions.test.ts` | generated frames and typed lowering stress cases | Old lowering boundary coverage, not native AZM behavior. |
| `test/lowering/pr508_runtime_immediates_helpers.test.ts` | runtime immediate materialization for typed EA | Helper coverage for old typed lowering. |
| `test/lowering/pr509_lower_ld_integration.test.ts` | typed `ld` lowering | Old typed storage/addressing integration. |
| `test/lowering/pr1338_typed_local_addr_arg_call.test.ts` | typed local address arguments | Old typed call/frame lowering. |
| `test/pr273_call_scalar_value_runtime_index.test.ts` | typed call args with runtime indexes | Old typed call and direct EA budget diagnostics. |
| `test/pr283_hidden_lowering_risk_matrix.test.ts` | hidden typed lowering risk matrix | Useful risk history, but all examples use old ZAX lowering. |
| `test/pr289_place_expression_contexts.test.ts` | typed place expression contexts | Old typed field/element lowering and op EA matching. |
| `test/pr292_local_var_initializer_enforcement.test.ts` | local `var` initialization | Old function-local variable lowering. |
| `test/pr405_byte_global_non_a_symbols.test.ts` | typed byte scalar accessors | Old typed storage fast paths. |
| `test/pr405_byte_global_scalar_symbols.test.ts` | typed byte scalar accessors | Old typed storage fast paths. |
| `test/pr405_byte_indexed_templates.test.ts` | typed byte indexed templates | Old typed runtime indexing. |
| `test/pr405_byte_scalar_fast_paths.test.ts` | typed byte scalar fast paths | Old typed storage lowering. |
| `test/pr405_retcc_cleanup_positive.test.ts` | typed `ret cc` cleanup | Old generated frame cleanup paths. |
| `test/pr406_word_eaw_matrix.test.ts` | typed word EAW matrix | Old runtime typed addressing templates. |
| `test/pr406_word_edge_cases.test.ts` | typed word edge cases | Old typed storage lowering. |
| `test/pr406_word_hl_fallback_store.test.ts` | typed word fallback store | Old runtime typed addressing templates. |
| `test/pr406_word_ix_fallback_load.test.ts` | typed word fallback load | Old runtime typed addressing templates. |
| `test/pr406_word_memmove_regression.test.ts` | typed word memory moves | Old typed storage lowering. |
| `test/pr406_word_scalar_accessors.test.ts` | typed word scalar accessors | Old typed storage fast paths. |
| `test/pr406_word_store_de_regression.test.ts` | typed word stores | Old typed storage lowering. |
| `test/pr406_word_store_regression.test.ts` | typed word stores | Old typed storage lowering. |
| `test/pr406_word_templates_regression.test.ts` | typed word templates | Old runtime typed addressing templates. |
| `test/pr407_addressing_regression.test.ts` | typed addressing regression | Old runtime typed indexing. |
| `test/pr407_word_regression.test.ts` | typed word indexing regression | Old runtime typed indexing. |
| `test/pr412_runtime_index_array_word.test.ts` | typed runtime array indexing | Old runtime typed indexing. |
| `test/pr412_runtime_index_matrix.test.ts` | typed runtime index matrix | Old runtime typed indexing. |
| `test/pr446_virtual_reg16_transfers.test.ts` | virtual register transfer lowering | Old typed lowering transport detail. |
| `test/pr468_typed_step_integration.test.ts` | typed `step` lowering | Old typed step integration. |
| `test/pr900_step_integration.test.ts` | typed `step` lowering | Old typed step integration. |
| `test/lowering/pr1334_typed_aggregate_local.test.ts` | typed aggregate locals | Old aggregate local lowering. |
| `test/lowering/pr1340_aggregate_param.test.ts` | typed aggregate parameters | Old typed call/frame lowering. |
| `test/lowering/pr1344_addr_of_type.test.ts` | address-of typed storage | Old typed storage/addressing behavior. |
| `test/pr8_sizeof.test.ts` | `sizeof` through `.zax` function wrappers | Native `.azm` `sizeof` coverage now lives in `test/semantics/layout_constants_azm.test.ts`. |
| `test/pr738_select_case_ranges.test.ts` | structured `select` lowering | Structured control is outside AZM alpha scope. |
| `test/pr452_conditional_jump_trace_placeholders.test.ts` | structured-control trace placeholders | Old structured control lowering diagnostics. |
| `test/pr848_break_continue_integration.test.ts` | structured loop escape lowering | Structured control is outside AZM alpha scope. |

## AZM Foundation To Keep

These areas should remain in normal validation unless a later audit finds a
specific high-level dependency:

- `test/registerCare/**`
- `test/asm80/**`
- `test/backend/pr24_isa_core.test.ts`
- `test/backend/pr477_encode_*`
- `test/backend/pr991_asm80_comment_preservation.test.ts`
- `test/frontend/asm80_classic_line.test.ts`
- `test/frontend/asm80_classic_module.test.ts`
- `test/frontend/azm_flat_module_asm.test.ts`
- `test/frontend/azm_native_boundary.test.ts`
- `test/frontend/azm_native_top_level_parser.test.ts`
- `test/frontend/azm_source_mode_removals.test.ts`
- `test/frontend/directiveAliases.test.ts`
- `test/frontend/azm_enum_constants.test.ts`
- `test/moduleLoader_asm80_include.test.ts`
- `test/moduleLoader_azm_include.test.ts`
- `test/cli/register_care_cli.test.ts`
- `test/cli/cli_contract_matrix.test.ts`
- `test/public_api_surface.test.ts`

## AZM Layout Constants To Keep Or Adapt

These tests protect useful layout facts, but they should avoid requiring hidden
runtime typed lowering:

| Test file | Useful AZM fact | Caution |
| --- | --- | --- |
| `test/semantics/semantics_layout.test.ts` | record/array layout | Preserve exact packed layout assertions. |
| `test/semantics/semantics_layout_extra.test.ts` | layout edge cases | Review rounded-size assumptions. |
| `test/semantics/layout_edge_cases.test.ts` | invalid/recursive layouts | Keep diagnostics. |
| `test/semantics/layout_cast_constants_azm.test.ts` | explicit layout casts | Keep AZM-native constant behavior. |
| `test/semantics/layout_constants_azm.test.ts` | layout constants | Keep AZM-native constant behavior. |
| `test/pr713_packed_top_level_arrays.test.ts` | packed arrays | Aligns with exact-size array policy. |
| `test/pr820_exact_size_cleanup.test.ts` | exact storage sizes | Useful for removing rounded storage size. |

## Ops To Keep Under Review

Ops are not retirement candidates by default. They should stay, or be rewritten,
around an AZM-safe policy:

- `test/frontend/pr476_parse_op_helpers.test.ts`
- `test/lowering/pr504_op_matching_helpers.test.ts`
- `test/lowering/pr510_op_expansion_execution_helpers.test.ts`
- `test/lowering/pr510_op_expansion_orchestration_helpers.test.ts`
- `test/lowering/pr510_op_substitution_helpers.test.ts`
- `test/pr268_op_diagnostics_matrix.test.ts`
- `test/pr271_op_stack_policy_alignment.test.ts`
- `test/registerCare/opExpansion.integration.test.ts`

## Quarantined Split Candidates

These tests are risky because each protects at least one useful concept while
also depending on old ZAX lowering. They are now in the retirement runner so
they cannot block the default AZM gate while the useful facts are split out:

| Test file | Keep | Retire or rewrite |
| --- | --- | --- |
| `test/pr50_union_field_access.test.ts` | union field offsets/layout | hidden field access lowering |
| `test/pr819_exact_scale_lowering.test.ts` | exact scale constants | runtime typed indexing |
| `test/semantics/pr849_local_init_consts.test.ts` | constant-expression checks | local `var` initializer machinery |
| `test/frontend/pr689_callable_header_parser.test.ts` | possible op header helper behavior | old `func` callable metadata |

Native AZM guardrails now cover part of this split:

- `test/semantics/layout_constants_azm.test.ts` covers union size/offset facts,
  exact non-power-of-two array layout constants, and named constant expressions
  without typed storage or local `var` initializers.
- `test/registerCare/opExpansion.integration.test.ts` covers op expansion in
  flat `.azm` source, including stack-effect visibility, without structured
  control wrappers. The old `test/pr104_lowering_op_control_interactions.test.ts`
  retirement test was deleted after this coverage landed because it only
  asserted that diagnostic count was greater than or equal to zero.

The original ZAX tests remain in the retirement runner until the old lowering
subsystems are deleted or each remaining fact has an AZM-native replacement.

## Quarantined Parser And Corpus Review Candidates

These are high-level ZAX tests already outside the normal AZM gate. They remain
visible because each still needs a narrower split decision, AZM-native rejection
test, or deletion decision:

| Test file | Suspected dependency | Why not moved now |
| --- | --- | --- |
| `test/pr159_extern_base_block_unsupported.test.ts` | typed extern base blocks | Negative diagnostic may become native rejection coverage. |
| `test/pr320_extern_call_preservation.test.ts` | typed extern call preservation | Could become AZMDoc `.azmi` contract coverage. |
| `test/frontend/pr184_func_extern_param_return_diag_matrix.test.ts` | func/extern diagnostics | Parser diagnostic split needed. |
| `test/frontend/pr476_parse_func_helpers.test.ts` | func parser helper | Helper may need direct deletion or parser-unit rewrite. |
| `test/frontend/pr476_parse_params_helpers.test.ts` | func parameter parser | Op param coverage may survive. |
| `test/frontend/pr862_assignment_parser.test.ts` | assignment parser | Parser-retirement batch. |
| `test/frontend/pr868_assignment_reg8_parser.test.ts` | assignment parser | Parser-retirement batch. |
| `test/frontend/pr874_assignment_ixiy_parser.test.ts` | assignment parser | Parser-retirement batch. |
| `test/frontend/pr887_assignment_half_index_parser.test.ts` | assignment parser | Parser-retirement batch. |
| `test/frontend/pr895_assignment_ea_ea_parser.test.ts` | assignment parser | Parser-retirement batch. |
| `test/lowering/pr543_function_lowering_integration.test.ts` | function lowering | Broad integration test; split needed before runner move. |
| `test/lowering/pr544_program_lowering_integration.test.ts` | program lowering | Broad integration test; split needed before runner move. |
| `test/smoke_language_tour_compile.test.ts` | language-tour `.zax` corpus | Historical corpus policy needed. |
| `test/regenerate_language_tour_outputs.test.ts` | language-tour outputs | Historical corpus policy needed. |
| `test/pr453_codegen_corpus_workflow.test.ts` | generated ZAX corpus | Historical corpus policy needed. |
| `test/pr303_codegen_corpus_expansion.test.ts` | generated ZAX corpus | Historical corpus policy needed. |

## Quarantined Named Section Tests

Named sections are inherited ZAX behavior. Native AZM uses ASM80-style `org`,
labels, textual includes, and data directives instead of `section code/data`
blocks. These tests stay in the retirement lane only while the implementation
is being deleted or mined for lower-level fixup/output-map guardrails:

| Test file | Dependency | Retirement direction |
| --- | --- | --- |
| `test/frontend/pr572_named_sections_parser.test.ts` | named section syntax | Delete or replace with AZM-native rejection coverage. |
| `test/pr582_named_section_*` | named section lowering | Delete; keep only any plain fixup/output-map fact that can be expressed without sections. |
| `test/pr583_section_placement_helpers.test.ts` | named section placement | Delete with placement helpers unless a raw byte-map overlap helper survives. |
| `test/pr584_named_section_fixups_integration.test.ts` | named section fixups | Replace only if a raw assembler fixup regression is not already covered. |
| `test/pr585_named_section_layout_integration.test.ts` | named section layout | Delete with named section placement; layout constants are covered elsewhere. |

## Broad Scan Used For This Audit

The high-level scan remains intentionally noisy because test implementation code
also contains JavaScript `if` statements and imports:

```bash
rg -n "func |export func|:=|section code|section data|globals|extern func|\bif\b|\bwhile\b|\brepeat\b|\bselect\b|import " test --glob '*.test.ts'
```

Use scan hits as prompts for review, not as automatic deletion criteria.

## Recommended Next Actions

1. Keep `npm run test:azm:alpha` free of ZAX import, `func`, generated frames,
   typed assignment, typed call, and structured control tests.
2. Split the risky layout/op tests before deleting old lowering code.
3. Decide the parser-retirement batch separately; many parser tests are good
   negative rejection coverage once rewritten for AZM source mode.
4. Move language-tour and codegen-corpus expectations out of the AZM path before
   removing high-level ZAX lowering.
