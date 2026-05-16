import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import type { ModuleFileNode, ProgramNode } from '../../src/frontend/ast.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseClassicModuleFile } from '../../src/frontend/asm80/parseClassicModule.js';
import { buildRegisterCareProgramModel } from '../../src/registerCare/programModel.js';

function parseProgram(path: string, text: string): ProgramNode {
  const diagnostics: Diagnostic[] = [];
  const sf = makeSourceFile(path, text);
  const file = parseClassicModuleFile(path, text, diagnostics, sf) as ModuleFileNode;
  if (diagnostics.length > 0) throw new Error(JSON.stringify(diagnostics));
  return { kind: 'Program', entryFile: path, files: [file], span: span(sf, 0, text.length) };
}

describe('register-care program model', () => {
  it('collects labels, instructions, and direct call targets', () => {
    const program = parseProgram(
      '/tmp/main.z80',
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['HELPER']);
    expect(model.routines[0]?.instructions.map((i) => i.head)).toEqual(['ld', 'ret']);
  });

  it('keeps internal labels inside a routine body', () => {
    const program = parseProgram(
      '/tmp/main.z80',
      [
        'START:',
        '    call LOOP_ROUTINE',
        '    ret',
        'LOOP_ROUTINE:',
        '.loop:',
        '    djnz .loop',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.routines[0]?.labels).toContain('.loop');
    expect(model.routines[0]?.instructions.map((i) => i.head)).toEqual(['djnz', 'ret']);
  });
});
