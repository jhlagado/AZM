import { describe, expect, it } from 'vitest';

import { loadProgram } from '../../../src/index.js';
import {
  instructionHead,
  instructionOperandCount,
} from '../../../src/register-care/instruction-shape.js';
import { buildRegisterCareProgramModel } from '../../../src/register-care/programModel.js';
import { inferRoutineSummary } from '../../../src/register-care/summary.js';
import type { RegisterCareProgramModel } from '../../../src/register-care/types.js';
import { withTempSource } from '../../helpers/temp_source.js';
import { parseRegisterCareItems, parseRegisterCareItemsFromSources } from './parse-helpers.js';

function directCallTargets(model: RegisterCareProgramModel): string[] {
  return [...new Set(model.directCalls.map((c) => c.target))].sort();
}

describe('register-care program model', () => {
  it('collects labels, instructions, and direct call targets', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    expect(directCallTargets(model)).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['START', 'HELPER']);
    expect(model.routines.find((r) => r.name === 'HELPER')?.instructions.map(instructionHead)).toEqual([
      'ld',
      'ret',
    ]);
  });

  it('keeps internal labels inside a routine body', () => {
    const items = parseRegisterCareItems(
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

    const model = buildRegisterCareProgramModel(items);

    const routine = model.routines.find((r) => r.name === 'LOOP_ROUTINE');
    expect(routine?.labels).toContain('.loop');
    expect(routine?.instructions.map(instructionHead)).toEqual(['djnz', 'ret']);
  });

  it('coalesces consecutive global labels before the first instruction as aliases', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      [
        'ALIAS:',
        'HELPER:',
        '    ld de,$2000',
        '    ret',
        'START:',
        '    call ALIAS',
        '    inc de',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    const alias = model.routines.find((r) => r.name === 'ALIAS');
    expect(model.routines.map((r) => r.name)).toEqual(['ALIAS', 'START']);
    expect(alias?.labels).toEqual(['ALIAS', 'HELPER']);
    expect(alias?.instructions.map(instructionHead)).toEqual(['ld', 'ret']);
  });

  it('uses at-prefixed labels as routine entries when present', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      [
        '@CheckCollAtDe:',
        '    push bc',
        '    ld b,4',
        'CheckCollRow:',
        '    djnz CheckCollRow',
        'CollExitOk:',
        '    pop bc',
        '    ret',
        '@RotateTestDone:',
        '    call CheckCollAtDe',
        'RotateAccept:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    expect(model.routines.map((routine) => routine.name)).toEqual(['CheckCollAtDe', 'RotateTestDone']);
    expect(model.routines.find((routine) => routine.name === 'CheckCollAtDe')?.labels).toEqual([
      'CheckCollAtDe',
      'CheckCollRow',
      'CollExitOk',
    ]);
    expect(
      model.routines
        .find((routine) => routine.name === 'CheckCollAtDe')
        ?.instructions.map((item) => instructionHead(item)),
    ).toEqual(['push', 'ld', 'djnz', 'pop', 'ret']);
  });

  it('treats jumps to at-prefixed labels as tail-call boundaries in entry mode', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      [
        '@START:',
        '    jp Internal',
        '    jp nz,HELPER',
        'Internal:',
        '    jp HELPER',
        '@HELPER:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    expect(model.directBoundaries.map((boundary) => boundary.subject)).toEqual(['JP HELPER', 'JP HELPER']);
  });

  it('keeps at-entry mode local to each source file during migration', () => {
    const sharedText = ['@LcdScript:', '    ret', '.end'].join('\n');
    const pacmoText = [
      'LcdShowPacSplash:',
      '    ld hl,ScriptPacSplash',
      '    jp LcdScript',
      'LcdShowPacOver:',
      '    ret',
      '.end',
    ].join('\n');
    const items = parseRegisterCareItemsFromSources([
      { path: '/tmp/shared.asm', text: sharedText },
      { path: '/tmp/pacmo.asm', text: pacmoText },
    ]);

    const model = buildRegisterCareProgramModel(items);

    expect(model.routines.map((r) => r.name)).toEqual([
      'LcdScript',
      'LcdShowPacSplash',
      'LcdShowPacOver',
    ]);
    expect(model.directBoundaries.map((boundary) => boundary.subject)).toContain('JP LcdScript');
  });

  it('includes conditional direct call targets', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      ['START:', '    call nz,HELPER', '    ret', 'HELPER:', '    ret', '.end'].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    expect(directCallTargets(model)).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['START', 'HELPER']);
  });

  it('sorts multiple direct call targets and collects each routine', () => {
    const items = parseRegisterCareItems(
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

    const model = buildRegisterCareProgramModel(items);

    expect(directCallTargets(model)).toEqual(['ALPHA', 'ZED']);
    expect(model.routines.map((r) => r.name)).toEqual(['START', 'ZED', 'ALPHA']);
  });

  it('parses direct local labels and local djnz targets', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      [
        'START:',
        '    call LOOP_ROUTINE',
        'LOOP_ROUTINE:',
        '.loop:',
        '    djnz .loop',
        '    ret',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    const routine = model.routines.find((r) => r.name === 'LOOP_ROUTINE');
    expect(routine?.labels).toEqual(['LOOP_ROUTINE', '.loop']);
    const djnz = routine?.instructions[0]?.instruction;
    expect(djnz?.mnemonic).toBe('djnz');
    if (djnz?.mnemonic === 'djnz') {
      expect(djnz.expression).toMatchObject({ kind: 'symbol', name: '.loop' });
    }
  });

  it('models the first global label as an entry routine without a synthetic caller', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      [
        'START:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        'HELPER:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    expect(model.routines.map((r) => r.name)).toEqual(['START', 'HELPER']);
    expect(model.routines.find((r) => r.name === 'START')?.instructions.map(instructionHead)).toEqual([
      'ld',
      'call',
      'inc',
      'ret',
    ]);
  });

  it('keeps conditional returns in the routine so later clobbers are summarized', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.z80',
      [
        'START:',
        '    call HELPER',
        '    ret',
        'HELPER:',
        '    ret z',
        '    ld de,$2000',
        '    ld (de),a',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);
    const helper = model.routines.find((r) => r.name === 'HELPER');
    if (!helper) throw new Error('missing HELPER routine');
    const summary = inferRoutineSummary(helper);

    expect(
      helper.instructions.map(
        (i) => `${instructionHead(i)} ${instructionOperandCount(i.instruction)}`,
      ),
    ).toEqual(['ret-cc 1', 'ld 2', 'ld 2', 'ret 0']);
    expect(summary.mayWrite).toEqual(expect.arrayContaining(['D', 'E']));
  });

  it('does not collect direct call targets from op declarations', async () => {
    await withTempSource(
      'azm-regcare-program-op-',
      'asm',
      ['op macro_call()', '  call HELPER', 'end', ''].join('\n'),
      async (entry) => {
        const loaded = await loadProgram({ entryFile: entry });
        expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        if (!loaded.loadedProgram) throw new Error('expected loaded program');

        const model = buildRegisterCareProgramModel(loaded.loadedProgram.program.files[0].items);

        expect(directCallTargets(model)).toEqual([]);
        expect(model.routines).toEqual([]);
      },
    );
  });

  it('collects routines and call targets from labels', () => {
    const items = parseRegisterCareItems(
      '/tmp/main.asm',
      ['typed_call:', '  call HELPER', ''].join('\n'),
    );

    const model = buildRegisterCareProgramModel(items);

    expect(directCallTargets(model)).toEqual(['HELPER']);
    expect(model.routines.map((routine) => routine.name)).toEqual(['typed_call']);
    expect(model.routines[0]?.instructions.map((item) => instructionHead(item))).toEqual(['call']);
  });
});
