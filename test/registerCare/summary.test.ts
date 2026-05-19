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
const TRACKED_UNITS: RegisterCareUnit[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  ...FLAG_UNITS,
];

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
    labels: [],
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
  it('infers simple immediate writes as outputs at return', () => {
    const summary = inferRoutineSummary(routine(['ld a,1', 'ret']));

    expect(summary.valueRelations).toContainEqual({ out: ['A'], from: [] });
    expect(summary.mayWrite).not.toContain('A');
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

  it('infers final internally produced register pairs as outputs', () => {
    const summary = inferRoutineSummary(
      routine(['ld a,(PendingX)', 'ld d,a', 'ld a,(PendingY)', 'ld e,a', 'ret']),
    );

    expect(summary.valueRelations).toContainEqual({ out: ['D', 'E'], from: [] });
    expect(summary.mayWrite).toContain('A');
    expect(summary.mayWrite).not.toContain('D');
    expect(summary.mayWrite).not.toContain('E');
    expect(summary.mayRead).not.toContain('A');
  });

  it('infers transformed internal values as outputs when they reach return', () => {
    const summary = inferRoutineSummary(routine(['ld a,(Value)', 'inc a', 'and 7', 'ret']));

    expect(summary.valueRelations).toContainEqual({ out: ['A'], from: [] });
    expect(summary.mayWrite).not.toContain('A');
  });

  it('does not infer side-effect-only values as outputs', () => {
    const summary = inferRoutineSummary(routine(['ld a,(Value)', 'ld (Somewhere),a', 'ret']));

    expect(summary.valueRelations).not.toContainEqual({ out: ['A'], from: [] });
    expect(summary.mayWrite).toContain('A');
  });

  it('infers accumulator self-tests as A plus useful flag outputs', () => {
    const summary = inferRoutineSummary(routine(['or a', 'ret']));

    expect(summary.valueRelations).toEqual(
      expect.arrayContaining([
        { out: ['A'], from: ['A'] },
        { out: ['carry'], from: [] },
        { out: ['zero'], from: [] },
      ]),
    );
    expect(summary.mayWrite).not.toContain('A');
    expect(summary.mayWrite).not.toContain('carry');
    expect(summary.mayWrite).not.toContain('zero');
    expect(summary.mayWrite).toEqual(expect.arrayContaining(['sign', 'parity', 'halfCarry']));
  });

  it('infers explicit carry setting as a carry output', () => {
    const summary = inferRoutineSummary(routine(['scf', 'ret']));

    expect(summary.valueRelations).toContainEqual({ out: ['carry'], from: [] });
    expect(summary.mayWrite).not.toContain('carry');
  });

  it('propagates flag outputs through known boundary wrappers', () => {
    const callee = routineSummary({
      name: 'MAKE_CARRY',
      valueRelations: [{ out: ['carry'], from: [] }],
    });
    const summary = inferRoutineSummary(
      routine(['call MAKE_CARRY', 'ret']),
      new Map([['MAKE_CARRY', callee]]),
    );

    expect(summary.valueRelations).toContainEqual({ out: ['carry'], from: [] });
    expect(summary.mayWrite).not.toContain('carry');
  });

  it('infers compare-zero as A plus useful flag outputs', () => {
    const summary = inferRoutineSummary(routine(['cp 0', 'ret']));

    expect(summary.valueRelations).toEqual(
      expect.arrayContaining([
        { out: ['A'], from: ['A'] },
        { out: ['carry'], from: [] },
        { out: ['zero'], from: [] },
      ]),
    );
    expect(summary.mayWrite).not.toContain('A');
  });

  it('keeps a produced A value eligible when CP tests it before return', () => {
    const summary = inferRoutineSummary(routine(['ld a,(Candidate)', 'cp 7', 'ret']));

    expect(summary.valueRelations).toContainEqual({ out: ['A'], from: [] });
    expect(summary.valueRelations).toContainEqual({ out: ['carry'], from: [] });
    expect(summary.valueRelations).toContainEqual({ out: ['zero'], from: [] });
    expect(summary.mayWrite).not.toContain('A');
  });

  it('treats block-transfer terminal registers as mechanical residue', () => {
    const summary = inferRoutineSummary(
      routine(['ld hl,Source', 'ld de,Dest', 'ld bc,32', 'ldir', 'ret']),
    );

    expect(summary.valueRelations).not.toContainEqual({ out: ['B', 'C'], from: [] });
    expect(summary.valueRelations).not.toContainEqual({ out: ['D', 'E'], from: [] });
    expect(summary.valueRelations).not.toContainEqual({ out: ['H', 'L'], from: [] });
    expect(summary.mayWrite).toEqual(expect.arrayContaining(['B', 'C', 'D', 'E', 'H', 'L']));
  });

  it('treats DJNZ B as loop residue rather than an output', () => {
    const summary = inferRoutineSummary(routine(['ld b,8', 'djnz Loop', 'ret']));

    expect(summary.valueRelations).not.toContainEqual({ out: ['B'], from: [] });
    expect(summary.mayWrite).toContain('B');
  });

  it('does not treat pure register transfers as semantic inputs until consumed', () => {
    const summary = inferRoutineSummary(routine(['ld h,d', 'ld l,e', 'ret']));

    expect(summary.valueRelations).toContainEqual({ out: ['H', 'L'], from: ['D', 'E'] });
    expect(summary.mayRead).toEqual(expect.arrayContaining(['D', 'E']));
  });

  it('does not treat locally loaded IX as a caller input for known callees', () => {
    const callee = routineSummary({
      name: 'USE_IX',
      mayRead: ['IXH', 'IXL'],
    });
    const summary = inferRoutineSummary(
      routine(['ld ix,Monster0', 'call USE_IX', 'ret']),
      new Map([['USE_IX', callee]]),
    );

    expect(summary.mayRead).not.toContain('IXH');
    expect(summary.mayRead).not.toContain('IXL');
    expect(summary.mayWrite).toEqual(expect.arrayContaining(['IXH', 'IXL']));
  });

  it('does not treat OR A before SBC HL as an A input', () => {
    const summary = inferRoutineSummary(routine(['or a', 'sbc hl,de', 'ret']));

    expect(summary.mayRead).toEqual(expect.arrayContaining(['D', 'E', 'H', 'L']));
    expect(summary.mayRead).not.toContain('A');
  });

  it('does not treat values restored after EX DE,HL as semantic inputs', () => {
    const summary = inferRoutineSummary(
      routine([
        'push bc',
        'push de',
        'push hl',
        'ex de,hl',
        'ld a,(de)',
        'pop hl',
        'pop de',
        'pop bc',
        'ret',
      ]),
    );

    expect(summary.mayRead).toEqual(expect.arrayContaining(['H', 'L']));
    expect(summary.mayRead).not.toContain('D');
    expect(summary.mayRead).not.toContain('E');
    expect(summary.preserved).toEqual(expect.arrayContaining(['B', 'C', 'D', 'E', 'H', 'L']));
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

  it('lets complete generated contracts define the external clobber surface', () => {
    const summary = applyRoutineContract(
      routineSummary({
        name: 'DRAW',
        mayRead: ['A', 'carry'],
        mayWrite: ['A', 'carry', 'zero', 'sign', 'parity', 'halfCarry'],
      }),
      {
        name: 'DRAW',
        in: [],
        out: [],
        clobbers: ['A'],
        preserves: [],
        complete: true,
      },
    );

    expect(summary.mayRead).toEqual([]);
    expect(summary.mayWrite).toEqual(['A']);
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
