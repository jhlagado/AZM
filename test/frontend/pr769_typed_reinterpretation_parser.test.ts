import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseImmExprFromText } from '../../src/frontend/parseImm.js';
import { parseAsmOperand, parseEaExprFromText } from '../../src/frontend/parseOperands.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';

describe('PR769 typed reinterpretation parser', () => {
  const file = makeSourceFile('pr769_typed_reinterpretation_parser.zax', '');
  const zeroSpan = span(file, 0, 0);

  it('parses typed reinterpretation as an ea storage-path head', () => {
    const diagnostics: Diagnostic[] = [];

    expect(parseAsmOperand(file.path, '<Sprite>hl.flags', zeroSpan, diagnostics)).toMatchObject({
      kind: 'Ea',
      expr: {
        kind: 'EaField',
        field: 'flags',
        base: {
          kind: 'EaReinterpret',
          typeExpr: { kind: 'TypeName', name: 'Sprite' },
          base: { kind: 'EaName', name: 'HL' },
        },
      },
    });

    expect(parseAsmOperand(file.path, '<Header>ptr.checksum', zeroSpan, diagnostics)).toMatchObject(
      {
        kind: 'Ea',
        expr: {
          kind: 'EaField',
          field: 'checksum',
          base: {
            kind: 'EaReinterpret',
            typeExpr: { kind: 'TypeName', name: 'Header' },
            base: { kind: 'EaName', name: 'ptr' },
          },
        },
      },
    );

    expect(diagnostics).toEqual([]);
  });

  it('parses parenthesized reinterpret bases with indexed tails', () => {
    const diagnostics: Diagnostic[] = [];
    const expr = parseEaExprFromText(
      file.path,
      '<TileMap>(map_base + 32)[row][col]',
      zeroSpan,
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
    expect(expr).toMatchObject({
      kind: 'EaIndex',
      index: { kind: 'IndexImm', value: { kind: 'ImmName', name: 'col' } },
      base: {
        kind: 'EaIndex',
        index: { kind: 'IndexImm', value: { kind: 'ImmName', name: 'row' } },
        base: {
          kind: 'EaReinterpret',
          typeExpr: { kind: 'TypeName', name: 'TileMap' },
          base: {
            kind: 'EaAdd',
            base: { kind: 'EaName', name: 'map_base' },
            offset: { kind: 'ImmLiteral', value: 32 },
          },
        },
      },
    });
  });

  it('keeps reinterpretation in ea precedence instead of imm cast parsing', () => {
    const diagnostics: Diagnostic[] = [];

    expect(
      parseEaExprFromText(file.path, '<Sprite>hl.flags + 2', zeroSpan, diagnostics),
    ).toMatchObject({
      kind: 'EaAdd',
      base: {
        kind: 'EaField',
        base: { kind: 'EaReinterpret' },
      },
      offset: { kind: 'ImmLiteral', value: 2 },
    });
    expect(
      parseImmExprFromText(file.path, '<Sprite>hl.flags', zeroSpan, diagnostics, false),
    ).toBeUndefined();
    expect(diagnostics).toEqual([]);
  });

  it('rejects v1 reinterpret forms without a tail or with invalid bases', () => {
    const diagnostics: Diagnostic[] = [];

    expect(parseEaExprFromText(file.path, '<Sprite>hl', zeroSpan, diagnostics)).toBeUndefined();
    expect(parseEaExprFromText(file.path, '<Sprite>af.flags', zeroSpan, diagnostics)).toBeUndefined();
    expect(
      parseEaExprFromText(file.path, '<Sprite>(<Header>hl.flags + 1).x', zeroSpan, diagnostics),
    ).toBeUndefined();
    expect(diagnostics).toEqual([]);
  });
});
