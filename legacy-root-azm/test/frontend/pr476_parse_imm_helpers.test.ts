import { describe, expect, it } from 'vitest';

import {
  parseImmExprFromText,
  parseNumberLiteral,
  parseTypeExprFromText,
} from '../../src/frontend/parseImm.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { expectNoDiagnostics } from '../helpers/diagnostics/index.js';

describe('PR476 immediate-expression parsing extraction', () => {
  const file = makeSourceFile('pr476_parse_imm_helpers.asm', '');
  const zeroSpan = span(file, 0, 0);

  it('keeps literal parsing behavior intact', () => {
    expect(parseNumberLiteral('$2A')).toBe(42);
    expect(parseNumberLiteral('%1010')).toBe(10);
    expect(parseNumberLiteral('0b111')).toBe(7);
    expect(parseNumberLiteral('123')).toBe(123);
    expect(parseNumberLiteral('garbage')).toBeUndefined();
  });

  it('parses ASM80 trailing-base numeric literals', () => {
    expect(parseNumberLiteral('0FFH')).toBe(0xff);
    expect(parseNumberLiteral('0ffh')).toBe(0xff);
    expect(parseNumberLiteral('1010B')).toBe(0b1010);
    expect(parseNumberLiteral('1010b')).toBe(0b1010);
    expect(parseNumberLiteral('00000000b')).toBe(0);
    expect(parseNumberLiteral('FFH')).toBeUndefined();
    expect(parseNumberLiteral('102B')).toBeUndefined();

    const diagnostics: Diagnostic[] = [];

    expect(parseImmExprFromText(file.path, '0FFH', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0xff,
    });
    expect(parseImmExprFromText(file.path, '0ffh', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0xff,
    });
    expect(parseImmExprFromText(file.path, '1010B', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0b1010,
    });
    expect(parseImmExprFromText(file.path, '1010b', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0b1010,
    });
    expect(parseImmExprFromText(file.path, 'FFH', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmName',
      name: 'FFH',
    });
    expect(parseImmExprFromText(file.path, '00000000b', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0,
    });
    expectNoDiagnostics(diagnostics);
  });

  it('parses ASM80 current-location expressions', () => {
    const diagnostics: Diagnostic[] = [];

    expect(parseImmExprFromText(file.path, '$', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmCurrentLocation',
    });
    expect(parseImmExprFromText(file.path, '$+3', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmBinary',
      op: '+',
      left: { kind: 'ImmCurrentLocation' },
      right: { kind: 'ImmLiteral', value: 3 },
    });
    expect(parseImmExprFromText(file.path, '$ - 4', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmBinary',
      op: '-',
      left: { kind: 'ImmCurrentLocation' },
      right: { kind: 'ImmLiteral', value: 4 },
    });
    expect(parseImmExprFromText(file.path, '$-APITable', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmBinary',
      op: '-',
      left: { kind: 'ImmCurrentLocation' },
      right: { kind: 'ImmName', name: 'APITable' },
    });
    expect(
      parseImmExprFromText(file.path, '($-DSAPIFunctions)/2', zeroSpan, diagnostics),
    ).toMatchObject({
      kind: 'ImmBinary',
      op: '/',
      left: {
        kind: 'ImmBinary',
        op: '-',
        left: { kind: 'ImmCurrentLocation' },
        right: { kind: 'ImmName', name: 'DSAPIFunctions' },
      },
      right: { kind: 'ImmLiteral', value: 2 },
    });
    expect(parseImmExprFromText(file.path, '$Label', zeroSpan, diagnostics)).toBeUndefined();

    expect(diagnostics).toEqual([
      expect.objectContaining({
        message: 'Invalid imm expression: $Label',
      }),
    ]);
  });

  it('parses leading-dot local symbols', () => {
    const diagnostics: Diagnostic[] = [];

    expect(parseImmExprFromText(file.path, '.loop', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmName',
      name: '.loop',
    });
    expectNoDiagnostics(diagnostics);
  });

  it('parses ASM80 one-character double-quoted expressions', () => {
    const diagnostics: Diagnostic[] = [];

    expect(parseImmExprFromText(file.path, '" "', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0x20,
    });
    expect(parseImmExprFromText(file.path, '":"', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0x3a,
    });
    expect(parseImmExprFromText(file.path, '"Y"', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmLiteral',
      value: 0x59,
    });
    expect(parseImmExprFromText(file.path, '"a"-"A"', zeroSpan, diagnostics)).toMatchObject({
      kind: 'ImmBinary',
      op: '-',
      left: { kind: 'ImmLiteral', value: 0x61 },
      right: { kind: 'ImmLiteral', value: 0x41 },
    });
    expect(parseImmExprFromText(file.path, '"NO"', zeroSpan, diagnostics)).toBeUndefined();

    expect(diagnostics).toEqual([
      expect.objectContaining({
        message: 'Invalid imm expression: "NO"',
      }),
    ]);
  });

  it('keeps type parsing behavior intact', () => {
    expect(parseTypeExprFromText('word[2]', zeroSpan)).toEqual({
      kind: 'ArrayType',
      span: zeroSpan,
      element: { kind: 'TypeName', span: zeroSpan, name: 'word' },
      length: 2,
    });
    expect(parseTypeExprFromText('byte[]', zeroSpan)).toBeUndefined();
    expect(parseTypeExprFromText('Module.Sprite', zeroSpan)).toBeUndefined();
  });

  it('keeps imm parsing behavior intact', () => {
    const diagnostics: Diagnostic[] = [];
    const expr = parseImmExprFromText(
      file.path,
      "sizeof(word[2]) + offset(Foo, bar[1]) - ~'A'",
      zeroSpan,
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(expr).toMatchObject({
      kind: 'ImmBinary',
      op: '-',
      left: {
        kind: 'ImmBinary',
        op: '+',
        left: {
          kind: 'ImmSizeof',
          typeExpr: {
            kind: 'ArrayType',
            element: { kind: 'TypeName', name: 'word' },
            length: 2,
          },
        },
        right: {
          kind: 'ImmOffset',
          typeExpr: { kind: 'TypeName', name: 'Foo' },
          path: {
            base: 'bar',
            steps: [{ kind: 'OffsetIndex', expr: { kind: 'ImmLiteral', value: 1 } }],
          },
        },
      },
      right: {
        kind: 'ImmUnary',
        op: '~',
        expr: { kind: 'ImmLiteral', value: 65 },
      },
    });
  });

  it('rejects dotted type names in sizeof arguments', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      parseImmExprFromText(file.path, 'sizeof(Module.Sprite)', zeroSpan, diagnostics),
    ).toBeUndefined();
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        message: 'Invalid imm expression: sizeof(Module.Sprite)',
      }),
    );
  });
});
