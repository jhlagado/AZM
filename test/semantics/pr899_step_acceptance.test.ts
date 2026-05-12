import { describe, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import type { ProgramNode } from '../../src/frontend/ast.js';
import { parseModuleFile } from '../../src/frontend/parser.js';
import { validateStepAcceptance } from '../../src/semantics/stepAcceptance.js';
import { buildEnv } from '../../src/semantics/env.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

function parseProgram(modulePath: string, source: string): { program: ProgramNode; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const moduleFile = parseModuleFile(modulePath, source, diagnostics);
  const program: ProgramNode = {
    kind: 'Program',
    span: moduleFile.span,
    entryFile: modulePath,
    files: [moduleFile],
  };
  return { program, diagnostics };
}

describe('PR899 step acceptance', () => {
  it('accepts scalar byte and word path operands with default and explicit amounts', () => {
    const { program, diagnostics } = parseProgram(
      'pr899_step_positive.zax',
      `
const INC = 3

type Rec
  field: byte
end

section data globals at $8000
  count: byte
  used_slots: word
  arr: byte[4]
  rec: Rec
end

section code text at $0000
func main()
  step count
  step used_slots, 3
  step arr[1], INC
  step rec.field, -2
  ret
end
end
      `,
    );

    const env = buildEnv(program, diagnostics);
    validateStepAcceptance(program, env, diagnostics);

    expectNoDiagnostics(diagnostics);
  });

  it('rejects composite and address-typed operands', () => {
    const { program, diagnostics } = parseProgram(
      'pr899_step_negative.zax',
      `
type Rec
  field: byte
end

section data globals at $8000
  rec: Rec
  addr_slot: addr
  raw_buf:
    db 1, 2, 3
end

section code text at $0000
func main()
  step rec
  step addr_slot
  step raw_buf
  ret
end
end
      `,
    );

    const env = buildEnv(program, diagnostics);
    validateStepAcceptance(program, env, diagnostics);

    expectDiagnostic(diagnostics, { message: '"step" requires scalar storage; got Rec.' });
    expectDiagnostic(diagnostics, {
      message: '"step" only supports byte and word scalar paths in this slice.',
    });
    expectDiagnostic(diagnostics, { message: '"step" requires scalar storage; got unknown.' });
  });

  it('rejects step amounts that are not compile-time integer expressions', () => {
    const { program, diagnostics } = parseProgram(
      'pr899_step_amount_negative.zax',
      `
section data globals at $8000
  count: byte
  delta: byte
end

section code text at $0000
func main()
  step count, delta
  ret
end
end
      `,
    );

    const env = buildEnv(program, diagnostics);
    validateStepAcceptance(program, env, diagnostics);

    expectDiagnostic(diagnostics, {
      message: '"step" amount must be a compile-time integer expression.',
    });
  });

  it('rejects typed-path forms inside ops in this slice', () => {
    const { program, diagnostics } = parseProgram(
      'pr899_step_op_negative.zax',
      `
op bump(slot: ea)
  step slot
end
      `,
    );

    const env = buildEnv(program, diagnostics);
    validateStepAcceptance(program, env, diagnostics);

    expectDiagnostic(diagnostics, {
      message: '"step" typed-path forms are not supported inside ops in this slice.',
    });
  });
});
