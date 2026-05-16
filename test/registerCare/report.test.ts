import { describe, expect, it } from 'vitest';

import {
  renderRegisterCareInterface,
  renderRegisterCareReport,
} from '../../src/registerCare/report.js';
import type { RoutineSummary } from '../../src/registerCare/types.js';

const helperSummary: RoutineSummary = {
  name: 'HELPER',
  mayRead: ['D', 'E'],
  mayWrite: ['A', 'F'],
  preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
  valueRelations: [],
  stackBalanced: true,
  hasUnknownStackEffect: false,
};

describe('register-care reports', () => {
  it('renders routine summaries deterministically', () => {
    const text = renderRegisterCareReport({
      entryFile: '/tmp/main.z80',
      mode: 'audit',
      summaries: [helperSummary],
      conflicts: [],
      unknownCalls: [],
    });

    expect(text).toContain('AZM Register-Care Report');
    expect(text).toContain('Entry: /tmp/main.z80');
    expect(text).toContain('Mode: audit');
    expect(text).toContain('Routine: HELPER');
    expect(text).toContain('reads: D,E');
    expect(text).toContain('writes: A,F');
    expect(text).toContain('preserves: B,C,D,E,H,L');
    expect(text).toContain('stack: balanced');
  });

  it('renders unknown stack effects and value relations when present', () => {
    const text = renderRegisterCareReport({
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
    const text = renderRegisterCareReport({
      entryFile: '/tmp/main.z80',
      mode: 'strict',
      summaries: [],
      conflicts: [
        {
          file: '/tmp/main.z80',
          line: 12,
          column: 5,
          callTarget: 'HELPER',
          carriers: ['A', 'F'],
          message: 'HELPER may clobber live A,F',
        },
      ],
      unknownCalls: ['TABLE_DISPATCH'],
    });

    expect(text).toContain('Conflicts:');
    expect(text).toContain('/tmp/main.z80:12:5: HELPER: A,F: HELPER may clobber live A,F');
    expect(text).toContain('Unknown calls:');
    expect(text).toContain('TABLE_DISPATCH');
  });

  it('renders generated smart-comment contracts', () => {
    const text = renderRegisterCareInterface([helperSummary]);

    expect(text).toContain('; AZM register-care interface');
    expect(text).toContain(';! @proc       HELPER');
    expect(text).toContain(';! @in         {D,E}');
    expect(text).toContain(';! @clobbers   {A,F}');
    expect(text).toContain(';! @preserves  {B,C,D,E,H,L}');
    expect(text).toContain(';! @end');
  });
});
