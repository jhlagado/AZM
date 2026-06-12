import { describe, expect, it } from 'vitest';

import { parseInterfaceContracts } from '../../../src/register-contracts/interfaceContracts.js';
import {
  parseSmartCommentLine,
  parseSmartCommentLines,
} from '../../../src/register-contracts/smartComments.js';
import type { RegisterContractsUnit } from '../../../src/register-contracts/types.js';

const FLAG_UNITS: RegisterContractsUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

describe('register-contracts smart comment parsing', () => {
  it('parses canonical compact source contract lines', () => {
    expect(parseSmartCommentLine(';!      in        IX,DE,HL,B')).toEqual({
      kind: 'in',
      carriers: ['IXH', 'IXL', 'D', 'E', 'H', 'L', 'B'],
    });
    expect(parseSmartCommentLine(';!      out       B')).toEqual({
      kind: 'out',
      carriers: ['B'],
    });
    expect(parseSmartCommentLine(';!      clobbers  A,C,DE')).toEqual({
      kind: 'clobbers',
      carriers: ['A', 'C', 'D', 'E'],
    });
  });

  it('parses semicolon-separated source contract clauses on one line', () => {
    expect(parseSmartCommentLines(';! in A; out A; clobbers F')).toEqual([
      { kind: 'in', carriers: ['A'] },
      { kind: 'out', carriers: ['A'] },
      { kind: 'clobbers', carriers: FLAG_UNITS },
    ]);
  });

  it('keeps old single-clause parsing compatibility', () => {
    expect(parseSmartCommentLine(';! in A')).toEqual({ kind: 'in', carriers: ['A'] });
  });

  it('parses compatibility F spelling in compact source carriers', () => {
    expect(parseSmartCommentLine(';!      clobbers  A,F,carry')).toEqual({
      kind: 'clobbers',
      carriers: ['A', ...FLAG_UNITS],
    });
  });

  it('parses caller expect-out hints', () => {
    expect(parseSmartCommentLine('; expects out A')).toEqual({
      kind: 'expectOut',
      carriers: ['A'],
    });
  });

  it('parses named compact source contracts', () => {
    expect(parseSmartCommentLine(';! out {A,carry} scanKeys')).toEqual({
      kind: 'out',
      carriers: ['A', 'carry'],
      name: 'scanKeys',
    });
  });

  it('ignores ordinary comments', () => {
    expect(parseSmartCommentLine('; clobbers A')).toBeUndefined();
  });

  it('rejects malformed carrier payloads', () => {
    expect(parseSmartCommentLine(';!      in')).toBeUndefined();
    expect(parseSmartCommentLine(';!      in        BAD')).toBeUndefined();
  });

  it('rejects malformed interface lines and comments in contract files', () => {
    expect(() =>
      parseInterfaceContracts(['extern MON', 'clobbers Q', 'end'].join('\n'), 'mon3.asmi'),
    ).toThrow('mon3.asmi:2: invalid register contracts interface line "clobbers Q"');
    expect(() =>
      parseInterfaceContracts(['; no comments', 'extern MON', 'end'].join('\n'), 'mon3.asmi'),
    ).toThrow('mon3.asmi:1: .asmi files do not permit comments');
  });

  it('parses register-contracts interface contracts', () => {
    const contracts = parseInterfaceContracts(
      [
        'extern MON3_API_16_SCAN_KEYS',
        'in C',
        'out A,carry,zero',
        'clobbers DE',
        'preserves IX,IY',
        'end',
        '',
      ].join('\n'),
    );

    expect(contracts.get('MON3_API_16_SCAN_KEYS')).toEqual({
      name: 'MON3_API_16_SCAN_KEYS',
      in: ['C'],
      out: ['A', 'carry', 'zero'],
      clobbers: ['D', 'E'],
      preserves: ['IXH', 'IXL', 'IYH', 'IYL'],
    });
  });
});
