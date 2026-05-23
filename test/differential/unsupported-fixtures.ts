export type UnsupportedFixture = {
  file: string;
  reason: string;
  bucket: 'diagnostic-wording' | 'hex-bin-layout' | 'visible-op-diagnostic';
};

export const KNOWN_UNSUPPORTED_FIXTURES: UnsupportedFixture[] = [
  {
    file: 'pr123_isa_alu_a_core_invalid.asm',
    reason: 'diagnostic wording differs for ALU arity validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr133_arity_diag_matrix_invalid.asm',
    reason: 'diagnostic wording differs for ALU arity validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr134_alu_arity_diag_invalid.asm',
    reason: 'diagnostic wording differs for ALU arity validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr144_isa_ed_cb_diag_matrix_invalid.asm',
    reason: 'diagnostic wording differs for ED/CB operand arity',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr146_known_head_no_unsupported.asm',
    reason: 'diagnostic wording differs for known-head opcode matching',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr147_known_head_diag_matrix_invalid.asm',
    reason: 'diagnostic wording differs for known-head arity matching',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr148_known_heads_no_fallback_matrix.asm',
    reason: 'diagnostic wording differs for condition/arity dispatch',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr149_condition_diag_matrix_invalid.asm',
    reason: 'diagnostic wording differs for condition-code validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr150_ed_cb_diag_hardening_matrix.asm',
    reason: 'diagnostic wording differs for IN-family arity validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr169_malformed_decl_header_matrix.asm',
    reason: 'diagnostic wording differs for enum/member declaration validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr186_op_param_list_delimiter_matrix.asm',
    reason: 'diagnostic wording differs for op parameter list parsing',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr203_ld_diag_matrix_invalid.asm',
    reason: 'diagnostic wording differs for memory transfer restrictions',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr211_jr_djnz_diag_matrix_invalid.asm',
    reason: 'diagnostic wording differs for JR condition validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr240_isa_register_target_diag_matrix_invalid.asm',
    reason: 'diagnostic wording differs for call register-target validation',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr270_nonop_invalid_instruction_baseline.asm',
    reason: 'diagnostic wording differs for unsupported LD forms',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr270_op_invalid_expansion_diagnostics.asm',
    reason: 'diagnostic wording differs for visible-op expansion failures',
    bucket: 'visible-op-diagnostic',
  },
  {
    file: 'pr270_op_invalid_expansion_multi_failure.asm',
    reason: 'diagnostic wording differs for visible-op expansion failures',
    bucket: 'visible-op-diagnostic',
  },
  {
    file: 'pr270_op_invalid_expansion_nested_chain.asm',
    reason: 'diagnostic wording differs for nested op expansion failures',
    bucket: 'visible-op-diagnostic',
  },

  {
    file: 'pr2_div_zero.asm',
    reason: 'diagnostic wording differs for divide-by-zero in imm expressions',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr35_char_literals_invalid.asm',
    reason: 'diagnostic wording differs for invalid char literal parsing',
    bucket: 'diagnostic-wording',
  },
  {
    file: 'pr4_undefined_name.asm',
    reason: 'diagnostic wording differs for undefined-symbol / unsupported transfer shape',
    bucket: 'diagnostic-wording',
  },
];

export const KNOWN_UNSUPPORTED_FIXTURE_FILES = new Set(
  KNOWN_UNSUPPORTED_FIXTURES.map((entry) => entry.file),
);
