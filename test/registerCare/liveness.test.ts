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
  LocatedSmartComment,
  RegisterCareInstruction,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
} from '../../src/registerCare/types.js';

const TEST_FILE = '/tmp/liveness.z80';

function instruction(text: string, line: number): RegisterCareInstruction {
  const diagnostics: Diagnostic[] = [];
  const sf = makeSourceFile(TEST_FILE, text);
  const parsed = parseAsmInstruction(TEST_FILE, text, span(sf, 0, text.length), diagnostics);
  if (!parsed) throw new Error(`parse failed: ${text}`);
  parsed.span.start.line = line;
  parsed.span.end.line = line;
  return { instruction: parsed, head: parsed.head, file: parsed.span.file, line, column: 1 };
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

function summary(
  name: string,
  options: { mayRead?: RegisterCareUnit[]; mayWrite?: RegisterCareUnit[] } = {},
): RoutineSummary {
  return {
    name,
    mayRead: options.mayRead ?? [],
    mayWrite: options.mayWrite ?? [],
    preserved: ['A', 'B', 'C', 'H', 'L', 'F'],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
}

const callee = summary('HELPER', { mayWrite: ['D', 'E'] });
const clobberDe = summary('CLOBBER_DE', { mayWrite: ['D', 'E'] });
const useDe = summary('USE_DE', { mayRead: ['D', 'E'] });
const makeDe = summary('MAKE_DE', { mayWrite: ['D', 'E'] });

describe('register-care liveness conflicts', () => {
  it('reports when a call clobbers a later-read pre-call value', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'call HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.callTarget).toBe('HELPER');
    expect(conflicts[0]?.carriers).toEqual(['D', 'E']);
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

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.callTarget).toBe('CLOBBER_DE');
    expect(conflicts[0]?.carriers).toEqual(['D', 'E']);
  });

  it('checks conditional direct calls', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'call nz,HELPER', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.callTarget).toBe('HELPER');
    expect(conflicts[0]?.carriers).toEqual(['D', 'E']);
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

  it('does not report when the value is overwritten before later use', () => {
    const conflicts = findRegisterCareConflicts(
      caller(['ld de,$1000', 'call HELPER', 'ld de,$2000', 'inc de', 'ret']),
      new Map([['HELPER', callee]]),
      [],
    );

    expect(conflicts).toEqual([]);
  });

  it('does not report carriers accepted by an immediate @expect-out hint', () => {
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
