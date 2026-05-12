import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

const parse = (text: string) => {
  const diagnostics: Diagnostic[] = [];
  const program = parseProgram('pr798_addr_expr.zax', text, diagnostics);
  return { program, diagnostics };
};

describe('PR798 address-of storage path parser', () => {
  it('accepts := rr, @path forms', () => {
    const { diagnostics, program } = parse(`
section code text at $0000
export func main()
  hl := @x
  de := @array[i]
  bc := @record.field
  hl := @<Sprite>ix.flags
  ret
end
end
    `);
    expectNoDiagnostics(diagnostics);

    const section = program.files[0]?.items.find((i: any) => i.kind === 'NamedSection');
    expect(section).toBeDefined();
  });

  it('rejects destination-side @path', () => {
    const { diagnostics } = parse(`
section code text at $0000
export func main()
  @x := hl
  ret
end
end
    `);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes: '":="',
    });
  });

  it('rejects nested or parenthesized @ forms', () => {
    const { diagnostics } = parse(`
section code text at $0000
export func main()
  hl := @@x
  hl := @(@x)
  hl := @(array[i])
  hl := array[@i]
  ret
end
end
    `);
    expect(diagnostics.length).toBeGreaterThan(0);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes: 'address-of',
    });
  });

  it('rejects ld with @path', () => {
    const { diagnostics } = parse(`
section code text at $0000
export func main()
  ld hl, @x
  ret
end
end
    `);
    expect(diagnostics.length).toBeGreaterThan(0);
  });

  it('still accepts := rr, path', () => {
    const { diagnostics } = parse(`
section code text at $0000
export func main()
  hl := x
  ret
end
end
    `);
    expectNoDiagnostics(diagnostics);
  });
});
