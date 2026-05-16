import { describe, expect, it } from 'vitest';

import { parseSmartCommentLine, parseSmartComments } from '../../src/registerCare/smartComments.js';

describe('register-care smart comments', () => {
  it('parses proc tags', () => {
    expect(parseSmartCommentLine(';! @proc CHECK_COLLISION_AT_DE')).toEqual({
      kind: 'proc',
      name: 'CHECK_COLLISION_AT_DE',
    });
  });

  it('parses carrier tags with documentation names', () => {
    expect(parseSmartCommentLine(';! @in {DE} raw_coord')).toEqual({
      kind: 'in',
      carriers: ['D', 'E'],
      name: 'raw_coord',
    });
  });

  it('parses carrier-list tags', () => {
    expect(parseSmartCommentLine(';! @clobbers {A,F,carry}')).toEqual({
      kind: 'clobbers',
      carriers: ['A', 'F', 'carry'],
    });
  });

  it('parses caller expect-out hints', () => {
    expect(parseSmartCommentLine(';! @expect-out {HL} pointer')).toEqual({
      kind: 'expectOut',
      carriers: ['H', 'L'],
      name: 'pointer',
    });
  });

  it('ignores ordinary comments', () => {
    expect(parseSmartCommentLine('; clobbers A')).toBeUndefined();
  });

  it('rejects unknown carriers', () => {
    expect(parseSmartCommentLine(';! @in {BAD} value')).toBeUndefined();
  });

  it('parses bare C as register C and carry as the carry flag', () => {
    expect(parseSmartCommentLine(';! @in {C} reg_c')).toEqual({
      kind: 'in',
      carriers: ['C'],
      name: 'reg_c',
    });
    expect(parseSmartCommentLine(';! @out {carry} flag')).toEqual({
      kind: 'out',
      carriers: ['carry'],
      name: 'flag',
    });
  });

  it('ignores unknown smart tags', () => {
    expect(parseSmartCommentLine(';! @unknown {DE}')).toBeUndefined();
  });

  it('ignores malformed carrier payloads', () => {
    expect(parseSmartCommentLine(';! @in DE raw')).toBeUndefined();
    expect(parseSmartCommentLine(';! @in {} raw')).toBeUndefined();
  });

  it('parses located comments from module loader comment maps in deterministic order', () => {
    const sourceLineComments = new Map<string, Map<number, string>>([
      [
        'src/zeta.asm',
        new Map([
          [20, '! @in {DE} raw'],
          [1, 'ordinary comment'],
        ]),
      ],
      [
        'src/alpha.asm',
        new Map([
          [30, '! @in {HL} pointer'],
          [10, '! @proc FOO'],
          [20, 'ordinary comment'],
        ]),
      ],
    ]);

    expect(parseSmartComments(sourceLineComments)).toEqual([
      {
        file: 'src/alpha.asm',
        line: 10,
        comment: { kind: 'proc', name: 'FOO' },
      },
      {
        file: 'src/alpha.asm',
        line: 30,
        comment: { kind: 'in', carriers: ['H', 'L'], name: 'pointer' },
      },
      {
        file: 'src/zeta.asm',
        line: 20,
        comment: { kind: 'in', carriers: ['D', 'E'], name: 'raw' },
      },
    ]);
  });
});
