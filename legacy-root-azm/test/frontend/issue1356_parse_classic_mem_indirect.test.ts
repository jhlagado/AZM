import { describe, expect, it } from 'vitest';

import { parseAsmOperand } from '../../src/frontend/parseOperands.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';

const file = makeSourceFile('issue1356.asm', '');
const zeroSpan = span(file, 0, 0);

describe('Issue #1356: (hl)/(bc)/(de) asm mem operands are register-indirect', () => {
  it.each(['(hl)', '(HL)', '(bc)', '(de)'] as const)(
    'parses %s as Mem(EaName) canonical reg, not symbol',
    (text) => {
      const diagnostics: import('../../src/diagnosticTypes.js').Diagnostic[] = [];
      const op = parseAsmOperand(file.path, text, zeroSpan, diagnostics);
      expect(diagnostics).toEqual([]);
      expect(op?.kind).toBe('Mem');
      if (op?.kind !== 'Mem') return;
      expect(op.expr.kind).toBe('EaName');
      if (op.expr.kind !== 'EaName') return;
      expect(op.expr.name).toMatch(/^(HL|BC|DE)$/);
      expect(op.expr.name).toBe(text.replace(/[()]/g, '').toUpperCase());
    },
  );
});
