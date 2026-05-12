import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseProgram } from '../../src/frontend/parser.js';

describe('PR638 return register representation', () => {
  it('keeps FuncDecl returnRegs canonical as [] when omitted', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram('pr638_func_return_regs.zax', ['func main()', 'end', ''].join('\n'), diagnostics);

    expect(diagnostics).toEqual([]);
    const fn = program.files[0]?.items[0];
    expect(fn).toMatchObject({ kind: 'FuncDecl', name: 'main', returnRegs: [] });
  });
});
