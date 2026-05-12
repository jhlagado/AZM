import { describe, expect, it } from 'vitest';

import { parseProgram } from '../../src/frontend/parser.js';
import type { AsmInstructionNode, FuncDeclNode, OpDeclNode } from '../../src/frontend/ast.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';

describe('PR250 parser asm head canonicalization', () => {
  it('normalizes function-body instruction heads to lower-case', () => {
    const source = `
func main()
  LD A, 1
  dJnZ loop
  loop:
  Ret
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('mixed-case-func.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const func = program.files[0]?.items.find(
      (item): item is FuncDeclNode => item.kind === 'FuncDecl',
    );
    expect(func).toBeDefined();
    const heads = func!.asm.items
      .filter((item): item is AsmInstructionNode => item.kind === 'AsmInstruction')
      .map((instr) => instr.head);
    expect(heads).toEqual(['ld', 'djnz', 'ret']);
  });

  it('normalizes op-body instruction heads to lower-case', () => {
    const source = `
op emit_nops(count: imm8)
  NOP
  dJnZ count
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('mixed-case-op.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const opDecl = program.files[0]?.items.find(
      (item): item is OpDeclNode => item.kind === 'OpDecl',
    );
    expect(opDecl).toBeDefined();
    const heads = opDecl!.body.items
      .filter((item): item is AsmInstructionNode => item.kind === 'AsmInstruction')
      .map((instr) => instr.head);
    expect(heads).toEqual(['nop', 'djnz']);
  });
});
