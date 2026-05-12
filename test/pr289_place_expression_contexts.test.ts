import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  hasRawOpcode,
} from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR289: place-expression semantics for field/element operands', () => {
  it('applies value/store contexts for scalar place expressions and address contexts for ea params', async () => {
    const entry = join(__dirname, 'fixtures', 'pr289_place_expression_contexts_positive.zax');
    const { program, diagnostics } = await compilePlacedProgram(entry);
    expectNoDiagnostics(diagnostics);
    const instrs = flattenLoweredInstructions(program);

    // Field place-expression in value/store contexts.
    expect(hasRawOpcode(instrs, 0x3a)).toBe(true); // LD A,(nn)
    expect(hasRawOpcode(instrs, 0x32)).toBe(true); // LD (nn),A

    // Array element place-expression in value/store contexts.
    expect(hasRawOpcode(instrs, 0x7e)).toBe(true); // LD A,(HL)
    expect(hasRawOpcode(instrs, 0x77)).toBe(true); // LD (HL),A
  });

  it('rejects passing dereference forms to ea-typed parameters', async () => {
    const entry = join(__dirname, 'fixtures', 'pr289_place_expression_contexts_negative.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.artifacts).toEqual([]);
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.OpNoMatchingOverload,
      severity: 'error',
      messageIncludes: 'No matching op overload',
    });
    expectDiagnostic(res.diagnostics, {
      id: DiagnosticIds.OpNoMatchingOverload,
      severity: 'error',
      messageIncludes: 'expects ea, got (p.lo)',
    });
  });
});
