import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

function hexBytes(source: string): string {
  const result = compileNext(source);
  expect(result.diagnostics).toEqual([]);
  return Buffer.from(result.bytes).toString('hex');
}

describe('ASM80 conditional assembly and byte extraction functions', () => {
  it('uses LSB and MSB compile-time functions for constants and labels', () => {
    const result = compileNext(
      [
        '        .org $1234',
        'TARGET: .db $00',
        'VALUE   .equ $ABCD',
        '        .db LSB(VALUE), MSB(VALUE), LSB(TARGET), MSB(TARGET)',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toEqual([]);
    expect(Buffer.from(result.bytes).toString('hex')).toBe('00cdab3412');
  });

  it('includes only the active .if branch and supports .else', () => {
    expect(
      hexBytes(
        [
          'FLAG .equ 1',
          '        .if FLAG',
          '        .db $11',
          '        .else',
          '        .db $22',
          '        .endif',
          '',
        ].join('\n'),
      ),
    ).toBe('11');
  });

  it('supports nested lowercase conditional assembly directives', () => {
    expect(
      hexBytes(
        [
          'OUTER .equ 1',
          'INNER .equ 0',
          '        .if OUTER',
          '        .if INNER',
          '        .db $10',
          '        .else',
          '        .db $20',
          '        .endif',
          '        .else',
          '        .db $30',
          '        .endif',
          '',
        ].join('\n'),
      ),
    ).toBe('20');
  });

  it('can read earlier supported EQU spellings in .if expressions', () => {
    expect(
      hexBytes(
        [
          'FLAG EQU 1',
          '        .if FLAG',
          '        .db $33',
          '        .else',
          '        .db $44',
          '        .endif',
          '',
        ].join('\n'),
      ),
    ).toBe('33');
  });

  it('diagnoses unmatched and unterminated conditional directives', () => {
    const unmatchedElse = compileNext('        .else\n');
    expect(unmatchedElse.diagnostics).toEqual([
      expect.objectContaining({ message: 'unmatched .else' }),
    ]);

    const unterminated = compileNext('        .if 1\n        .db $01\n');
    expect(unterminated.diagnostics).toEqual([
      expect.objectContaining({ message: 'unterminated .if' }),
    ]);
  });

  it('keeps uppercase conditional spellings unsupported', () => {
    for (const directive of ['IF 1', '.IF 1', '.ELSE', '.ENDIF']) {
      const result = compileNext(`${directive}\n`);
      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          message: expect.stringContaining(`unsupported source line: ${directive}`),
        }),
      ]);
    }
  });

  it('rejects current-location-dependent .if expressions instead of guessing a location', () => {
    const result = compileNext(
      [
        '        .org $100',
        'HERE    .equ $',
        '        .if here - $100',
        '        .db $01',
        '        .else',
        '        .db $02',
        '        .endif',
        '',
      ].join('\n'),
    );

    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        message:
          'invalid .if expression: current location is not available during conditional assembly',
      }),
    ]);
  });
});
