/**
 * Root fixtures excluded from emitAsm80 text parity vs legacy current AZM.
 *
 * Bin/hex parity is still required via `root-fixture-corpus.test.ts`. Reasons:
 * - intentional Next improvements (symbolic branches, normal LD abs text)
 * - diagnostic-only or invalid fixtures (no successful asm80 artifact)
 * - comment preservation differences on specific fixtures (legacy may omit user comments)
 */
export const ASM80_TEXT_EXCLUDED_FIXTURES: readonly string[] = [
  // Mixed ISA: Next emits symbolic jr/djnz; legacy uses raw-byte lines for some branches.
  'pr24_isa_core.asm',
  // Next emits symbolic jp/call; legacy used raw DB lines.
  'pr1_minimal.asm',
  'pr37_forward_label_call.asm',
  // Next omits duplicate ORG emission for trailing section; bytes still match.
  'pr713_packed_top_level_arrays.asm',
  // Next emits symbolic branch text; legacy used raw bytes for this slice.
  'fixup_slice.asm',
  // Next preserves user comments; legacy lowered output may not match line-for-line.
  'pr991_comment_preservation.asm',
  // Next emits normal `ld a,(sym)` text; legacy used DB stubs for abs memory LD.
  'pr786_raw_data_lowering.asm',
  // Op-expanded port substitution: lowered text shape differs while bytes match.
  'pr1367_op_port_imm_substitution.asm',
];
