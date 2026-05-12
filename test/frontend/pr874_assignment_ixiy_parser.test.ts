import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR874 := IX/IY parser support', () => {
  const file = makeSourceFile('pr874_assignment_ixiy_parser.zax', '');
  const zeroSpan = span(file, 0, 0);

  function parse(
    text: string,
  ): { instr: ReturnType<typeof parseAsmInstruction>; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const instr = parseAsmInstruction(file.path, text, zeroSpan, diagnostics);
    return { instr, diagnostics };
  }

  it('accepts IX and IY whole-register assignment forms', () => {
    for (const text of ['ix := word_var', 'iy := @node.next', 'ix := arr_w[idx + 1]', 'ix := 0', 'iy := hl']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr?.kind).toBe('AsmInstruction');
      expect(parsed.instr?.head).toBe(':=');
      expect(parsed.instr?.operands[0]).toMatchObject({ kind: 'Reg' });
    }
  });

  it('keeps raw indirect forms rejected', () => {
    for (const text of ['a := (ix+4)', '(ix+4) := a']) {
      const parsed = parse(text);
      expect(parsed.instr).toBeUndefined();
      expectDiagnostic(parsed.diagnostics, { messageIncludes: ':=' });
    }
  });

  it('keeps existing reg8 and pair forms accepted', () => {
    for (const text of ['b := count', 'flags := b', 'hl := de', 'hl := @x']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr?.head).toBe(':=');
    }
  });
});
