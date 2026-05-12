import { describe, it } from 'vitest';

import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

describe('PR193 parser: explicit asm marker diagnostics', () => {
  it('diagnoses explicit asm marker in function bodies', () => {
    const source = `
func main()
  asm
    nop
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('func_asm.zax', source, diagnostics);

    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes: 'Unexpected "asm" in function body (function bodies are implicit)',
    });
  });

  it('diagnoses explicit asm marker in op bodies', () => {
    const source = `
op halt_now()
  asm
    halt
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('op_asm.zax', source, diagnostics);

    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes: 'Unexpected "asm" in op body (op bodies are implicit)',
    });
  });

  it('diagnoses top-level asm marker usage', () => {
    const source = `
asm
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('top_level_asm.zax', source, diagnostics);

    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes:
        '"asm" is not a top-level construct (function and op bodies are implicit instruction streams)',
    });
  });

  it('diagnoses top-level export asm marker usage', () => {
    const source = `
export asm
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('top_level_export_asm.zax', source, diagnostics);

    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes:
        '"asm" is not a top-level construct (function and op bodies are implicit instruction streams)',
    });
  });

  it('diagnoses asm marker used to terminate function-local var block', () => {
    const source = `
func broken()
  var
    tmp: byte
  asm
    nop
end
`;
    const diagnostics: Diagnostic[] = [];
    parseProgram('func_var_asm_terminator.zax', source, diagnostics);

    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      messageIncludes: 'Function-local var block must end with "end" before function body',
    });
  });
});
