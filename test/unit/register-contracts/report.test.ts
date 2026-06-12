import { describe, expect, it } from 'vitest';

import {
  renderRegisterContractsInterface,
  renderRegisterContractsReport,
  renderRegisterContractsSourceBlock,
} from '../../../src/register-contracts/report.js';
import type {
  RegisterContractsUnit,
  RoutineSummary,
} from '../../../src/register-contracts/types.js';

const FLAG_UNITS: RegisterContractsUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

const helperSummary: RoutineSummary = {
  name: 'HELPER',
  mayRead: ['D', 'E'],
  mayWrite: ['A', ...FLAG_UNITS],
  preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
  valueRelations: [],
  stackBalanced: true,
  hasUnknownStackEffect: false,
};

describe('register-contracts reports', () => {
  it('renders routine summaries deterministically', () => {
    const text = renderRegisterContractsReport({
      entryFile: '/tmp/main.z80',
      mode: 'audit',
      summaries: [helperSummary],
      conflicts: [],
      unknownCalls: [],
    });

    expect(text).toContain('AZM Register Contracts Report');
    expect(text).toContain('Entry: /tmp/main.z80');
    expect(text).toContain('Mode: audit');
    expect(text).toContain('Routine: HELPER');
    expect(text).toContain('reads: D,E');
    expect(text).toContain('writes: A,carry,zero,sign,parity,halfCarry');
    expect(text).toContain('preserves: B,C,D,E,H,L');
    expect(text).toContain('stack: balanced');
  });

  it('renders unknown stack effects and value relations when present', () => {
    const text = renderRegisterContractsReport({
      entryFile: '/tmp/main.z80',
      mode: 'warn',
      summaries: [
        {
          ...helperSummary,
          valueRelations: [{ out: ['H', 'L'], from: ['D', 'E'] }],
          stackBalanced: false,
          hasUnknownStackEffect: true,
        },
      ],
      conflicts: [],
      unknownCalls: [],
    });

    expect(text).toContain('stack: unbalanced, unknown effect');
    expect(text).toContain('relation: H,L <= D,E');
  });

  it('renders conflicts and unknown calls', () => {
    const text = renderRegisterContractsReport({
      entryFile: '/tmp/main.z80',
      mode: 'strict',
      summaries: [],
      conflicts: [
        {
          file: '/tmp/main.z80',
          line: 12,
          column: 5,
          callTarget: 'HELPER',
          carriers: ['A', ...FLAG_UNITS],
          message: 'HELPER may clobber live A,carry,zero,sign,parity,halfCarry',
        },
      ],
      unknownCalls: ['TABLE_DISPATCH'],
    });

    expect(text).toContain('Conflicts:');
    expect(text).toContain(
      '/tmp/main.z80:12:5: HELPER: A,carry,zero,sign,parity,halfCarry: HELPER may clobber live A,carry,zero,sign,parity,halfCarry',
    );
    expect(text).toContain('Unknown calls:');
    expect(text).toContain('TABLE_DISPATCH');
  });

  it('renders output candidates with call-site remedies', () => {
    const text = renderRegisterContractsReport({
      entryFile: '/tmp/main.z80',
      mode: 'audit',
      summaries: [],
      conflicts: [],
      outputCandidates: [
        {
          file: '/tmp/main.z80',
          line: 12,
          column: 5,
          routine: 'MASK',
          carriers: ['A'],
          message:
            'CALL MASK writes A and caller reads it later; manual review required before adding `; expects out A` because the later read is not a simple direct continuation.',
        },
      ],
      unknownCalls: [],
    });

    expect(text).toContain('Output candidates:');
    expect(text).toContain(
      '/tmp/main.z80:12:5: MASK: A: CALL MASK writes A and caller reads it later; manual review required before adding `; expects out A` because the later read is not a simple direct continuation.',
    );
  });

  it('renders generated smart-comment contracts', () => {
    const text = renderRegisterContractsInterface([helperSummary]);

    expect(text).toContain('extern HELPER');
    expect(text).toContain('in DE');
    expect(text).toContain('clobbers A,carry,zero,sign,parity,halfCarry');
    expect(text).not.toContain('@preserves');
    expect(text).not.toContain(';');
    expect(text).toContain('end');
  });

  it('renders value relation outputs separately from clobbers', () => {
    const text = renderRegisterContractsInterface([
      {
        ...helperSummary,
        mayWrite: ['A', ...FLAG_UNITS, 'H', 'L'],
        valueRelations: [{ out: ['H', 'L'], from: ['D', 'E'] }],
      },
    ]);

    expect(text).toContain('out HL');
    expect(text).toContain('clobbers A,carry,zero,sign,parity,halfCarry');
    expect(text).not.toContain('clobbers A,HL');
  });

  it('renders semantic flag outputs separately from scratch flag clobbers', () => {
    const text = renderRegisterContractsInterface([
      {
        ...helperSummary,
        mayRead: ['A'],
        mayWrite: ['A', ...FLAG_UNITS],
        valueRelations: [{ out: ['carry'], from: ['A'] }],
      },
    ]);

    expect(text).toContain('in A');
    expect(text).toContain('out carry');
    expect(text).toContain('clobbers A,zero,sign,parity,halfCarry');
    expect(text).not.toContain('clobbers A,carry');
  });

  it('renders source contracts as semicolon-separated clauses on one line', () => {
    const lines = renderRegisterContractsSourceBlock({
      ...helperSummary,
      mayRead: ['A'],
      mayWrite: ['A', ...FLAG_UNITS],
      valueRelations: [{ out: ['A'], from: ['A'] }],
    });

    expect(lines).toEqual([';! in A; out A; clobbers F']);
    expect(lines).not.toContain(';!      in        A');
  });

  it('renders source outputs compactly on one line', () => {
    const lines = renderRegisterContractsSourceBlock({
      ...helperSummary,
      valueRelations: [
        { out: ['H', 'L'], from: [] },
        { out: ['A'], from: [] },
        { out: ['B'], from: [] },
        { out: ['carry'], from: [] },
        { out: ['zero'], from: [] },
      ],
    });

    expect(lines[0]).toContain('out HL,A,B,carry,zero');
    expect(lines).not.toContain(';!      out       HL');
    expect(lines).not.toContain(';!      out       A');
    expect(lines).not.toContain('; ========================== AZM');
  });
});
