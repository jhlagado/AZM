import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import type {
  RegisterCareInstruction,
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
} from '../../src/registerCare/types.js';
import { applyRoutineContract, inferRoutineSummary } from '../../src/registerCare/summary.js';

const FLAG_UNITS: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];
const TRACKED_UNITS: RegisterCareUnit[] = ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNITS];

function instruction(text: string, line: number): RegisterCareInstruction {
  const diagnostics: Diagnostic[] = [];
  const sf = makeSourceFile('/tmp/summary.z80', text);
  const parsed = parseAsmInstruction(
    '/tmp/summary.z80',
    text,
    span(sf, 0, text.length),
    diagnostics,
  );
  if (!parsed) throw new Error(`parse failed: ${text}: ${JSON.stringify(diagnostics)}`);
  parsed.span.start.line = line;
  return {
    instruction: parsed,
    head: parsed.head.toLowerCase(),
    file: parsed.span.file,
    line,
    column: 1,
  };
}

function routine(lines: string[]): RegisterCareRoutine {
  const instructions = lines.map((line, idx) => instruction(line, idx + 1));
  return {
    name: 'ROUTINE',
    span: instructions[0]!.instruction.span,
    labels: ['ROUTINE'],
    instructions,
  };
}

function routineSummary(overrides: Partial<RoutineSummary>): RoutineSummary {
  return {
    name: 'ROUTINE',
    mayRead: [],
    mayWrite: [],
    preserved: [],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
    ...overrides,
  };
}

describe('routine summary inference', () => {
  it('reports simple writes without treating ret as explicit stack imbalance', () => {
    const summary = inferRoutineSummary(routine(['ld a,1', 'ret']));

    expect(summary.mayWrite).toContain('A');
    expect(summary.stackBalanced).toBe(true);
    expect(summary.hasUnknownStackEffect).toBe(false);
  });

  it('reports register inputs as mayRead', () => {
    const summary = inferRoutineSummary(routine(['ld a,(de)', 'ret']));

    expect(summary.mayRead).toEqual(expect.arrayContaining(['D', 'E']));
  });

  it('preserves the full initially tracked register set for no-op routines', () => {
    const summary = inferRoutineSummary(routine(['ret']));

    expect(summary.preserved).toEqual(expect.arrayContaining(TRACKED_UNITS));
  });

  it('recognizes push/pop preservation through the stack', () => {
    const summary = inferRoutineSummary(routine(['push de', 'ld de,$1234', 'pop de', 'ret']));

    expect(summary.mayWrite).not.toContain('D');
    expect(summary.mayWrite).not.toContain('E');
    expect(summary.preserved).toEqual(expect.arrayContaining(['D', 'E']));
    expect(summary.stackBalanced).toBe(true);
  });

  it('tracks register renaming through push/pop', () => {
    const summary = inferRoutineSummary(routine(['push de', 'pop hl', 'ret']));

    expect(summary.valueRelations).toContainEqual({ out: ['H', 'L'], from: ['D', 'E'] });
    expect(summary.mayRead).toEqual(expect.arrayContaining(['D', 'E']));
  });

  it('does not treat internally produced values as caller inputs', () => {
    const summary = inferRoutineSummary(
      routine(['ld hl,(GAME_OVER_KEY_GATE_LO)', 'ld a,h', 'or l', 'ret']),
    );

    expect(summary.mayRead).not.toContain('H');
    expect(summary.mayRead).not.toContain('L');
    expect(summary.mayRead).not.toContain('A');
  });

  it('does not treat push/pop preservation as a semantic input', () => {
    const summary = inferRoutineSummary(routine(['push af', 'xor a', 'pop af', 'ret']));

    expect(summary.preserved).toEqual(
      expect.arrayContaining(['A', 'carry', 'zero', 'sign', 'parity', 'halfCarry']),
    );
    expect(summary.mayRead).not.toContain('A');
    expect(summary.mayRead).not.toContain('carry');
    expect(summary.mayRead).not.toContain('zero');
  });

  it('does not treat the AF flags byte as a precise C register value', () => {
    const summary = inferRoutineSummary(routine(['push af', 'pop bc', 'ret']));

    expect(summary.valueRelations).not.toContainEqual({ out: ['B', 'C'], from: ['A', 'carry'] });
  });

  it('marks unbalanced explicit stack operations', () => {
    const summary = inferRoutineSummary(routine(['push hl', 'ret']));

    expect(summary.stackBalanced).toBe(false);
    expect(summary.hasUnknownStackEffect).toBe(false);
  });

  it('records unknown stack effects without marking explicit stack imbalance', () => {
    const summary = inferRoutineSummary(routine(['call HELPER', 'ret']));

    expect(summary.stackBalanced).toBe(true);
    expect(summary.hasUnknownStackEffect).toBe(true);
  });

  it('treats opaque call boundaries as clobbering tracked registers', () => {
    const summary = inferRoutineSummary(routine(['call HELPER', 'ret']));

    expect(summary.preserved).not.toEqual(expect.arrayContaining(TRACKED_UNITS));
    expect(summary.preserved).not.toContain('A');
    expect(summary.preserved).not.toContain('carry');
    expect(summary.mayWrite).toEqual(expect.arrayContaining(['A', 'D', 'carry', 'zero']));
    expect(summary.stackBalanced).toBe(true);
    expect(summary.hasUnknownStackEffect).toBe(true);
  });

  it('treats rst boundaries as opaque tracked-register clobbers', () => {
    const summary = inferRoutineSummary(routine(['rst $10', 'ret']));

    expect(summary.mayWrite).toEqual(expect.arrayContaining(['B', 'carry', 'zero']));
    expect(summary.preserved).not.toContain('B');
    expect(summary.preserved).not.toContain('carry');
  });

  it('reports untracked pop destinations as register writes', () => {
    const summary = inferRoutineSummary(routine(['push hl', 'pop ix', 'ret']));

    expect(summary.mayWrite).toEqual(expect.arrayContaining(['IXH', 'IXL']));
    expect(summary.stackBalanced).toBe(true);
  });

  it('tracks pop af as A plus individual flag writes', () => {
    const summary = inferRoutineSummary(routine(['pop af', 'ret']));

    expect(summary.mayWrite).toEqual(expect.arrayContaining(['A', ...FLAG_UNITS]));
    expect(summary.mayWrite).not.toContain('F');
  });

  it('treats contract outputs as intentional outputs instead of clobbers', () => {
    const summary = applyRoutineContract(
      routineSummary({ name: 'MAKE_PTR', mayWrite: ['H', 'L'] }),
      {
        name: 'MAKE_PTR',
        in: [],
        out: ['H', 'L'],
        clobbers: ['H', 'L', 'A'],
        preserves: [],
      },
    );

    expect(summary.mayWrite).toEqual(['A']);
    expect(summary.valueRelations).toContainEqual({ out: ['H', 'L'], from: [] });
  });

  it('records different-register contract transforms as outputs from inputs', () => {
    const summary = applyRoutineContract(routineSummary({ name: 'MAKE_PTR' }), {
      name: 'MAKE_PTR',
      in: ['D', 'E'],
      out: ['H', 'L'],
      clobbers: [],
      preserves: [],
    });

    expect(summary.mayRead).toEqual(['D', 'E']);
    expect(summary.mayWrite).toEqual([]);
    expect(summary.valueRelations).toContainEqual({ out: ['H', 'L'], from: ['D', 'E'] });
  });

  it('treats declared contract inputs as the semantic register input surface', () => {
    const summary = applyRoutineContract(
      routineSummary({ name: 'LOAD_PENDING', mayRead: ['A', 'carry'], mayWrite: ['A', 'D', 'E'] }),
      {
        name: 'LOAD_PENDING',
        in: [],
        out: ['D', 'E'],
        clobbers: ['A'],
        preserves: [],
      },
    );

    expect(summary.mayRead).toEqual([]);
    expect(summary.mayWrite).toEqual(['A']);
    expect(summary.valueRelations).toContainEqual({ out: ['D', 'E'], from: [] });
  });

  it('does not report declared clobbers as preserved', () => {
    const summary = applyRoutineContract(
      routineSummary({ name: 'SHIFT_WINDOW', mayWrite: [], preserved: ['B', 'C', 'D'] }),
      {
        name: 'SHIFT_WINDOW',
        in: ['B', 'C'],
        out: ['A'],
        clobbers: ['B', 'C', ...FLAG_UNITS],
        preserves: ['D'],
      },
    );

    expect(summary.mayWrite).toEqual(expect.arrayContaining(['B', 'C', 'carry', 'zero']));
    expect(summary.mayWrite).not.toContain('F');
    expect(summary.preserved).toEqual(['D']);
  });
});
