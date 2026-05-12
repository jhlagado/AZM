import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR868 := reg8 parser support', () => {
  const file = makeSourceFile('pr868_assignment_reg8_parser.zax', '');
  const zeroSpan = span(file, 0, 0);

  function parse(
    text: string,
  ): { instr: ReturnType<typeof parseAsmInstruction>; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const instr = parseAsmInstruction(file.path, text, zeroSpan, diagnostics);
    return { instr, diagnostics };
  }

  it('accepts reg8 typed storage loads and stores', () => {
    for (const text of ['b := count', 'l := idx', 'b := arr[idx]', 'flags := b']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr?.head).toBe(':=');
    }
  });

  it('accepts reg8 immediate assignments', () => {
    for (const text of ['l := 0', 'b := 1', 'h := 2', 'e := 3']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr).toMatchObject({
        kind: 'AsmInstruction',
        head: ':=',
        operands: [{ kind: 'Reg' }, { kind: 'Imm' }],
      });
    }
  });

  it('keeps raw indirect forms rejected', () => {
    for (const text of ['a := (hl)', '(hl) := a', '(ix+4) := a']) {
      const parsed = parse(text);
      expect(parsed.instr).toBeUndefined();
      expectDiagnostic(parsed.diagnostics, { messageIncludes: ':=' });
    }
  });

  it('keeps existing stage 1 pair forms accepted', () => {
    for (const text of ['hl := de', 'hl := 0', 'de := a', 'hl := @x']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr?.head).toBe(':=');
    }
  });
});
