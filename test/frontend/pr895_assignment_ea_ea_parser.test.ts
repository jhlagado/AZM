import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR895 := scalar path-to-path parser support', () => {
  const file = makeSourceFile('pr895_assignment_ea_ea_parser.zax', '');
  const zeroSpan = span(file, 0, 0);

  function parse(
    text: string,
  ): { instr: ReturnType<typeof parseAsmInstruction>; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const instr = parseAsmInstruction(file.path, text, zeroSpan, diagnostics);
    return { instr, diagnostics };
  }

  it('accepts path-to-path and address-of storage assignment forms', () => {
    for (const text of ['arr2[0] := arr1[1]', 'dst := src_word', 'ptr := @arr1[1]']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr?.kind).toBe('AsmInstruction');
      expect(parsed.instr?.head).toBe(':=');
    }
  });

  it('keeps arithmetic RHS expressions out of scope', () => {
    for (const text of ['dst := src_word + 1', 'arr2[0] := arr1[1] + 1']) {
      const parsed = parse(text);
      expect(parsed.instr).toBeUndefined();
      expectDiagnostic(parsed.diagnostics, { messageIncludes: ':=' });
    }
  });
});
