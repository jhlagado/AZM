import { describe, expect, it } from 'vitest';

import { renderStepPipeline } from '../../src/lowering/steps.js';
import type { SourceSpan, TypeExprNode } from '../../src/frontend/ast.js';
import { createScalarWordAccessorHelpers } from '../../src/lowering/scalarWordAccessors.js';
import type { EaResolution } from '../../src/lowering/eaResolution.js';

const span: SourceSpan = {
  file: 'test.zax',
  start: { offset: 0, line: 1, column: 1 },
  end: { offset: 0, line: 1, column: 1 },
};

const typeName = (name: string): TypeExprNode => ({ kind: 'TypeName', span, name });

describe('#509 scalar word accessor routing', () => {
  const emitted: string[][] = [];
  const helpers = createScalarWordAccessorHelpers({
    emitStepPipeline: (pipeline) => {
      emitted.push(renderStepPipeline(pipeline));
      return true;
    },
    resolveScalarKind: (typeExpr) =>
      typeExpr.kind === 'TypeName' && (typeExpr.name === 'byte' || typeExpr.name === 'word' || typeExpr.name === 'addr')
        ? typeExpr.name
        : undefined,
    resolveAggregateType: () => undefined,
  });

  const absWord = (): EaResolution => ({
    kind: 'abs',
    baseLower: 'globw',
    addend: 0,
    typeExpr: typeName('word'),
  });
  const stackWord = (): EaResolution => ({
    kind: 'stack',
    ixDisp: -4,
    typeExpr: typeName('word'),
  });
  const absByte = (): EaResolution => ({
    kind: 'abs',
    baseLower: 'globb',
    addend: 0,
    typeExpr: typeName('byte'),
  });
  const stackByte = (): EaResolution => ({
    kind: 'stack',
    ixDisp: -2,
    typeExpr: typeName('byte'),
  });

  it('keeps representative scalar word routing decisions stable', () => {
    emitted.length = 0;

    expect(helpers.canUseScalarWordAccessor(absWord())).toBe(true);
    expect(helpers.canUseScalarWordAccessor(stackWord())).toBe(true);
    expect(helpers.canUseScalarWordAccessor(absByte())).toBe(false);
    expect(helpers.canUseScalarWordAccessor(stackByte())).toBe(false);

    expect(helpers.emitScalarWordLoad('HL', absWord(), span)).toBe(true);
    expect(helpers.emitScalarWordLoad('DE', stackWord(), span)).toBe(true);

    expect(helpers.emitScalarWordStore('HL', absWord(), span)).toBe(true);
    expect(helpers.emitScalarWordStore('DE', stackWord(), span)).toBe(true);

    expect(emitted).toEqual([
      ['ld hl, (globw)'],
      ['ld lo(DE), (ix-$04)', 'ld hi(DE), (ix-$03)'],
      ['ld (globw), HL'],
      ['ld (ix-$04), lo(DE)', 'ld (ix-$03), hi(DE)'],
    ]);
  });

  it('keeps exact scalar-kind gating stable', () => {
    expect(helpers.scalarKindOfResolution(absWord())).toBe('word');
    expect(helpers.scalarKindOfResolution(absByte())).toBe('byte');
    expect(helpers.isWordCompatibleScalarKind('word')).toBe(true);
    expect(helpers.isWordCompatibleScalarKind('addr')).toBe(true);
    expect(helpers.isWordCompatibleScalarKind('byte')).toBe(false);
    expect(helpers.isWordCompatibleScalarKind(undefined)).toBe(false);
  });
});
