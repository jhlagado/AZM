import { describe, expect, it } from 'vitest';

import { findRegisterContractsConflicts } from '../../../src/register-contracts/liveness.js';
import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';
import type {
  LocatedSmartComment,
  RegisterContractsConflict,
  RegisterContractsInstruction,
  RegisterContractsRoutine,
  RegisterContractsUnit,
  RoutineSummary,
} from '../../../src/register-contracts/types.js';

const TEST_FILE = '/tmp/liveness.z80';

function instruction(
  text: string,
  line: number,
  labels: string[] = [],
): RegisterContractsInstruction {
  const parsed = parseZ80Instruction(text);
  if (!parsed?.instruction) throw new Error(`parse failed: ${text}`);
  return {
    instruction: parsed.instruction,
    file: TEST_FILE,
    line,
    column: 1,
    labels,
  };
}

function caller(lines: string[]): RegisterContractsRoutine {
  return callerAt(lines.map((text, idx) => [idx + 1, text]));
}

function callerAt(lines: Array<[number, string]>): RegisterContractsRoutine {
  const instructions = lines.map(([line, text]) => instruction(text, line));
  return {
    name: 'CALLER',
    labels: ['CALLER'],
    entryLabels: ['CALLER'],
    instructions,
    span: {
      file: TEST_FILE,
      start: { line: 1, column: 1 },
      end: { line: instructions.at(-1)?.line ?? 1, column: 1 },
    },
  };
}

function callerWithLabels(
  lines: Array<{ line: number; text: string; labels?: string[] }>,
): RegisterContractsRoutine {
  const instructions = lines.map((item) => instruction(item.text, item.line, item.labels ?? []));
  return {
    name: 'CALLER',
    labels: ['CALLER'],
    entryLabels: ['CALLER'],
    instructions,
    span: {
      file: TEST_FILE,
      start: { line: 1, column: 1 },
      end: { line: instructions.at(-1)?.line ?? 1, column: 1 },
    },
  };
}

function summary(
  name: string,
  options: {
    mayRead?: RegisterContractsUnit[];
    mayWrite?: RegisterContractsUnit[];
    valueRelations?: RoutineSummary['valueRelations'];
    mayOutput?: RegisterContractsUnit[];
  } = {},
): RoutineSummary {
  return {
    name,
    mayRead: options.mayRead ?? [],
    mayWrite: options.mayWrite ?? [],
    preserved: ['A', 'B', 'C', 'H', 'L', 'carry', 'zero', 'sign', 'parity', 'halfCarry'],
    valueRelations: options.valueRelations ?? [],
    stackBalanced: true,
    ...(options.mayOutput !== undefined ? { mayOutput: options.mayOutput } : {}),
  };
}

const callee = summary('HELPER', { mayWrite: ['D', 'E'] });
const clobberDe = summary('CLOBBER_DE', { mayWrite: ['D', 'E'] });
const useDe = summary('USE_DE', { mayRead: ['D', 'E'] });
const makeDe = summary('MAKE_DE', { mayWrite: ['D', 'E'] });

function expectSingleConflict(
  conflicts: RegisterContractsConflict[],
  callTarget: string,
  carriers: RegisterContractsUnit[],
): void {
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0]?.callTarget).toBe(callTarget);
  expect(conflicts[0]?.carriers).toEqual(carriers);
}

describe('register-contracts liveness conflicts', () => {
  it('reports when a call clobbers a later-read pre-call value', () => {
    const conflicts = findRegisterContractsConflicts(
      caller(['ld de,$1000', 'call HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expectSingleConflict(conflicts, 'HELPER', ['D', 'E']);
    expect(conflicts[0]?.kind).toBe('definite_contract_violation');
  });

  it('classifies flag conflicts as flag lifetime risks', () => {
    const conflicts = findRegisterContractsConflicts(
      caller(['or a', 'call HELPER', 'ret z', 'ret']),
      new Map([['HELPER', summary('HELPER', { mayWrite: ['zero'] })]]),
      [],
    );

    expectSingleConflict(conflicts, 'HELPER', ['zero']);
    expect(conflicts[0]?.kind).toBe('flag_lifetime_risk');
  });

  it('classifies mixed register and flag conflicts as contract violations', () => {
    const conflicts = findRegisterContractsConflicts(
      caller(['ld a,1', 'or a', 'call HELPER', 'adc a,1', 'ret']),
      new Map([['HELPER', summary('HELPER', { mayWrite: ['A', 'carry'] })]]),
      [],
    );

    expectSingleConflict(conflicts, 'HELPER', ['A', 'carry']);
    expect(conflicts[0]?.kind).toBe('definite_contract_violation');
  });

  it('propagates known callee inputs as live reads', () => {
    const conflicts = findRegisterContractsConflicts(
      caller(['call CLOBBER_DE', 'call USE_DE', 'ret']),
      new Map([
        ['CLOBBER_DE', clobberDe],
        ['USE_DE', useDe],
      ]),
      [],
    );

    expectSingleConflict(conflicts, 'CLOBBER_DE', ['D', 'E']);
  });

  it('does not treat unconditional JR as a tail-call boundary', () => {
    const conflicts = findRegisterContractsConflicts(
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

    const conflicts = findRegisterContractsConflicts(
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
    const conflicts = findRegisterContractsConflicts(
      caller(['call CLOBBER_HL', 'call MAKE_HL', 'inc hl', 'ret']),
      new Map([
        ['CLOBBER_HL', summary('CLOBBER_HL', { mayWrite: ['H', 'L'] })],
        ['MAKE_HL', summary('MAKE_HL', { valueRelations: [{ out: ['H', 'L'], from: [] }] })],
      ]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not report when the value is overwritten before later use', () => {
    const conflicts = findRegisterContractsConflicts(
      caller(['ld de,$1000', 'call HELPER', 'ld de,$2000', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not report A clobbers before xor-a zeroing', () => {
    const conflicts = findRegisterContractsConflicts(
      caller(['ld a,$7f', 'call CLOBBER_A', 'xor a', 'ld (STATE),a', 'ret']),
      new Map([['CLOBBER_A', summary('CLOBBER_A', { mayWrite: ['A'] })]]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not treat OR A before return as a data use when only carry is consumed', () => {
    const tick = caller(['call LCD_SHOW', 'or a', 'ret']);
    const conflicts = findRegisterContractsConflicts(
      caller(['call TICK', 'ret c', 'ret']),
      new Map([
        [
          'TICK',
          summary('TICK', { mayWrite: ['A'], valueRelations: [{ out: ['carry'], from: [] }] }),
        ],
        ['LCD_SHOW', summary('LCD_SHOW', { mayWrite: ['A'] })],
      ]),
      [],
    );
    const tickConflicts = findRegisterContractsConflicts(
      tick,
      new Map([['LCD_SHOW', summary('LCD_SHOW', { mayWrite: ['A'] })]]),
      [],
    );

    expect(conflicts).toEqual([]);
    expect(tickConflicts).toEqual([]);
  });

  it('does not carry liveness through an unconditional local JP', () => {
    const conflicts = findRegisterContractsConflicts(
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

    const conflicts = findRegisterContractsConflicts(
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

  it('propagates liveness through conditional returns to later uses', () => {
    const conflicts = findRegisterContractsConflicts(
      caller(['ld de,$1000', 'ret z', 'call HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expectSingleConflict(conflicts, 'HELPER', ['D', 'E']);
  });
});
