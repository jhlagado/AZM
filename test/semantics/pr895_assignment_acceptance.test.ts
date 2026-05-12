import { describe, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import type { ProgramNode } from '../../src/frontend/ast.js';
import { parseModuleFile } from '../../src/frontend/parser.js';
import { validateAssignmentAcceptance } from '../../src/semantics/assignmentAcceptance.js';
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

describe('PR895 := scalar path-to-path acceptance', () => {
  it('accepts scalar path-to-path and compatible @path assignments', () => {
    const { program, diagnostics } = parseProgram(
      'pr895_assignment_acceptance_positive.zax',
      `
type Pair
  left: word
  right: word
end

section data globals at $8000
  arr1: byte[4]
  arr2: byte[4]
  src_word: word
  dst: word
  ptr: addr
end

section code text at $0000
func main()
  arr2[0] := arr1[1]
  dst := src_word
  ptr := @arr1[1]
  ret
end
end
      `,
    );

    const env = buildEnv(program, diagnostics);
    validateAssignmentAcceptance(program, env, diagnostics);

    expectNoDiagnostics(diagnostics);
  });

  it('rejects composite decay and composite-to-composite assignment', () => {
    const { program, diagnostics } = parseProgram(
      'pr895_assignment_acceptance_negative.zax',
      `
type Rec
  x: byte
  y: byte
end

section data globals at $8000
  arr1: byte[4]
  arr2: byte[4]
  ptr: addr
  dst_rec: Rec
  src_rec: Rec
end

section code text at $0000
func main()
  arr2[0] := arr1
  dst_rec := src_rec
  ptr := arr1
  ret
end
end
      `,
    );

    const env = buildEnv(program, diagnostics);
    validateAssignmentAcceptance(program, env, diagnostics);

    expectDiagnostic(diagnostics, {
      message: '":=" path source must resolve to scalar storage; got byte[4]. Use "@path" for addresses.',
    });
    expectDiagnostic(diagnostics, {
      message: '":=" path target must resolve to scalar storage; got Rec.',
    });
  });

  it('rejects storage-target path forms inside ops in this slice', () => {
    const { program, diagnostics } = parseProgram(
      'pr895_assignment_acceptance_op_negative.zax',
      `
op copy_slot(dst: ea, src: ea)
  dst := src
end

op bind_addr(dst: ea, src: ea)
  dst := @src
end
      `,
    );

    const env = buildEnv(program, diagnostics);
    validateAssignmentAcceptance(program, env, diagnostics);

    expectDiagnostic(diagnostics, {
      message: '":=" path-to-path storage-target forms are not supported inside ops in this slice.',
    });
    expectDiagnostic(diagnostics, {
      message: '":=" address-of storage-target forms are not supported inside ops in this slice.',
    });
  });
});
