import { describe, expect, it } from 'vitest';

import { parseProgram } from '../src/frontend/parser.js';
import type { AsmInstructionNode, FuncDeclNode } from '../src/frontend/ast.js';
import { DiagnosticIds, type Diagnostic } from '../src/diagnosticTypes.js';
import { expectDiagnostic } from './helpers/diagnostics/index.js';

describe('parser nested EA index expressions', () => {
  it('parses arr[table[0]] without spurious imm diagnostics', () => {
    const source = `
export func main()
    ld hl, arr[table[0]]
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('nested.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const func = program.files[0]?.items.find(
      (item): item is FuncDeclNode => item.kind === 'FuncDecl',
    );
    expect(func).toBeDefined();
    const instr = func!.asm.items[0] as AsmInstructionNode;
    const src = instr.operands[1];
    expect(src?.kind).toBe('Ea');
    if (!src || src.kind !== 'Ea') return;
    expect(src.expr.kind).toBe('EaIndex');
    if (src.expr.kind !== 'EaIndex') return;
    expect(src.expr.index.kind).toBe('IndexEa');
  });

  it('reports malformed nested index syntax as operand error', () => {
    const source = `
export func main()
    ld hl, arr[table[0]
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('broken.zax', source, diagnostics);
    expect(diagnostics.length).toBeGreaterThan(0);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes: 'Invalid imm expression',
    });
  });

  it('distinguishes arr[HL] (reg16 index) from arr[(HL)] (indirect byte index)', () => {
    const source = `
export func main()
    ld a, arr[HL]
    ld b, arr[(HL)]
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('index-forms.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const func = program.files[0]?.items.find(
      (item): item is FuncDeclNode => item.kind === 'FuncDecl',
    );
    expect(func).toBeDefined();

    const first = func!.asm.items[0] as AsmInstructionNode;
    const second = func!.asm.items[1] as AsmInstructionNode;

    const firstSrc = first.operands[1];
    expect(firstSrc?.kind).toBe('Ea');
    if (!firstSrc || firstSrc.kind !== 'Ea' || firstSrc.expr.kind !== 'EaIndex') return;
    expect(firstSrc.expr.index.kind).toBe('IndexReg16');

    const secondSrc = second.operands[1];
    expect(secondSrc?.kind).toBe('Ea');
    if (!secondSrc || secondSrc.kind !== 'Ea' || secondSrc.expr.kind !== 'EaIndex') return;
    expect(secondSrc.expr.index.kind).toBe('IndexMemHL');
  });
});
