import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const GENERATED_START_MARKER = '<!-- BEGIN GENERATED: grammar-atoms -->';
export const GENERATED_END_MARKER = '<!-- END GENERATED: grammar-atoms -->';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

const DEFAULT_GRAMMAR_DATA_PATH = resolve(REPO_ROOT, 'src/frontend/grammarData.ts');
const DEFAULT_GRAMMAR_DOC_PATH = resolve(REPO_ROOT, 'docs/spec/zax-grammar.ebnf.md');

async function loadGrammarDataModule(grammarDataPath = DEFAULT_GRAMMAR_DATA_PATH) {
  const source = readFileSync(grammarDataPath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: grammarDataPath,
  });
  const encoded = Buffer.from(outputText, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encoded}`);
}

function quoteAlternatives(values) {
  return values.map((value) => {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  });
}

function renderProduction(name, alternatives) {
  const prefix = `${name.padEnd(24)}= `;
  const continuation = `${' '.repeat(24)}| `;
  const limit = 96;
  const lines = [];
  let line = prefix;

  for (const alternative of alternatives) {
    const piece = `${line === prefix ? '' : ' | '}${alternative}`;
    if (line !== prefix && line.length + piece.length > limit) {
      lines.push(line);
      line = `${continuation}${alternative}`;
      continue;
    }
    line += piece;
  }

  lines.push(`${line} ;`);
  return lines.join('\n');
}

function renderGeneratedGrammarAtoms(module) {
  const lines = [
    '(* Generated from src/frontend/grammarData.ts. Re-run node scripts/generate-grammar-atoms.mjs. *)',
    renderProduction('top_level_keyword', quoteAlternatives(module.TOP_LEVEL_KEYWORD_LIST)),
    '',
    renderProduction('asm_control_keyword', quoteAlternatives(module.ASM_CONTROL_KEYWORD_LIST)),
    renderProduction('condition_code', quoteAlternatives(module.CONDITION_CODE_LIST)),
    '',
    renderProduction('named_section_kind', quoteAlternatives(module.NAMED_SECTION_KIND_LIST)),
    renderProduction('legacy_section_kind', ['named_section_kind', '"var"']),
    '',
    renderProduction('scalar_type', quoteAlternatives(module.SCALAR_TYPE_LIST)),
    renderProduction('return_reg', quoteAlternatives(module.RETURN_REGISTER_LIST)),
    '',
    renderProduction('reg8', quoteAlternatives(module.REGISTERS_8)),
    renderProduction('reg8_extended', quoteAlternatives(module.REGISTERS_8_EXTENDED)),
    renderProduction('reg16', quoteAlternatives(module.REGISTERS_16_GENERAL)),
    renderProduction('reg16_special', quoteAlternatives(module.REGISTERS_16_SPECIAL)),
    renderProduction('reg16_shadow', quoteAlternatives(module.REGISTERS_16_SHADOW)),
    renderProduction('register_name', ['reg8', 'reg8_extended', 'reg16', 'reg16_special', 'reg16_shadow']),
    renderProduction('assignment_reg', quoteAlternatives(module.ASSIGNMENT_REGISTER_LIST)),
    renderProduction('move_reg_atom', quoteAlternatives(module.MOVE_REGISTER_LIST)),
    renderProduction('index_reg16', quoteAlternatives(module.INDEX_REG16_LIST)),
    renderProduction('typed_reinterpret_base_reg', quoteAlternatives(module.TYPED_REINTERPRET_BASE_REGISTER_LIST)),
    renderProduction('index_mem_base_reg', quoteAlternatives(module.INDEX_MEM_BASE_REGISTER_LIST)),
    '',
    renderProduction('matcher_type_symbolic', quoteAlternatives(module.MATCHER_TYPE_LIST)),
    '',
    renderProduction('imm_unary_op', quoteAlternatives(module.IMM_UNARY_OPERATORS)),
    ...module.IMM_OPERATOR_PRECEDENCE.map(({ level, ops }) => {
      const name =
        level === 7
          ? 'imm_mul_op'
          : level === 6
            ? 'imm_add_op'
            : level === 5
              ? 'imm_shift_op'
              : level === 4
                ? 'imm_and_op'
                : level === 3
                  ? 'imm_xor_op'
                  : 'imm_or_op';
      return renderProduction(name, quoteAlternatives(ops));
    }),
    '',
    renderProduction('escape_simple', quoteAlternatives([...module.CHAR_ESCAPE_VALUES.keys()])),
  ];
  return lines.join('\n');
}

export async function renderGeneratedGrammarAtomSection(grammarDataPath = DEFAULT_GRAMMAR_DATA_PATH) {
  const grammarData = await loadGrammarDataModule(grammarDataPath);
  return [
    GENERATED_START_MARKER,
    '```ebnf',
    renderGeneratedGrammarAtoms(grammarData),
    '```',
    GENERATED_END_MARKER,
  ].join('\n');
}

export async function syncGrammarAtomsDoc(docText, grammarDataPath = DEFAULT_GRAMMAR_DATA_PATH) {
  const generatedSection = await renderGeneratedGrammarAtomSection(grammarDataPath);
  const pattern = new RegExp(`${GENERATED_START_MARKER}[\\s\\S]*?${GENERATED_END_MARKER}`, 'm');
  if (!pattern.test(docText)) {
    throw new Error('Missing grammar atom generation markers in docs/spec/zax-grammar.ebnf.md');
  }
  return docText.replace(pattern, generatedSection);
}

export async function regenerateGrammarAtomsDoc(grammarDocPath = DEFAULT_GRAMMAR_DOC_PATH, grammarDataPath = DEFAULT_GRAMMAR_DATA_PATH) {
  const current = readFileSync(grammarDocPath, 'utf8');
  const updated = await syncGrammarAtomsDoc(current, grammarDataPath);
  if (updated !== current) {
    writeFileSync(grammarDocPath, updated);
  }
  return { updated, changed: updated !== current };
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
  const { changed } = await regenerateGrammarAtomsDoc();
  process.stdout.write(changed ? 'Updated docs/spec/zax-grammar.ebnf.md\n' : 'Grammar atoms already up to date\n');
}
