// Inherited high-level ZAX behavior that native AZM rejects or is expected to
// reject. Keep this list explicit so AZM validation can exclude it while
// retirement work can still run it on demand.
export const zaxRetirementTests = [
  // ZAX import/module graph behavior.
  'test/moduleLoader_zax_import.test.ts',
  'test/pr163_import_extern_base_relative_call.test.ts',
  'test/pr242_import_resolution_diag_spans.test.ts',
  'test/pr243_module_id_collision_diag_span.test.ts',

  // Old callable/function parser and generated frame behavior.
  'test/frontend/pr638_return_regs_canonicalization.test.ts',
  'test/frontend/pr689_callable_header_parser.test.ts',
  'test/frontend/pr171_func_missing_asm_recovery.test.ts',
  'test/frontend/pr192_func_var_end_block.test.ts',
  'test/pr102_lowering_frame_invariants.test.ts',
  'test/pr103_lowering_mixed_return_paths.test.ts',
  'test/pr330_frames_epilogue_and_access.test.ts',
  'test/pr364_call_with_arg_and_local_regression.test.ts',
  'test/pr365_args_locals_basics_regression.test.ts',
  'test/pr405_byte_call_scalar_arg.test.ts',

  // Typed storage/addressing and assignment lowering.
  'test/pr770_typed_reinterpretation_integration.test.ts',
  'test/pr781_ld_typed_storage_migration_diag.test.ts',
  'test/pr863_assignment_lowering.test.ts',
  'test/pr869_assignment_reg8_integration.test.ts',
  'test/pr875_assignment_ixiy_integration.test.ts',
  'test/pr887_assignment_half_index_integration.test.ts',
  'test/semantics/pr895_assignment_acceptance.test.ts',
  'test/pr896_assignment_ea_ea_integration.test.ts',
  'test/pr1049_record_named_init_data_lowering.test.ts',
  'test/lowering/pr1334_typed_aggregate_local.test.ts',
  'test/lowering/pr1340_aggregate_param.test.ts',
  'test/lowering/pr1344_addr_of_type.test.ts',

  // Structured control lowering outside AZM alpha scope.
  'test/pr738_select_case_ranges.test.ts',
  'test/pr848_break_continue_integration.test.ts',

  // Split before retiring: useful layout/op facts mixed with hidden ZAX lowering.
  'test/pr50_union_field_access.test.ts',
  'test/pr819_exact_scale_lowering.test.ts',
  'test/pr104_lowering_op_control_interactions.test.ts',
  'test/semantics/pr849_local_init_consts.test.ts',

  // Parser and lowering tests still awaiting narrower AZM-native rewrites or deletion.
  'test/pr159_extern_base_block_unsupported.test.ts',
  'test/pr320_extern_call_preservation.test.ts',
  'test/frontend/pr184_func_extern_param_return_diag_matrix.test.ts',
  'test/frontend/pr476_parse_func_helpers.test.ts',
  'test/frontend/pr476_parse_params_helpers.test.ts',
  'test/frontend/pr862_assignment_parser.test.ts',
  'test/frontend/pr868_assignment_reg8_parser.test.ts',
  'test/frontend/pr874_assignment_ixiy_parser.test.ts',
  'test/frontend/pr887_assignment_half_index_parser.test.ts',
  'test/frontend/pr895_assignment_ea_ea_parser.test.ts',
  'test/frontend/pr572_named_sections_parser.test.ts',
  'test/pr582_named_section_semantics_integration.test.ts',
  'test/pr582_section_contribution_sinks.test.ts',
  'test/pr582_program_prescan_named_section_rules.test.ts',
  'test/pr582_named_section_routing_integration.test.ts',
  'test/pr583_section_placement_helpers.test.ts',
  'test/pr584_named_section_fixups_integration.test.ts',
  'test/pr585_named_section_layout_integration.test.ts',
  'test/lowering/pr543_function_lowering_integration.test.ts',
  'test/lowering/pr544_program_lowering_integration.test.ts',
  'test/smoke_language_tour_compile.test.ts',
  'test/regenerate_language_tour_outputs.test.ts',
  'test/pr453_codegen_corpus_workflow.test.ts',
  'test/pr303_codegen_corpus_expansion.test.ts',
];
