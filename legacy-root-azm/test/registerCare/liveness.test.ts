import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import {
  diagnosticsForRegisterCareConflicts,
  findRegisterCareConflicts,
} from '../../src/registerCare/liveness.js';
import type {
  RegisterCareConflict,
  LocatedSmartComment,
  RegisterCareInstruction,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
  ValueRelation,
} from '../../src/registerCare/types.js';

const TEST_FILE = '/tmp/liveness.z80';

function instruction(text: string, line: number, labels: string[] = []): RegisterCareInstruction {
  const diagnostics: Diagnostic[] = [];
  const sf = makeSourceFile(TEST_FILE, text);
  const parsed = parseAsmInstruction(TEST_FILE, text, span(sf, 0, text.length), diagnostics);
  if (!parsed) throw new Error(`parse failed: ${text}`);
  parsed.span.start.line = line;
  parsed.span.end.line = line;
  return {
    instruction: parsed,
    head: parsed.head,
    file: parsed.span.file,
    line,
    column: 1,
    labels,
  };
}

function caller(lines: string[]): RegisterCareRoutine {
  return callerAt(lines.map((text, idx) => [idx + 1, text]));
}

function callerAt(lines: Array<[number, string]>): RegisterCareRoutine {
  const instructions = lines.map(([line, text]) => instruction(text, line));
  return {
    name: 'CALLER',
    span: instructions[0]!.instruction.span,
    labels: ['CALLER'],
    instructions,
  };
}

function callerWithLabels(
  lines: Array<{ line: number; text: string; labels?: string[] }>,
): RegisterCareRoutine {
  const instructions = lines.map((item) => instruction(item.text, item.line, item.labels ?? []));
  return {
    name: 'CALLER',
    span: instructions[0]!.instruction.span,
    labels: ['CALLER'],
    instructions,
  };
}

function summary(
  name: string,
  options: {
    mayRead?: RegisterCareUnit[];
    mayWrite?: RegisterCareUnit[];
    valueRelations?: ValueRelation[];
  } = {},
): RoutineSummary {
  return {
    name,
    mayRead: options.mayRead ?? [],
    mayWrite: options.mayWrite ?? [],
    preserved: ['A', 'B', 'C', 'H', 'L', 'carry', 'zero', 'sign', 'parity', 'halfCarry'],
    valueRelations: options.valueRelations ?? [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
}

const callee = summary('HELPER', { mayWrite: ['D', 'E'] });
const clobberDe = summary('CLOBBER_DE', { mayWrite: ['D', 'E'] });
const useDe = summary('USE_DE', { mayRead: ['D', 'E'] });
const makeDe = summary('MAKE_DE', { mayWrite: ['D', 'E'] });

function expectSingleConflict(
  conflicts: RegisterCareConflict[],
  callTarget: string,
  carriers: RegisterCareUnit[],
): void {
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0]?.callTarget).toBe(callTarget);
  expect(conflicts[0]?.carriers).toEqual(carriers);
}

describe('register-care liveness conflicts', () => {
  it('reports when a call clobbers a later-read pre-call value', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'call HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expectSingleConflict(conflicts, 'HELPER', ['D', 'E']);
  });

  it('propagates known callee inputs as live reads', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['call CLOBBER_DE', 'call USE_DE', 'ret']),
      new Map([
        ['CLOBBER_DE', clobberDe],
        ['USE_DE', useDe],
      ]),
      [],
    );

    expectSingleConflict(conflicts, 'CLOBBER_DE', ['D', 'E']);
  });

  it('checks conditional direct calls', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'call nz,HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expectSingleConflict(conflicts, 'HELPER', ['D', 'E']);
  });

  it('does not treat unconditional JR as a tail-call boundary', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'jr HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not keep hinted output carriers live before the producing call', () => {
    const hints: LocatedSmartComment[] = [
      { file: TEST_FILE, line: 2, comment: { kind: 'expectOut', carriers: ['D', 'E'] } },
    ];

    const conflicts = findRegisterCareConflicts(
      callerAt([
        [1, 'call CLOBBER_DE'],
        [3, 'call MAKE_DE'],
        [4, 'inc de'],
        [5, 'ret'],
      ]),
      new Map([
        ['CLOBBER_DE', clobberDe],
        ['MAKE_DE', makeDe],
      ]),
      hints,
    );

    expect(conflicts).toEqual([]);
  });

  it('does not keep intentional summary outputs live before the producing call', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['call CLOBBER_HL', 'call MAKE_HL', 'inc hl', 'ret']),
      new Map([
        ['CLOBBER_HL', summary('CLOBBER_HL', { mayWrite: ['H', 'L'] })],
        ['MAKE_HL', summary('MAKE_HL', { valueRelations: [{ out: ['H', 'L'], from: [] }] })],
      ]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('preserves not-taken liveness before conditional calls with intentional outputs', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['call CLOBBER_DE', 'call z,MAKE_DE', 'inc de', 'ret']),
      new Map([
        ['CLOBBER_DE', clobberDe],
        [
          'MAKE_DE',
          summary('MAKE_DE', {
            mayWrite: ['D', 'E'],
            valueRelations: [{ out: ['D', 'E'], from: [] }],
          }),
        ],
      ]),
      [],
    );

    expectSingleConflict(conflicts, 'CLOBBER_DE', ['D', 'E']);
  });

  it('keeps different-register output inputs live before the producing call', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['call CLOBBER_DE', 'call MAKE_HL', 'inc hl', 'ret']),
      new Map([
        ['CLOBBER_DE', clobberDe],
        [
          'MAKE_HL',
          summary('MAKE_HL', {
            mayRead: ['D', 'E'],
            valueRelations: [{ out: ['H', 'L'], from: ['D', 'E'] }],
          }),
        ],
      ]),
      [],
    );

    expectSingleConflict(conflicts, 'CLOBBER_DE', ['D', 'E']);
  });

  it('does not report intentional flag outputs as call conflicts', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['call MAKE_CARRY', 'call c,TARGET', 'ret']),
      new Map([
        ['MAKE_CARRY', summary('MAKE_CARRY', { valueRelations: [{ out: ['carry'], from: [] }] })],
        ['TARGET', summary('TARGET')],
      ]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not report when the value is overwritten before later use', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'call HELPER', 'ld de,$2000', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not report A clobbers before xor-a zeroing', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld a,$7f', 'call CLOBBER_A', 'xor a', 'ld (STATE),a', 'ret']),
      new Map([['CLOBBER_A', summary('CLOBBER_A', { mayWrite: ['A'] })]]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not carry liveness through an unconditional local JP', () => {
    const conflicts = findRegisterCareConflicts(
      callerWithLabels([
        { line: 1, text: 'call HELPER' },
        { line: 2, text: 'jp Exit' },
        { line: 3, text: 'inc ix', labels: ['Skipped'] },
        { line: 4, text: 'ret', labels: ['Exit'] },
      ]),
      new Map([['HELPER', summary('HELPER', { mayWrite: ['IXH', 'IXL'] })]]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not report carriers accepted by an immediate expects-out hint', () => {
    const hints: LocatedSmartComment[] = [
      { file: TEST_FILE, line: 2, comment: { kind: 'expectOut', carriers: ['D', 'E'] } },
    ];

    const conflicts = findRegisterCareConflicts(
      callerAt([
        [1, 'ld de,$1000'],
        [3, 'call HELPER'],
        [4, 'inc de'],
        [5, 'ret'],
      ]),
      new Map([['HELPER', callee]]),
      hints,
    );

    expect(conflicts).toEqual([]);
  });

  it('creates diagnostics for conflicts with the requested severity', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'call HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expect(diagnosticsForRegisterCareConflicts(conflicts, 'warning')).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        severity: 'warning',
        message: expect.stringContaining('CALL HELPER may modify D,E'),
      }),
    );
  });
});
