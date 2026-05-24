/**
 * Root fixtures excluded from emitAsm80 text parity vs legacy current AZM.
 *
 * Bin/hex parity is still required via `root-fixture-corpus.test.ts`. Reasons:
 * - intentional Next improvements (symbolic branches, normal LD abs text)
 * - diagnostic-only or invalid fixtures (compile error — not listed here)
 * - comment preservation differences on specific fixtures (legacy may omit user comments)
 * - normal-form text (register casing, directive ordering) while bytes match
 *
 * Use `npx tsx scripts/dev/evaluate-asm80-root-parity.ts` to refresh parity candidates.
 */
export const ASM80_TEXT_EXCLUDED_FIXTURES: readonly string[] = [
  // Mixed ISA: Next emits symbolic jr/djnz; legacy uses raw-byte lines for some branches.
  'pr24_isa_core.asm',
  'pr24_rel8_backward.asm',
  // Next emits symbolic jp/call; legacy used raw DB lines.
  'pr1_minimal.asm',
  'pr37_forward_label_call.asm',
  // Next omits duplicate ORG emission for trailing section; bytes still match.
  'pr713_packed_top_level_arrays.asm',
  // Next preserves fixture header comments before lowered body; legacy output may not.
  'pr11_include_main.asm',
  'pr1349_ld_a_indirect_bc.asm',
  'pr1349_ld_a_indirect_de.asm',
  'pr1349_ld_a_indirect_hl.asm',
  'pr1349_ld_indirect_bc_store.asm',
  'pr1349_ld_indirect_de_store.asm',
  // Next emits symbolic branch text; legacy used raw bytes for this slice (differential dir).
  'fixup_slice.asm',
  // Next preserves user comments; legacy lowered output may not match line-for-line.
  'pr991_comment_preservation.asm',
  // Next emits normal `ld a,(sym)` text; legacy used DB stubs for abs memory LD.
  'pr786_raw_data_lowering.asm',
  // Op-expanded port substitution: lowered text shape differs while bytes match.
  'pr1367_op_port_imm_substitution.asm',
  // D8M appendix fixture: legacy leads with ORG; Next interleaves EQU labels and sections.
  'pr200_d8m_appendix_mapping.asm',
  // Next normalizes indirect JP register pair to lowercase `(hl)`; legacy used `(HL)`.
  'pr58_jp_indirect.asm',
];

/** Root fixtures that compile successfully but are not in text parity (diagnostic matrices, etc.). */
export const ASM80_TEXT_DIAGNOSTIC_ONLY_NOTE =
  'Fifty-four root `*_invalid*.asm` / diagnostic matrices fail compile on both engines; they are omitted from parity and exclusion lists intentionally.';
