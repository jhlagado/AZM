/**
 * Ensures every `DiagnosticIds` code is reachable from a real compile (or documented harness).
 * When an ID is dropped from emit paths, this suite should fail — see GitHub #1136.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { compile } from '../src/compile.js';
import type { DiagnosticId } from '../src/diagnosticTypes.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import * as parser from '../src/frontend/parser.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtures = join(__dirname, 'fixtures');

function writeTempEntry(source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'zax-reach-'));
  const entry = join(dir, 'entry.zax');
  writeFileSync(entry, source, 'utf8');
  return {
    entry,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const ALL_DIAGNOSTIC_IDS = Object.values(DiagnosticIds) as DiagnosticId[];

type ReachabilityCase = {
  id: DiagnosticId;
  description: string;
  run: () => ReturnType<typeof compile>;
};

describe('DiagnosticId reachability (#1136)', () => {
  const cases: ReachabilityCase[] = [
    {
      id: DiagnosticIds.Unknown,
      description:
        'compile requests listing artifact but no listing writer is configured (optional writer omitted)',
      run: () => {
        const { writeListing: _omitListing, ...formatsWithoutListing } = defaultFormatWriters;
        return compile(join(fixtures, 'pr277_index_redundant_paren_warning.zax'), {}, {
          formats: formatsWithoutListing,
        });
      },
    },
    {
      id: DiagnosticIds.IoReadFailed,
      description: 'entry module path does not exist (read fails before parse)',
      run: () =>
        compile(join(tmpdir(), `zax-reach-missing-${Date.now()}.zax`), {}, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.InternalParseError,
      description: 'parse throws unexpectedly (caught by module loader); spy targets same parser module as compile',
      run: async () => {
        const spy = vi.spyOn(parser, 'parseModuleFile').mockImplementationOnce(() => {
          throw new Error('diagnostic reachability harness');
        });
        const { entry, cleanup } = writeTempEntry(`export func main(): HL
  hl := 0
end
`);
        try {
          return await compile(entry, {}, { formats: defaultFormatWriters });
        } finally {
          spy.mockRestore();
          cleanup();
        }
      },
    },
    {
      id: DiagnosticIds.ImportNotFound,
      description: 'import specifier resolves to no existing module file',
      run: () =>
        compile(join(fixtures, 'pr11_missing_import.zax'), { includeDirs: [join(fixtures, 'includes')] }, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.ParseError,
      description: 'unsupported top-level construct after recovery',
      run: () => {
        const { entry, cleanup } = writeTempEntry(`totally_unknown_construct
export func main(): HL
  hl := 0
end
`);
        return compile(entry, {}, { formats: defaultFormatWriters }).finally(cleanup);
      },
    },
    {
      id: DiagnosticIds.EncodeError,
      description: 'encoder rejects an instruction form during lowering',
      run: () =>
        compile(join(fixtures, 'pr209_jp_cc_indirect_legality_diag_matrix_invalid.zax'), {}, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.EmitError,
      description: 'emit/lowering reports unresolved abs16 fixup symbol',
      run: () =>
        compile(join(fixtures, 'pr37_unresolved_symbol_abs16.zax'), {}, { formats: defaultFormatWriters }),
    },
    {
      id: DiagnosticIds.EmitWarning,
      description: 'lowering warns on partially clipped select case range (reg8)',
      run: () =>
        compile(join(fixtures, 'pr738_select_reg8_range_clip_warning.zax'), {}, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.OpArityMismatch,
      description: 'op call arity does not match any overload',
      run: () =>
        compile(join(fixtures, 'pr268_op_arity_mismatch_diagnostics.zax'), {}, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.OpNoMatchingOverload,
      description: 'op operands do not match any overload candidate',
      run: () =>
        compile(join(fixtures, 'pr268_op_no_match_diagnostics.zax'), {}, { formats: defaultFormatWriters }),
    },
    {
      id: DiagnosticIds.OpAmbiguousOverload,
      description: 'op overload resolution is ambiguous',
      run: () =>
        compile(join(fixtures, 'pr267_op_ambiguous_incomparable.zax'), {}, { formats: defaultFormatWriters }),
    },
    {
      id: DiagnosticIds.OpExpansionCycle,
      description: 'cyclic inline op expansion graph',
      run: () => compile(join(fixtures, 'pr16_op_cycle.zax'), {}, { formats: defaultFormatWriters }),
    },
    {
      id: DiagnosticIds.OpInvalidExpansion,
      description: 'expanded op body is not a valid concrete instruction',
      run: () =>
        compile(join(fixtures, 'pr270_op_invalid_expansion_diagnostics.zax'), {}, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.OpStackPolicyRisk,
      description: 'op static stack delta violates configured policy (error mode)',
      run: () =>
        compile(join(fixtures, 'pr271_op_stack_policy_delta_warn.zax'), { opStackPolicy: 'error' }, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.RawCallTypedTargetWarning,
      description: 'raw call targets typed callable (opt-in warning)',
      run: () =>
        compile(join(fixtures, 'pr278_raw_call_typed_target_warning.zax'), { rawTypedCallWarnings: true }, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.SemanticsError,
      description: 'const evaluation fails after type issue (sizeof unknown type)',
      run: () =>
        compile(join(fixtures, 'pr8_sizeof_unknown.zax'), {}, { formats: defaultFormatWriters }),
    },
    {
      id: DiagnosticIds.ImmDivideByZero,
      description: 'divide by zero in imm expression',
      run: () => compile(join(fixtures, 'pr2_div_zero.zax'), {}, { formats: defaultFormatWriters }),
    },
    {
      id: DiagnosticIds.ImmModuloByZero,
      description: 'modulo by zero in imm expression',
      run: () => {
        const { entry, cleanup } = writeTempEntry(`const Bad = 1 % 0

export func main(): HL
  hl := 0
end
`);
        return compile(entry, {}, { formats: defaultFormatWriters }).finally(cleanup);
      },
    },
    {
      id: DiagnosticIds.TypeError,
      description: 'unknown type name in sizeof()',
      run: () =>
        compile(join(fixtures, 'pr8_sizeof_unknown.zax'), {}, { formats: defaultFormatWriters }),
    },
    {
      id: DiagnosticIds.CaseStyleLint,
      description: 'case-style policy flags non-canonical mnemonic/register casing',
      run: () =>
        compile(join(fixtures, 'pr263_case_style_lint.zax'), { caseStyle: 'upper' }, {
          formats: defaultFormatWriters,
        }),
    },
    {
      id: DiagnosticIds.IndexParenRedundant,
      description: 'constant index has redundant outer parentheses',
      run: () =>
        compile(join(fixtures, 'pr277_index_redundant_paren_warning.zax'), {}, {
          formats: defaultFormatWriters,
        }),
    },
  ];

  it('has exactly one reachability case per DiagnosticId (no duplicates, no omissions)', () => {
    expect(cases.length).toBe(ALL_DIAGNOSTIC_IDS.length);
    const seen = new Set<DiagnosticId>();
    for (const c of cases) {
      expect(seen.has(c.id), `duplicate reachability row for ${c.id}`).toBe(false);
      seen.add(c.id);
    }
    for (const id of ALL_DIAGNOSTIC_IDS) {
      expect(seen.has(id), `missing reachability row for ${id}`).toBe(true);
    }
  });

  it.each(cases)('$id — $description', async ({ id, description: _description, run }) => {
    const res = await run();
    expect(res.diagnostics.some((d) => d.id === id)).toBe(true);
  });
});
