import { describe, expect, it } from 'vitest';

import { renderStepPipeline } from '../../src/lowering/steps.js';
import { DiagnosticIds, type Diagnostic } from '../../src/diagnosticTypes.js';
import type { EaExprNode, SourceSpan, TypeExprNode } from '../../src/frontend/ast.js';
import { createAddressingPipelineBuilders } from '../../src/lowering/addressingPipelines.js';
import type { EaResolution } from '../../src/lowering/eaResolution.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

const typeName = (name: string): TypeExprNode => ({ kind: 'TypeName', span, name });
const byteArray = (): TypeExprNode => ({ kind: 'ArrayType', span, element: typeName('byte'), length: 4 });
const wordArray = (): TypeExprNode => ({ kind: 'ArrayType', span, element: typeName('word'), length: 4 });
const eaName = (name: string): EaExprNode => ({ kind: 'EaName', span, name });

describe('#509 addressing pipeline builders', () => {
  const diagnostics: Diagnostic[] = [];
  const reg8 = new Set(['A', 'B', 'C', 'D', 'E', 'H', 'L']);

  const baseResolutions = new Map<string, EaResolution>([
    ['globb', { kind: 'abs', baseLower: 'globb', addend: 0, typeExpr: byteArray() }],
    ['frameb', { kind: 'stack', ixDisp: -4, typeExpr: byteArray() }],
    ['globw', { kind: 'abs', baseLower: 'globw', addend: 0, typeExpr: wordArray() }],
    ['framew', { kind: 'stack', ixDisp: -8, typeExpr: wordArray() }],
    ['idxw', { kind: 'abs', baseLower: 'idxw', addend: 0, typeExpr: typeName('word') }],
    ['idxa', { kind: 'stack', ixDisp: -10, typeExpr: typeName('addr') }],
  ]);

  const helpers = createAddressingPipelineBuilders({
    diagnostics,
    diagAt: (_diagnostics, _span, message) => {
      diagnostics.push({
        id: DiagnosticIds.EmitError,
        severity: 'error',
        file: span.file,
        message,
      });
    },
    reg8,
    resolveEa: (ea, _span) => {
      if (ea.kind === 'EaName') return baseResolutions.get(ea.name.toLowerCase());
      return undefined;
    },
    resolveEaTypeExpr: (ea) => {
      if (ea.kind === 'EaName') return baseResolutions.get(ea.name.toLowerCase())?.typeExpr;
      return undefined;
    },
    resolveScalarBinding: (name) => {
      const lower = name.toLowerCase();
      if (lower === 'idxw') return 'word';
      if (lower === 'idxa') return 'addr';
      return undefined;
    },
    resolveScalarKind: (typeExpr) =>
      typeExpr.kind === 'TypeName' && (typeExpr.name === 'word' || typeExpr.name === 'addr')
        ? typeExpr.name
        : undefined,
    sizeOfTypeExpr: (typeExpr) => {
      if (typeExpr.kind !== 'TypeName') return undefined;
      if (typeExpr.name === 'byte') return 1;
      if (typeExpr.name === 'word' || typeExpr.name === 'addr') return 2;
      return undefined;
    },
    evalImmExpr: () => undefined,
  });

  it('keeps representative byte builder shapes stable', () => {
    const globPipe = helpers.buildEaBytePipeline(
      { kind: 'EaIndex', span, base: eaName('globb'), index: { kind: 'IndexReg8', span, reg: 'C' } },
      span,
    );
    const framePipe = helpers.buildEaBytePipeline(
      { kind: 'EaIndex', span, base: eaName('frameb'), index: { kind: 'IndexReg16', span, reg: 'HL' } },
      span,
    );

    expect(renderStepPipeline(globPipe ?? [])).toEqual([
      'ld de, globb',
      'ld h, 0',
      'ld l, c',
      'add hl, de',
    ]);
    expect(renderStepPipeline(framePipe ?? [])).toEqual([
      'ld e, (ix-$04)',
      'ld d, (ix-$03)',
      'add hl, de',
    ]);
  });

  it('keeps representative word builder shapes stable', () => {
    const globPipe = helpers.buildEaWordPipeline(
      { kind: 'EaIndex', span, base: eaName('globw'), index: { kind: 'IndexReg16', span, reg: 'HL' } },
      span,
    );
    const framePipe = helpers.buildEaWordPipeline(
      {
        kind: 'EaIndex',
        span,
        base: eaName('framew'),
        index: { kind: 'IndexImm', span, value: { kind: 'ImmName', span, name: 'idxw' } },
      },
      span,
    );

    expect(renderStepPipeline(globPipe ?? [])).toEqual([
      'ld de, globw',
      'add hl, hl',
      'add hl, de',
    ]);
    expect(renderStepPipeline(framePipe ?? [])).toEqual([
      'ld e, (ix-$08)',
      'ld d, (ix-$07)',
      'ld hl, (idxw)',
      'add hl, hl',
      'add hl, de',
    ]);
  });

  it('routes named word/address byte indices through structured byte pipelines', () => {
    const framePipe = helpers.buildEaBytePipeline(
      {
        kind: 'EaIndex',
        span,
        base: eaName('frameb'),
        index: { kind: 'IndexImm', span, value: { kind: 'ImmName', span, name: 'idxw' } },
      },
      span,
    );
    const globPipe = helpers.buildEaBytePipeline(
      {
        kind: 'EaIndex',
        span,
        base: eaName('globb'),
        index: { kind: 'IndexImm', span, value: { kind: 'ImmName', span, name: 'idxa' } },
      },
      span,
    );

    expect(renderStepPipeline(framePipe ?? [])).toEqual([
      'ld e, (ix-$04)',
      'ld d, (ix-$03)',
      'ld hl, (idxw)',
      'add hl, de',
    ]);
    expect(renderStepPipeline(globPipe ?? [])).toEqual([
      'ld de, globb',
      'ex de, hl',
      'ld e, (ix-$0a)',
      'ld d, (ix-$09)',
      'ex de, hl',
      'add hl, de',
    ]);
  });
});
