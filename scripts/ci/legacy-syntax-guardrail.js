import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

export const FORBIDDEN_RULES = [
  {
    id: 'bare-data-marker',
    pattern: /^\s*data\s*$/i,
    message: 'Bare `data` marker lines are forbidden; use direct declarations.',
  },
  {
    id: 'legacy-globals-block',
    pattern: /^\s*globals\b/i,
    message: '`globals ... end` is forbidden; use named data sections.',
  },
  {
    id: 'legacy-active-counter-section',
    pattern: /^\s*section\s+(?:code|data|var)(?:\s+at\b|\s*$)/i,
    message: 'Active-counter section directives are forbidden; use named sections.',
  },
];

export const DEFAULT_SCAN_ROOTS = ['README.md', 'docs', 'examples', 'test/fixtures'];

export const FIXTURE_ALLOWLIST = new Set([
  'test/fixtures/corpus/invalid_runtime_atom_budget.zax',
  'test/fixtures/pr110_isa_ixiy_abs16_forms.zax',
  'test/fixtures/pr114_isa_ld_abs16_direct_asm.zax',
  'test/fixtures/pr120_isa_core_matrix.zax',
  'test/fixtures/pr13_call_ea_index_memhl.zax',
  'test/fixtures/pr13_call_ea_index_reg8.zax',
  'test/fixtures/pr13_call_ea_mem.zax',
  'test/fixtures/pr149_select_mem_selector_eval_once.zax',
  'test/fixtures/pr154_parser_top_level_malformed_keyword_matrix.zax',
  'test/fixtures/pr155_top_level_keyword_whitespace_forms.zax',
  'test/fixtures/pr161_var_data_keyword_name_matrix.zax',
  'test/fixtures/pr165_data_keyword_name_recovery.zax',
  'test/fixtures/pr168_declaration_duplicate_matrix.zax',
  'test/fixtures/pr16_op_mem_width.zax',
  'test/fixtures/pr170_block_termination_recovery_matrix.zax',
  'test/fixtures/pr171_func_missing_asm_recovery.zax',
  'test/fixtures/pr172_block_body_malformed_line_matrix.zax',
  'test/fixtures/pr174_mixed_malformed_keyword_ordering.zax',
  'test/fixtures/pr176_mixed_keyword_shaped_line_recovery.zax',
  'test/fixtures/pr177_parenthesized_keyword_line_recovery_matrix.zax',
  'test/fixtures/pr179_type_union_var_data_malformed_header_matrix.zax',
  'test/fixtures/pr181_top_level_malformed_header_canonical_matrix.zax',
  'test/fixtures/pr182_var_block_inferred_array_recovery.zax',
  'test/fixtures/pr183_block_invalid_type_shape_matrix.zax',
  'test/fixtures/pr185_block_invalid_identifier_matrix.zax',
  'test/fixtures/pr188_op_ea_nested_substitution.zax',
  'test/fixtures/pr189_globals_layout.zax',
  'test/fixtures/pr189_globals_parser_matrix.zax',
  'test/fixtures/pr194_d8m_sparse_segments.zax',
  'test/fixtures/pr201_isa_indexed_zero_disp_forms.zax',
  'test/fixtures/pr215_const_data_followups_invalid.zax',
  'test/fixtures/pr215_const_data_followups_valid.zax',
  'test/fixtures/pr22_call_ea_index_nested.zax',
  'test/fixtures/pr256_value_semantics_scalar_ld.zax',
  'test/fixtures/pr259_op_ea_dotted_field.zax',
  'test/fixtures/pr261_call_ea_index_reg16hl.zax',
  'test/fixtures/pr265_call_ea_index_const.zax',
  'test/fixtures/pr267_op_specific_mem_vs_ea.zax',
  'test/fixtures/pr286_record_named_init_mixed_negative.zax',
  'test/fixtures/pr286_record_named_init_negative.zax',
  'test/fixtures/pr286_record_named_init_positive.zax',
  'test/fixtures/pr2_const_data.zax',
  'test/fixtures/pr322_return_flags_positive.zax',
  'test/fixtures/pr3_var_duplicates.zax',
  'test/fixtures/pr3_var_layout.zax',
  'test/fixtures/pr406_word_invalid_nonscalar_index_name.zax',
  'test/fixtures/pr43_ld_mem_imm8.zax',
  'test/fixtures/pr43_ld_mem_imm8_invalid_word.zax',
  'test/fixtures/pr44_ld_abs16_specialcases.zax',
  'test/fixtures/pr45_ld_abs16_ed_forms.zax',
  'test/fixtures/pr49_ld_mem_imm16_abs_fastpath.zax',
  'test/fixtures/pr51_data_inferred_array_len.zax',
  'test/fixtures/pr54_inferred_array_len_invalid_var.zax',
  'test/fixtures/pr9_invalid_code_base_no_overlap.zax',
  'test/fixtures/pr9_overlap_code_data.zax',
  'test/fixtures/pr9_section_code_at.zax',
]);

function normalizePath(path) {
  return path.replaceAll('\\', '/');
}

function stripLineComment(line) {
  const trimmed = line.trimStart();
  if (trimmed.startsWith(';') || trimmed.startsWith('//')) return '';
  const semicolonIdx = line.indexOf(';');
  const slashIdx = line.indexOf('//');
  if (semicolonIdx === -1 && slashIdx === -1) return line;
  if (semicolonIdx === -1) return line.slice(0, slashIdx);
  if (slashIdx === -1) return line.slice(0, semicolonIdx);
  return line.slice(0, Math.min(semicolonIdx, slashIdx));
}

function isAllowlisted(relativePath) {
  return FIXTURE_ALLOWLIST.has(relativePath);
}

function collectFilesFromRoots(repoRoot, roots) {
  const files = [];
  const queue = roots.map((root) => resolve(repoRoot, root));

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) continue;
    let stat;
    try {
      stat = statSync(current);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current)) queue.push(resolve(current, entry));
      continue;
    }
    if (stat.isFile() && (current.toLowerCase().endsWith('.zax') || current.toLowerCase().endsWith('.md'))) {
      files.push(current);
    }
  }

  files.sort();
  return files;
}

function* iterMarkdownFenceLines(text) {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trimStart();
    if (trimmed.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) yield { line: i + 1, text: line };
  }
}

/**
 * @param {{
 *   repoRoot?: string;
 *   roots?: string[];
 *   filePaths?: string[];
 * }} [options]
 */
export function scanForbiddenLegacySyntax(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const files = options.filePaths
    ? options.filePaths.map((p) => resolve(repoRoot, p)).sort()
    : collectFilesFromRoots(repoRoot, options.roots ?? DEFAULT_SCAN_ROOTS);

  /** @type {Array<{file: string; line: number; column: number; ruleId: string; message: string}>} */
  const violations = [];
  for (const file of files) {
    const rel = normalizePath(relative(repoRoot, file));
    const text = readFileSync(file, 'utf8');
    const isMarkdown = file.toLowerCase().endsWith('.md');
    const lines = isMarkdown
      ? Array.from(iterMarkdownFenceLines(text))
      : text.split(/\r?\n/).map((line, idx) => ({ line: idx + 1, text: line ?? '' }));

    for (const lineEntry of lines) {
      const scanned = stripLineComment(lineEntry.text);
      for (const rule of FORBIDDEN_RULES) {
        const match = scanned.match(rule.pattern);
        if (!match) continue;
        if (!isMarkdown && isAllowlisted(rel)) break;
        violations.push({
          file: rel.startsWith('..') ? normalizePath(file) : rel,
          line: lineEntry.line,
          column: (match.index ?? 0) + 1,
          ruleId: rule.id,
          message: rule.message,
        });
      }
    }
  }

  return { violations };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { violations } = scanForbiddenLegacySyntax();
  if (violations.length === 0) {
    process.stdout.write('legacy syntax guardrail: no violations\n');
    process.exit(0);
  }
  for (const v of violations) {
    process.stderr.write(`${v.file}:${v.line}:${v.column} [${v.ruleId}] ${v.message}\n`);
  }
  process.stderr.write(
    `legacy syntax guardrail: ${violations.length} violation(s) outside allowlist\n`,
  );
  process.exit(1);
}
