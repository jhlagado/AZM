import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import type {
  AsmInstructionNode,
  AsmLabelNode,
  ModuleFileNode,
  ProgramNode,
  SourceSpan,
} from '../../src/frontend/ast.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import { parseClassicModuleFile } from '../../src/frontend/asm80/parseClassicModule.js';
import { parseProgram as parseZaxProgram } from '../../src/frontend/parser.js';
import { buildRegisterCareProgramModel } from '../../src/registerCare/programModel.js';

function parseClassicProgram(path: string, text: string): ProgramNode {
  const diagnostics: Diagnostic[] = [];
  const sf = makeSourceFile(path, text);
  const file = parseClassicModuleFile(path, text, diagnostics, sf) as ModuleFileNode;
  if (diagnostics.length > 0) throw new Error(JSON.stringify(diagnostics));
  return { kind: 'Program', entryFile: path, files: [file], span: span(sf, 0, text.length) };
}

function parseZax(path: string, text: string): ProgramNode {
  const diagnostics: Diagnostic[] = [];
  const program = parseZaxProgram(path, text, diagnostics);
  if (diagnostics.length > 0) throw new Error(JSON.stringify(diagnostics));
  return program;
}

function testSpan(file = '/tmp/main.zax'): SourceSpan {
  return {
    file,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
}

function label(name: string, s = testSpan()): AsmLabelNode {
  return { kind: 'AsmLabel', name, span: s };
}

function instruction(
  head: string,
  operands: AsmInstructionNode['operands'] = [],
  s = testSpan(),
): AsmInstructionNode {
  return { kind: 'AsmInstruction', head, operands, span: s };
}

function immName(name: string, s = testSpan()): AsmInstructionNode['operands'][number] {
  return { kind: 'Imm', span: s, expr: { kind: 'ImmName', span: s, name } };
}

describe('register-care program model', () => {
  it('collects labels, instructions, and direct call targets', () => {
    const program = parseClassicProgram(
      '/tmp/main.z80',
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['HELPER']);
    expect(model.routines[0]?.instructions.map((i) => i.head)).toEqual(['ld', 'ret']);
  });

  it('keeps internal labels inside a routine body', () => {
    const program = parseClassicProgram(
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

  it('includes conditional direct call targets', () => {
    const program = parseClassicProgram(
      '/tmp/main.z80',
      ['START:', '    call nz,HELPER', '    ret', 'HELPER:', '    ret', '.end'].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['HELPER']);
  });

  it('sorts multiple direct call targets and collects each routine', () => {
    const program = parseClassicProgram(
      '/tmp/main.z80',
      [
        'START:',
        '    call ZED',
        '    call ALPHA',
        '    ret',
        'ZED:',
        '    ret',
        'ALPHA:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual(['ALPHA', 'ZED']);
    expect(model.routines.map((r) => r.name)).toEqual(['ZED', 'ALPHA']);
  });

  it('flattens named code sections', () => {
    const s = testSpan('/tmp/section.zax');
    const program = {
      kind: 'Program',
      entryFile: '/tmp/section.zax',
      span: s,
      files: [
        {
          kind: 'ModuleFile',
          path: '/tmp/section.zax',
          moduleId: 'section',
          span: s,
          items: [
            {
              kind: 'NamedSection',
              section: 'code',
              name: 'boot',
              span: s,
              items: [
                label('START', s),
                instruction('call', [immName('HELPER', s)], s),
                label('HELPER', s),
                instruction('ret', [], s),
              ],
            },
          ],
        },
      ],
    } as unknown as ProgramNode;

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['HELPER']);
  });

  it('parses direct local labels and local djnz targets', () => {
    const program = parseClassicProgram(
      '/tmp/main.z80',
      ['START:', '    call LOOP_ROUTINE', 'LOOP_ROUTINE:', '.loop:', '    djnz .loop', '    ret'].join(
        '\n',
      ),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.routines[0]?.labels).toEqual(['LOOP_ROUTINE', '.loop']);
    expect(model.routines[0]?.instructions[0]?.instruction.operands[0]).toMatchObject({
      kind: 'Imm',
      expr: { kind: 'ImmName', name: '.loop' },
    });
  });

  it('does not collect direct call targets from op declarations', () => {
    const program = parseZax(
      '/tmp/main.zax',
      ['op macro_call()', '  call HELPER', 'end', ''].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual([]);
    expect(model.routines).toEqual([]);
  });

  it('does not collect direct call targets from function declarations', () => {
    const program = parseZax(
      '/tmp/main.zax',
      ['func typed_call()', '  call HELPER', 'end', ''].join('\n'),
    );

    const model = buildRegisterCareProgramModel(program);

    expect(model.directCallTargets).toEqual([]);
    expect(model.routines).toEqual([]);
  });
});
