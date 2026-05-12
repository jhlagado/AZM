import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, '..', '..');
const grammarPath = resolve(REPO_ROOT, 'docs/spec/zax-grammar.ebnf.md');
const generatorPath = resolve(REPO_ROOT, 'scripts/generate-grammar-atoms.mjs');
const GENERATED_START_MARKER = '<!-- BEGIN GENERATED: grammar-atoms -->';
const GENERATED_END_MARKER = '<!-- END GENERATED: grammar-atoms -->';

function readGrammar(): string {
  return readFileSync(grammarPath, 'utf8');
}

describe('PR808 grammar drift checks', () => {
  it('keeps the generated grammar atom block up to date', () => {
    const stdout = execFileSync('node', [generatorPath], {
      cwd: TEST_DIR,
      encoding: 'utf8',
    });
    const grammar = readGrammar();

    expect(stdout).toContain('Grammar atoms already up to date');
    expect(grammar).toContain(GENERATED_START_MARKER);
    expect(grammar).toContain(GENERATED_END_MARKER);
  });

  it('documents the expected parser atom productions from grammarData.ts', () => {
    const grammar = readGrammar();

    expect(grammar).toContain('top_level_keyword');
    expect(grammar).toContain('asm_control_keyword');
    expect(grammar).toContain('condition_code');
    expect(grammar).toContain('return_reg');
    expect(grammar).toContain('assignment_reg');
    expect(grammar).toContain('move_reg_atom');
    expect(grammar).toContain('typed_reinterpret_base_reg');
    expect(grammar).toContain('matcher_type_symbolic');
    expect(grammar).toContain('imm_unary_op');
    expect(grammar).toContain('escape_simple');
  });

  it('keeps manual grammar productions stable outside the generated atom block', () => {
    const grammar = readGrammar();

    expect(grammar).toContain('assign_stmt     = assign_target , ":=" , assign_source ;');
    expect(grammar).toContain(
      'assign_source   = assignment_reg | ea_expr | move_addr | imm_expr ;',
    );
    expect(grammar).toContain(
      'move_addr       = "@" , ea_expr ;  (* move_addr is only valid as the source operand in v1 *)',
    );
    expect(grammar).toContain('imm_name        = identifier , { "." , identifier } ;');
    expect(grammar).toContain('rhs_alias_expr  = ea_expr ;');
    expect(grammar).toContain('data_init_expr  = string_lit | aggregate_init | imm_expr ;');
  });

  it('keeps spec authority and parser-authority notes explicit', () => {
    const grammar = readGrammar();

    expect(grammar).toContain('`docs/spec/zax-spec.md` wins');
    expect(grammar).toContain(
      'It documents parser-level atom syntax only; semantic restrictions still live',
    );
    expect(grammar).toContain(
      'Parser recovery behavior remains implementation-defined by the hand-written parser.',
    );
  });

  it('keeps the semantic raw-data placement note in the hand-written section', () => {
    const grammar = readGrammar();

    expect(grammar).toMatch(/Raw data directives .* only valid inside `section data` blocks\./i);
  });
});
