# Root `pr*.test.ts` Migration Tracker

This tracker classifies remaining root-level `test/pr*.test.ts` files by destination
subsystem. It is intended to make the remaining migration backlog concrete before adding
stricter guardrails.

## Snapshot (current root-level backlog)

- Root `test/pr*.test.ts`: 166
- Already migrated:
  - `test/frontend`: 81
  - `test/semantics`: 9
  - `test/backend`: 26
  - `test/lowering`: 16
  - `test/cli`: 1

## Proposed destination buckets

- Backend / ISA / encoding: 36
- Lowering / runtime / section / fixup: 96
- Semantics: 15
- Frontend / parser / import: 14
- CLI / infra: 5

Note: classifications are based on test intent and filenames; any item that proves to be
mixed should be moved to a cross-cutting destination only after confirmation.

## Backend / ISA / encoding (36)

- `pr126_cb_bitops_reg_matrix.test.ts`
- `pr132_control_flow_arity_diag.test.ts`
- `pr133_arity_diag_matrix.test.ts`
- `pr134_alu_arity_diag.test.ts`
- `pr136_bit_indexed_dest_invalid.test.ts`
- `pr137_cb_rotate_two_operand_invalid.test.ts`
- `pr145_alu_diag_no_unsupported.test.ts`
- `pr146_known_head_no_unsupported.test.ts`
- `pr147_known_head_diag_matrix.test.ts`
- `pr148_known_heads_no_fallback_matrix.test.ts`
- `pr149_condition_diag_matrix.test.ts`
- `pr150_ed_cb_diag_hardening_matrix.test.ts`
- `pr151_zero_operand_head_diag_matrix.test.ts`
- `pr202_add_diag_matrix.test.ts`
- `pr203_ld_diag_matrix.test.ts`
- `pr204_adc_sbc_diag_matrix.test.ts`
- `pr205_indexed_cb_destination_diag_matrix.test.ts`
- `pr206_in_out_indexed_reg_diag_matrix.test.ts`
- `pr207_jp_indirect_legality_diag_matrix.test.ts`
- `pr208_call_indirect_legality_diag_matrix.test.ts`
- `pr209_jp_cc_indirect_legality_diag_matrix.test.ts`
- `pr210_jp_call_condition_vs_imm_diag_matrix.test.ts`
- `pr211_jr_djnz_diag_matrix.test.ts`
- `pr212_condition_missing_operand_diag_matrix.test.ts`
- `pr213_condition_symbolic_base_collision_diag_matrix.test.ts`
- `pr225_indexed_rotate_destination_diag_matrix.test.ts`
- `pr268_op_diagnostics_matrix.test.ts`
- `pr303_codegen_corpus_expansion.test.ts`
- `pr320_preserve_matrix.test.ts`
- `pr354_register_list_only_surface.test.ts`
- `pr39_listing.test.ts`
- `pr48_ld_mem_imm16.test.ts`
- `pr49_ld_mem_imm16_abs_fastpath.test.ts`
- `pr58_jp_indirect.test.ts`
- `pr693_ld_form_selection.test.ts`
- `pr453_codegen_corpus_workflow.test.ts`

## Lowering / runtime / sections / fixups (96)

- `pr102_lowering_frame_invariants.test.ts`
- `pr103_lowering_mixed_return_paths.test.ts`
- `pr1049_record_named_init_data_lowering.test.ts`
- `pr104_lowering_op_control_interactions.test.ts`
- `pr1050_step_lowering.test.ts`
- `pr197_untracked_stack_invariants.test.ts`
- `pr198_lowering_unknown_stack_states.test.ts`
- `pr199_lowering_mismatch_propagation.test.ts`
- `pr218_lowering_retcc_unknown_untracked_matrix.test.ts`
- `pr219_lowering_retcc_structured_control_matrix.test.ts`
- `pr220_lowering_retcc_ifelse_repeat_matrix.test.ts`
- `pr221_lowering_op_expansion_retcc_interactions.test.ts`
- `pr224_lowering_call_boundary_stack_matrix.test.ts`
- `pr228_lowering_call_boundary_unknown_untracked_matrix.test.ts`
- `pr230_lowering_rst_call_boundary_matrix.test.ts`
- `pr262_ld_nested_runtime_index.test.ts`
- `pr264_runtime_atom_budget_matrix.test.ts`
- `pr26_rotate_retcc.test.ts`
- `pr271_op_stack_policy_alignment.test.ts`
- `pr272_runtime_affine_index_offset.test.ts`
- `pr273_call_scalar_value_runtime_index.test.ts`
- `pr275_typed_vs_raw_call_boundary_diagnostics.test.ts`
- `pr278_nested_runtime_store_matrix.test.ts`
- `pr278_raw_call_typed_target_warning.test.ts`
- `pr283_hidden_lowering_risk_matrix.test.ts`
- `pr320_extern_call_preservation.test.ts`
- `pr330_frames_epilogue_and_access.test.ts`
- `pr364_call_with_arg_and_local_regression.test.ts`
- `pr365_args_locals_basics_regression.test.ts`
- `pr374_addressing_modes_mini_suite.test.ts`
- `pr37_fixup_negative.test.ts`
- `pr405_byte_call_scalar_arg.test.ts`
- `pr405_byte_global_non_a_symbols.test.ts`
- `pr405_byte_global_scalar_symbols.test.ts`
- `pr405_byte_indexed_templates.test.ts`
- `pr405_byte_scalar_fast_paths.test.ts`
- `pr405_retcc_cleanup_positive.test.ts`
- `pr406_word_eaw_matrix.test.ts`
- `pr406_word_edge_cases.test.ts`
- `pr406_word_hl_fallback_store.test.ts`
- `pr406_word_ix_fallback_load.test.ts`
- `pr406_word_memmove_regression.test.ts`
- `pr406_word_scalar_accessors.test.ts`
- `pr406_word_store_de_regression.test.ts`
- `pr406_word_store_regression.test.ts`
- `pr406_word_templates_regression.test.ts`
- `pr407_addressing_regression.test.ts`
- `pr407_step_matrix.test.ts`
- `pr407_word_regression.test.ts`
- `pr412_runtime_index_array_word.test.ts`
- `pr412_runtime_index_matrix.test.ts`
- `pr446_virtual_reg16_transfers.test.ts`
- `pr447_direct_index_high_low.test.ts`
- `pr452_conditional_jump_trace_placeholders.test.ts`
- `pr468_refactor_gap_integration.test.ts`
- `pr468_typed_step_integration.test.ts`
- `pr474_section_layout_helpers.test.ts`
- `pr474_trace_format_helpers.test.ts`
- `pr504_op_matching_helpers.test.ts`
- `pr506_runtime_atom_budget_helpers.test.ts`
- `pr507_ea_resolution_helpers.test.ts`
- `pr508_runtime_immediates_helpers.test.ts`
- `pr552_lowering_warning_id.test.ts`
- `pr554_op_stack_analysis_helpers.test.ts`
- `pr555_function_sp_state_integration.test.ts`
- `pr573_section_key_collection.test.ts`
- `pr577_startup_init_region.test.ts`
- `pr582_named_section_routing_integration.test.ts`
- `pr582_named_section_semantics_integration.test.ts`
- `pr582_program_prescan_named_section_rules.test.ts`
- `pr582_section_contribution_sinks.test.ts`
- `pr583_section_placement_helpers.test.ts`
- `pr584_named_section_fixups_integration.test.ts`
- `pr585_named_section_layout_integration.test.ts`
- `pr622_direct_data_decl_prescan.test.ts`
- `pr688_lowering_diagnostic_guardrail.test.ts`
- `pr709_ea_resolution_indirect.test.ts`
- `pr710_indirect_ea_consumers.test.ts`
- `pr711_wide_eaw.test.ts`
- `pr770_typed_reinterpretation_integration.test.ts`
- `pr781_ld_typed_storage_migration_diag.test.ts`
- `pr786_raw_data_lowering.test.ts`
- `pr819_exact_scale_lowering.test.ts`
- `pr820_exact_size_cleanup.test.ts`
- `pr848_break_continue_integration.test.ts`
- `pr863_assignment_byte_widening_integration.test.ts`
- `pr863_assignment_lowering.test.ts`
- `pr869_assignment_reg8_integration.test.ts`
- `pr869_assignment_reg8_lowering.test.ts`
- `pr875_assignment_ixiy_integration.test.ts`
- `pr887_assignment_half_index_integration.test.ts`
- `pr887_assignment_half_index_lowering.test.ts`
- `pr896_assignment_ea_ea_integration.test.ts`
- `pr900_step_integration.test.ts`
- `pr92_lowering_interactions.test.ts`
- `pr952_raw_ix_slot_offsets.test.ts`

## Semantics (15)

- `pr289_place_expression_contexts.test.ts`
- `pr292_local_var_initializer_enforcement.test.ts`
- `pr575_callable_visibility.test.ts`
- `pr575_module_visibility_scaffolding.test.ts`
- `pr647_visible_symbol_resolver.test.ts`
- `pr652_startup_init_semantic_routine.test.ts`
- `pr713_packed_top_level_arrays.test.ts`
- `pr738_select_case_ranges.test.ts`
- `pr770_typed_reinterpretation_diagnostics.test.ts`
- `pr50_union_field_access.test.ts`
- `pr51_data_inferred_array_len.test.ts`
- `pr52_ptr_scalar_slots.test.ts`
- `pr54_inferred_array_len_invalid.test.ts`
- `pr8_sizeof.test.ts`
- `pr2_div_zero.test.ts`

## Frontend / parser / import (14)

- `pr159_extern_base_block_unsupported.test.ts`
- `pr163_import_extern_base_relative_call.test.ts`
- `pr242_import_resolution_diag_spans.test.ts`
- `pr243_module_id_collision_diag_span.test.ts`
- `pr322_return_flags_parser.test.ts`
- `pr35_char_literals_invalid.test.ts`
- `pr3_var_duplicates.test.ts`
- `pr4_enum.test.ts`
- `pr4_negative.test.ts`
- `pr9_sections_align.test.ts`
- `pr950_include_text_only.test.ts`
- `pr646_decl_visitor.test.ts`
- `pr277_index_redundant_paren_warning.test.ts`
- `pr614_legacy_syntax_guardrail.test.ts`

## CLI / infra (5)

- `pr249_cli_lock_eviction_matrix.test.ts`
- `pr263_case_style_lint.test.ts`
- `pr288_ci_docs_only_classifier.test.ts`
- `pr472_source_file_size_guard.test.ts`
- `pr473_input_assets.test.ts`

## Next safest migration candidates

1. Backend ISA/diagnostic matrices (`pr126`–`pr213`, `pr225`, `pr268`) as a single batch.
2. Frontend parser/import diagnostics (`pr159`, `pr163`, `pr242`, `pr243`, `pr322`, `pr35`).
3. CLI/infra helpers (`pr249`, `pr263`, `pr288`, `pr472`, `pr473`) as a small low-risk batch.
