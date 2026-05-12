import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

describe('PR887 := half-index parser support', () => {
  const file = makeSourceFile('pr887_assignment_half_index_parser.zax', '');
  const zeroSpan = span(file, 0, 0);

  function parse(
    text: string,
  ): { instr: ReturnType<typeof parseAsmInstruction>; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const instr = parseAsmInstruction(file.path, text, zeroSpan, diagnostics);
    return { instr, diagnostics };
  }

  it('accepts typed byte transfer forms for IXH/IXL/IYH/IYL', () => {
    for (const text of ['ixh := count', 'ixl := arr[idx]', 'flags := iyh', 'iyl := flag_byte']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr?.head).toBe(':=');
    }
  });

  it('accepts byte immediates for half-index registers', () => {
    for (const text of ['ixh := 0', 'ixl := 1', 'iyh := 2', 'iyl := 3']) {
      const parsed = parse(text);
      expectNoDiagnostics(parsed.diagnostics);
      expect(parsed.instr).toMatchObject({
        kind: 'AsmInstruction',
        head: ':=',
        operands: [{ kind: 'Reg' }, { kind: 'Imm' }],
      });
    }
  });

  it('continues to reject raw indirect and non-assignment registers', () => {
    for (const text of ['ixh := (hl)', '(ix+4) := iyl', 'i := count', 'r := count']) {
      const parsed = parse(text);
      expect(parsed.instr).toBeUndefined();
      expectDiagnostic(parsed.diagnostics, { messageIncludes: ':=' });
    }
  });
});
