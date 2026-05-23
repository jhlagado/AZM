import { describe, expect, it } from 'vitest';

import { parseInterfaceContracts, parseSmartCommentLine } from '../../../src/register-care/smartComments.js';
import type { RegisterCareUnit } from '../../../src/register-care/types.js';

const FLAG_UNITS: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

describe('register-care smart comment parsing', () => {
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
    ).toThrow('mon3.asmi:2: invalid register-care interface line "clobbers Q"');
    expect(() =>
      parseInterfaceContracts(
        ['; no comments', 'extern MON', 'end'].join('\n'),
        'mon3.asmi',
      ),
    ).toThrow('mon3.asmi:1: .asmi files do not permit comments');
  });
});
