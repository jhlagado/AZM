import { describe, expect, it } from 'vitest';

import {
  applyExpectOutFixesToSource,
  findExpectOutFixesForCandidates,
} from '../../../src/register-contracts/fix.js';
import type {
  RegisterContractsInstruction,
  RegisterContractsOutputCandidate,
  RegisterContractsRoutine,
  RegisterContractsUnit,
} from '../../../src/register-contracts/types.js';
import { parseZ80Instruction } from '../../../src/z80/parse-instruction.js';

const TEST_FILE = '/tmp/fix.z80';

function instruction(text: string, line: number): RegisterContractsInstruction {
  const parsed = parseZ80Instruction(text);
  if (!parsed?.instruction) {
    throw new Error(
      `parse failed: ${text}: ${parsed?.error ?? JSON.stringify(parsed?.diagnostics ?? [])}`,
    );
  }
  return {
    instruction: parsed.instruction,
    file: TEST_FILE,
    line,
    column: 5,
    labels: [],
  };
}

function routine(lines: string[]): RegisterContractsRoutine {
  const instructions = lines.map((line, index) => instruction(line, index + 1));
  return {
    name: 'START',
    labels: ['START'],
    entryLabels: ['START'],
    instructions,
    span: {
      file: TEST_FILE,
      start: { line: 1, column: 1 },
      end: { line: instructions.at(-1)?.line ?? 1, column: 1 },
    },
  };
}

function candidate(carriers: RegisterContractsUnit[]): RegisterContractsOutputCandidate {
  return {
    file: TEST_FILE,
    line: 1,
    column: 5,
    routine: 'MASK',
    carriers,
    message: 'MASK may produce output',
  };
}

describe('register-contracts expect-out fixes', () => {
  it('confirms pair-register continuation reads for candidates', () => {
    const fixes = findExpectOutFixesForCandidates(
      [routine(['call MASK', 'push af', 'ret'])],
      [candidate(['A', 'carry'])],
    );

    expect(fixes).toEqual([
      expect.objectContaining({
        line: 1,
        routine: 'MASK',
        carriers: ['A'],
      }),
    ]);
  });

  it('does not fix candidates overwritten before any continuation read', () => {
    const fixes = findExpectOutFixesForCandidates(
      [routine(['call MASK', 'ld a,0', 'ld d,a', 'ret'])],
      [candidate(['A'])],
    );

    expect(fixes).toEqual([]);
  });

  it('applies hints at the matching call line while preserving line endings', () => {
    const source = ['START:', '    call MASK', '    ld d,a', ''].join('\r\n');
    const rewritten = applyExpectOutFixesToSource(source, [
      {
        file: TEST_FILE,
        line: 2,
        column: 5,
        routine: 'MASK',
        carriers: ['A'],
      },
    ]);

    expect(rewritten).toBe(
      ['START:', '    ; expects out A', '    call MASK', '    ld d,a', ''].join('\r\n'),
    );
  });
});
