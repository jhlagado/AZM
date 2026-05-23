export type UnsupportedFixture = {
  file: string;
  reason: string;
};

export const KNOWN_UNSUPPORTED_FIXTURES: UnsupportedFixture[] = [
  { file: 'pr11_include_main.asm', reason: 'include directive handling still not implemented in current next parser' },
  { file: 'pr123_isa_alu_a_core_invalid.asm', reason: 'diagnostic wording differs for ALU arity validation' },
  { file: 'pr133_arity_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for ALU arity validation' },
  { file: 'pr1349_ld_a_indirect_bc.asm', reason: 'HEX emission emits sparse zero-fill records for indirect addressing tests' },
  { file: 'pr1349_ld_a_indirect_de.asm', reason: 'HEX emission emits sparse zero-fill records for indirect addressing tests' },
  { file: 'pr1349_ld_a_indirect_hl.asm', reason: 'HEX emission emits sparse zero-fill records for indirect addressing tests' },
  { file: 'pr1349_ld_indirect_bc_store.asm', reason: 'HEX emission emits sparse zero-fill records for indirect addressing tests' },
  { file: 'pr1349_ld_indirect_de_store.asm', reason: 'HEX emission emits sparse zero-fill records for indirect addressing tests' },
  { file: 'pr134_alu_arity_diag_invalid.asm', reason: 'diagnostic wording differs for ALU arity validation' },
  { file: 'pr137_indexed_bracket_syntax_invalid.asm', reason: 'indexed operand syntax wording differs from current AZM' },
  { file: 'pr144_isa_ed_cb_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for ED/CB operand arity' },
  { file: 'pr146_known_head_no_unsupported.asm', reason: 'diagnostic wording differs for known-head opcode matching' },
  { file: 'pr147_known_head_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for known-head arity matching' },
  { file: 'pr148_known_heads_no_fallback_matrix.asm', reason: 'diagnostic wording differs for condition/arity dispatch' },
  { file: 'pr149_condition_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for condition-code validation' },
  { file: 'pr150_ed_cb_diag_hardening_matrix.asm', reason: 'diagnostic wording differs for IN-family arity validation' },
  { file: 'pr16_op_cycle.asm', reason: 'op expansion cycle detection message format differs' },
  { file: 'pr169_malformed_decl_header_matrix.asm', reason: 'diagnostic wording differs for enum/member declaration validation' },
  { file: 'pr186_op_param_list_delimiter_matrix.asm', reason: 'diagnostic wording differs for op parameter list parsing' },
  { file: 'pr203_ld_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for memory transfer restrictions' },
  { file: 'pr208_call_indirect_legality_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for JP/CC indirect legality checks' },
  { file: 'pr209_jp_cc_indirect_legality_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for JP/CC indirect legality checks' },
  { file: 'pr211_jr_djnz_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for JR condition validation' },
  { file: 'pr240_isa_register_target_diag_matrix_invalid.asm', reason: 'diagnostic wording differs for call register-target validation' },
  { file: 'pr267_op_ambiguous_incomparable.asm', reason: 'diagnostic wording differs for ambiguous visible-op overload reporting' },
  { file: 'pr268_op_arity_mismatch_diagnostics.asm', reason: 'diagnostic wording differs for visible-op arity matching' },
  { file: 'pr268_op_no_match_diagnostics.asm', reason: 'diagnostic wording differs for visible-op overload matching' },
  { file: 'pr270_nonop_invalid_instruction_baseline.asm', reason: 'diagnostic wording differs for unsupported LD forms' },
  { file: 'pr270_op_invalid_expansion_diagnostics.asm', reason: 'diagnostic wording differs for visible-op expansion failures' },
  { file: 'pr270_op_invalid_expansion_multi_failure.asm', reason: 'diagnostic wording differs for visible-op expansion failures' },
  { file: 'pr270_op_invalid_expansion_nested_chain.asm', reason: 'diagnostic wording differs for nested op expansion failures' },
  { file: 'pr274_type_padding_explicit_ok.asm', reason: 'HEX/BIN span differs for padding directives around typed declarations' },
  { file: 'pr274_type_padding_warning.asm', reason: 'HEX/BIN span differs for padding directives around typed declarations' },
  { file: 'pr2_div_zero.asm', reason: 'diagnostic wording differs for divide-by-zero in imm expressions' },
  { file: 'pr35_char_literals_invalid.asm', reason: 'diagnostic wording differs for invalid char literal parsing' },
  { file: 'pr4_undefined_name.asm', reason: 'diagnostic wording differs for undefined-symbol / unsupported transfer shape' },
  { file: 'pr713_packed_top_level_arrays.asm', reason: 'HEX record grouping differs due top-level packed array emission model' },
  { file: 'pr786_raw_data_lowering.asm', reason: 'HEX output grouping differs for lowered raw-data emission' },
  { file: 'pr950_bad_include_entry.asm', reason: 'include directive handling still not implemented in current next parser' },
  { file: 'pr950_include_entry.asm', reason: 'include directive handling still not implemented in current next parser' },
  { file: 'pr950_include_searchpath_entry.asm', reason: 'include directive handling still not implemented in current next parser' },
  { file: 'pr950_missing_include.asm', reason: 'include directive handling still not implemented in current next parser' },
  { file: 'pr991_comment_preservation.asm', reason: 'HEX grouping differs with comment-preservation fixture layout' },
];

export const KNOWN_UNSUPPORTED_FIXTURE_FILES = new Set(
  KNOWN_UNSUPPORTED_FIXTURES.map((entry) => entry.file),
);
