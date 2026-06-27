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
      findings: [
        {
          kind: 'definite_contract_violation',
          file: '/tmp/main.z80',
          line: 12,
          column: 5,
          callTarget: 'HELPER',
          carriers: ['A', ...FLAG_UNITS],
          message: 'HELPER may clobber live A,carry,zero,sign,parity,halfCarry',
        },
        {
          kind: 'missing_callee_contract',
          file: '/tmp/main.z80',
          line: 18,
          column: 5,
          callTarget: 'TABLE_DISPATCH',
          subject: 'CALL TABLE_DISPATCH',
          message: 'Register contracts cannot prove CALL TABLE_DISPATCH',
        },
      ],
      conflicts: [
        {
          kind: 'definite_contract_violation',
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
    expect(text).toContain('Findings:');
    expect(text).toContain(
      '/tmp/main.z80:12:5: definite_contract_violation: HELPER: A,carry,zero,sign,parity,halfCarry: HELPER may clobber live A,carry,zero,sign,parity,halfCarry',
    );
    expect(text).toContain(
      '/tmp/main.z80:18:5: missing_callee_contract: TABLE_DISPATCH: Register contracts cannot prove CALL TABLE_DISPATCH',
    );
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
      findings: [
        {
          kind: 'output_candidate',
          file: '/tmp/main.z80',
          line: 12,
          column: 5,
          routine: 'MASK',
          carriers: ['A'],
          message:
            'CALL MASK writes A and caller reads it later; manual review required before adding `; expects out A` because the later read is not a simple direct continuation.',
        },
      ],
      outputCandidates: [
        {
          kind: 'output_candidate',
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
    expect(text).toContain('/tmp/main.z80:12:5: output_candidate: A: CALL MASK writes A');
    expect(text).toContain(
      '/tmp/main.z80:12:5: MASK: A: CALL MASK writes A and caller reads it later; manual review required before adding `; expects out A` because the later read is not a simple direct continuation.',
    );
  });

  it('renders no findings in off mode when no findings are provided', () => {
    const text = renderRegisterContractsReport({
      entryFile: '/tmp/main.z80',
      mode: 'off',
      summaries: [],
      findings: [],
      conflicts: [],
      unknownCalls: [],
    });

    expect(text).toContain('Findings:');
    expect(text).toContain('Findings:\n  none');
    expect(text).toContain('Unknown calls:\n  none');
  });

  it('accepts structured stack finding fields for machine-readable reports', () => {
    const text = renderRegisterContractsReport({
      entryFile: '/tmp/main.z80',
      mode: 'strict',
      summaries: [],
      findings: [
        {
          kind: 'unknown_control_flow',
          routine: 'BROKEN',
          stackBalanced: false,
          hasUnknownStackEffect: true,
          file: '/tmp/main.z80',
          line: 3,
          column: 1,
          message: 'Register contracts cannot prove stack discipline for BROKEN',
        },
      ],
      conflicts: [],
      unknownCalls: [],
    });

    expect(text).toContain(
      '/tmp/main.z80:3:1: unknown_control_flow: Register contracts cannot prove stack discipline for BROKEN',
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
