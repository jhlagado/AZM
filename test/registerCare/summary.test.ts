import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseAsmInstruction } from '../../src/frontend/parseAsmInstruction.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import type { RegisterCareInstruction, RegisterCareRoutine } from '../../src/registerCare/types.js';
import { inferRoutineSummary } from '../../src/registerCare/summary.js';

function instruction(text: string, line: number): RegisterCareInstruction {
  const diagnostics: Diagnostic[] = [];
  const sf = makeSourceFile('/tmp/summary.z80', text);
  const parsed = parseAsmInstruction('/tmp/summary.z80', text, span(sf, 0, text.length), diagnostics);
  if (!parsed) throw new Error(`parse failed: ${text}: ${JSON.stringify(diagnostics)}`);
  parsed.span.start.line = line;
  return { instruction: parsed, head: parsed.head.toLowerCase(), file: parsed.span.file, line, column: 1 };
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

describe('routine summary inference', () => {
  it('reports simple writes without treating ret as explicit stack imbalance', () => {
    const summary = inferRoutineSummary(routine(['ld a,1', 'ret']));

    expect(summary.mayWrite).toContain('A');
    expect(summary.stackBalanced).toBe(true);
    expect(summary.hasUnknownStackEffect).toBe(true);
  });

  it('reports register inputs as mayRead', () => {
    const summary = inferRoutineSummary(routine(['ld a,(de)', 'ret']));

    expect(summary.mayRead).toEqual(expect.arrayContaining(['D', 'E']));
  });

  it('preserves the full initially tracked register set for no-op routines', () => {
    const summary = inferRoutineSummary(routine(['ret']));

    expect(summary.preserved).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D', 'E', 'H', 'L', 'F']));
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
  });

  it('tracks B/C renaming from A/F through push/pop', () => {
    const summary = inferRoutineSummary(routine(['push af', 'pop bc', 'ret']));

    expect(summary.valueRelations).toContainEqual({ out: ['B', 'C'], from: ['A', 'F'] });
  });

  it('marks unbalanced explicit stack operations', () => {
    const summary = inferRoutineSummary(routine(['push hl', 'ret']));

    expect(summary.stackBalanced).toBe(false);
    expect(summary.hasUnknownStackEffect).toBe(true);
  });

  it('records unknown stack effects without marking explicit stack imbalance', () => {
    const summary = inferRoutineSummary(routine(['call HELPER', 'ret']));

    expect(summary.stackBalanced).toBe(true);
    expect(summary.hasUnknownStackEffect).toBe(true);
  });
});
