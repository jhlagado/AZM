import { describe, expect, it } from 'vitest';

import { parseProgram } from '../../src/frontend/parser.js';
import type { AsmInstructionNode, FuncDeclNode, OpDeclNode } from '../../src/frontend/ast.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';

function asmInstructions(items: { kind: string }[]): AsmInstructionNode[] {
  return items.filter((item): item is AsmInstructionNode => item.kind === 'AsmInstruction');
}

describe('PR252 parser register token canonicalization', () => {
  it('normalizes reg operands and ea index reg operands in functions', () => {
    const source = `
func main()
  ld a, b
  push aF'
  ld hl, arr[d]
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('reg-casing-func.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const func = program.files[0]?.items.find(
      (item): item is FuncDeclNode => item.kind === 'FuncDecl',
    );
    expect(func).toBeDefined();
    const instr = asmInstructions(func!.asm.items);

    const ld = instr[0]!;
    expect(ld.operands[0]?.kind).toBe('Reg');
    expect(ld.operands[1]?.kind).toBe('Reg');
    if (ld.operands[0]?.kind !== 'Reg' || ld.operands[1]?.kind !== 'Reg') return;
    expect(ld.operands[0].name).toBe('A');
    expect(ld.operands[1].name).toBe('B');

    const push = instr[1]!;
    expect(push.operands[0]?.kind).toBe('Reg');
    if (push.operands[0]?.kind !== 'Reg') return;
    expect(push.operands[0].name).toBe("AF'");

    const indexed = instr[2]!;
    expect(indexed.operands[1]?.kind).toBe('Ea');
    if (indexed.operands[1]?.kind !== 'Ea') return;
    expect(indexed.operands[1].expr.kind).toBe('EaIndex');
    if (indexed.operands[1].expr.kind !== 'EaIndex') return;
    expect(indexed.operands[1].expr.index.kind).toBe('IndexReg8');
    if (indexed.operands[1].expr.index.kind !== 'IndexReg8') return;
    expect(indexed.operands[1].expr.index.reg).toBe('D');
  });

  it('normalizes ea index reg operands in ops', () => {
    const source = `
op main(src: reg8)
  ld hl, table[c]
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('reg-casing-op.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const opDecl = program.files[0]?.items.find(
      (item): item is OpDeclNode => item.kind === 'OpDecl',
    );
    expect(opDecl).toBeDefined();
    const instr = asmInstructions(opDecl!.body.items);
    expect(instr).toHaveLength(1);
    const ld = instr[0]!;
    expect(ld.operands[1]?.kind).toBe('Ea');
    if (ld.operands[1]?.kind !== 'Ea') return;
    expect(ld.operands[1].expr.kind).toBe('EaIndex');
    if (ld.operands[1].expr.kind !== 'EaIndex') return;
    expect(ld.operands[1].expr.index.kind).toBe('IndexReg8');
    if (ld.operands[1].expr.index.kind !== 'IndexReg8') return;
    expect(ld.operands[1].expr.index.reg).toBe('C');
  });
});
