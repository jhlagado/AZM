import { describe, expect, it } from 'vitest';

import {
  buildRoutineContracts,
  parseInterfaceContracts,
  parseSmartCommentLine,
  parseSmartComments,
} from '../../src/registerCare/smartComments.js';
import type { RegisterCareUnit } from '../../src/registerCare/types.js';

const FLAG_UNITS: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

describe('register-care smart comments', () => {
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

  it('parses compatibility F spelling in compact carrier lists', () => {
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

  it('rejects unknown carriers', () => {
    expect(parseSmartCommentLine(';!      in        BAD')).toBeUndefined();
  });

  it('parses bare C as register C and carry as the carry flag', () => {
    expect(parseSmartCommentLine(';!      in        C')).toEqual({
      kind: 'in',
      carriers: ['C'],
    });
    expect(parseSmartCommentLine(';!      out       carry')).toEqual({
      kind: 'out',
      carriers: ['carry'],
    });
  });

  it('ignores removed smart tag spellings', () => {
    expect(parseSmartCommentLine(';! @unknown {DE}')).toBeUndefined();
    expect(parseSmartCommentLine(';! @in {DE} raw')).toBeUndefined();
    expect(parseSmartCommentLine('; Candidate x is supplied in @in D candidate_x')).toBeUndefined();
  });

  it('ignores malformed carrier payloads', () => {
    expect(parseSmartCommentLine(';!      in')).toBeUndefined();
    expect(parseSmartCommentLine(';!      in        BAD')).toBeUndefined();
  });

  it('builds implicit contracts from compact source blocks', () => {
    const file = 'src/main.asm';
    const source = [
      '; Human prose remains outside the generated block.',
      '; @clobbers DE stale interspersed metadata.',
      ';!      in        HL',
      ';!      out       carry',
      ';!      clobbers  A',
      'HELPER:',
      '    ret',
    ].join('\n');

    const contracts = buildRoutineContracts(
      [],
      [
        {
          name: 'HELPER',
          labels: ['HELPER'],
          instructions: [],
          span: {
            file,
            start: { line: 6, column: 1, offset: 0 },
            end: { line: 7, column: 8, offset: 0 },
          },
        },
      ],
      new Map([[file, source]]),
    );

    expect(contracts.get('HELPER')).toEqual({
      name: 'HELPER',
      in: ['H', 'L'],
      out: ['carry'],
      clobbers: ['A'],
      preserves: [],
      complete: true,
    });
  });

  it('parses located comments from module loader comment maps in deterministic order', () => {
    const sourceLineComments = new Map<string, Map<number, string>>([
      [
        'src/zeta.asm',
        new Map([
          [20, '!      in        DE'],
          [1, 'ordinary comment'],
        ]),
      ],
      [
        'src/alpha.asm',
        new Map([
          [30, '!      in        HL'],
          [20, 'ordinary comment'],
        ]),
      ],
    ]);

    expect(parseSmartComments(sourceLineComments)).toEqual([
      {
        file: 'src/alpha.asm',
        line: 30,
        comment: { kind: 'in', carriers: ['H', 'L'] },
      },
      {
        file: 'src/zeta.asm',
        line: 20,
        comment: { kind: 'in', carriers: ['D', 'E'] },
      },
    ]);
  });

  it('builds extern contracts from block comments and deduplicates carriers', () => {
    const contracts = buildRoutineContracts([
      { file: 'src/main.asm', line: 20, comment: { kind: 'extern', name: 'MON_PRINT' } },
      { file: 'src/main.asm', line: 21, comment: { kind: 'in', carriers: ['D', 'E'] } },
      { file: 'src/main.asm', line: 22, comment: { kind: 'in', carriers: ['D', 'E'] } },
      { file: 'src/main.asm', line: 23, comment: { kind: 'out', carriers: ['D', 'E'] } },
      {
        file: 'src/main.asm',
        line: 24,
        comment: { kind: 'clobbers', carriers: ['A', ...FLAG_UNITS, 'A'] },
      },
      { file: 'src/main.asm', line: 25, comment: { kind: 'end' } },
    ]);

    expect(contracts.get('MON_PRINT')).toEqual({
      name: 'MON_PRINT',
      in: ['D', 'E'],
      out: ['D', 'E'],
      clobbers: ['A', ...FLAG_UNITS],
      preserves: [],
      complete: true,
    });
  });

  it('parses bare register-care interface contracts', () => {
    const contracts = parseInterfaceContracts(
      [
        'extern MON_PRINT_CHAR',
        'in A',
        'clobbers A',
        'end',
        '',
        'extern MON_GET_KEY',
        'out A,zero',
        'clobbers carry',
        'end',
      ].join('\n'),
      'mon3.asmi',
    );

    expect(contracts.get('MON_PRINT_CHAR')).toEqual({
      name: 'MON_PRINT_CHAR',
      in: ['A'],
      out: [],
      clobbers: ['A'],
      preserves: [],
      complete: true,
    });
    expect(contracts.get('MON_GET_KEY')).toEqual({
      name: 'MON_GET_KEY',
      in: [],
      out: ['A', 'zero'],
      clobbers: ['carry'],
      preserves: [],
      complete: true,
    });
  });

  it('rejects malformed register-care interface contract lines', () => {
    expect(() =>
      parseInterfaceContracts(['extern MON', 'clobbers Q', 'end'].join('\n'), 'mon3.asmi'),
    ).toThrow('mon3.asmi:2: invalid register-care interface line "clobbers Q"');
    expect(() =>
      parseInterfaceContracts(['extern MON', 'clobbers A, Q', 'end'].join('\n'), 'mon3.asmi'),
    ).toThrow('mon3.asmi:2: invalid register-care interface line "clobbers A, Q"');
  });

  it('rejects comments in register-care interface contract files', () => {
    expect(() =>
      parseInterfaceContracts(['; no comments here', 'extern MON', 'end'].join('\n'), 'mon3.asmi'),
    ).toThrow('mon3.asmi:1: .asmi files do not permit comments');
  });
});
