import { describe, expect, it } from 'vitest';

import { parseProgram } from '../../src/frontend/parser.js';
import type { AsmControlNode, FuncDeclNode, OpDeclNode } from '../../src/frontend/ast.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';

function controlItems(items: { kind: string }[]): AsmControlNode[] {
  return items.filter((item): item is AsmControlNode =>
    ['If', 'While', 'Until', 'Else', 'End', 'Repeat', 'Select', 'Case', 'SelectElse'].includes(
      item.kind,
    ),
  );
}

describe('PR253 parser control cc canonicalization', () => {
  it('normalizes function-body condition codes to lower-case', () => {
    const source = `
func main()
  if Nz
    nop
  end
  while C
    nop
  end
  repeat
    nop
  until pE
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('control-cc-func.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const func = program.files[0]?.items.find(
      (item): item is FuncDeclNode => item.kind === 'FuncDecl',
    );
    expect(func).toBeDefined();
    const controls = controlItems(func!.asm.items);

    const ifNode = controls.find(
      (item): item is Extract<AsmControlNode, { kind: 'If' }> => item.kind === 'If',
    );
    const whileNode = controls.find(
      (item): item is Extract<AsmControlNode, { kind: 'While' }> => item.kind === 'While',
    );
    const untilNode = controls.find(
      (item): item is Extract<AsmControlNode, { kind: 'Until' }> => item.kind === 'Until',
    );
    expect(ifNode?.cc).toBe('nz');
    expect(whileNode?.cc).toBe('c');
    expect(untilNode?.cc).toBe('pe');
  });

  it('normalizes op-body condition codes to lower-case', () => {
    const source = `
op spin()
  if pO
    nop
  end
end
`;
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('control-cc-op.zax', source, diagnostics);
    expect(diagnostics).toEqual([]);

    const opDecl = program.files[0]?.items.find(
      (item): item is OpDeclNode => item.kind === 'OpDecl',
    );
    expect(opDecl).toBeDefined();
    const controls = controlItems(opDecl!.body.items);
    const ifNode = controls.find(
      (item): item is Extract<AsmControlNode, { kind: 'If' }> => item.kind === 'If',
    );
    expect(ifNode?.cc).toBe('po');
  });
});
