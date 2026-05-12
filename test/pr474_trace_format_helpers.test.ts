import { describe, expect, it } from 'vitest';

import type { AsmOperandNode, EaExprNode, SourceSpan } from '../src/frontend/ast.js';
import {
  formatAbs16FixupAsm,
  formatAbs16FixupEdAsm,
  formatAbs16FixupPrefixedAsm,
  formatAsmInstrForTrace,
  formatIxDisp,
} from '../src/lowering/traceFormat.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

const eaName = (name: string): EaExprNode => ({ kind: 'EaName', span, name });
const reg = (name: string): AsmOperandNode => ({ kind: 'Reg', span, name });
const immName = (name: string): AsmOperandNode => ({
  kind: 'Imm',
  span,
  expr: { kind: 'ImmName', span, name },
});
const mem = (name: string): AsmOperandNode => ({ kind: 'Mem', span, expr: eaName(name) });

describe('PR474: trace and fixup formatting helpers', () => {
  it('formats asm trace operands deterministically', () => {
    expect(formatAsmInstrForTrace('ld', [reg('A'), mem('glob_b')])).toBe('ld A, (glob_b)');
    expect(formatAsmInstrForTrace('call', [immName('target')])).toBe('call target');
  });

  it('formats absolute fixup traces', () => {
    expect(formatAbs16FixupAsm(0xc2, 'label', 2)).toBe('jp NZ, label + 2');
    expect(formatAbs16FixupEdAsm(0x53, 'dest', 0)).toBe('ld (dest), DE');
    expect(formatAbs16FixupPrefixedAsm(0xdd, 0x2a, 'slot', 0)).toBe('ld IX, (slot)');
  });

  it('formats ix displacements consistently', () => {
    expect(formatIxDisp(4)).toBe('+$04');
    expect(formatIxDisp(-4)).toBe('-$04');
  });
});
