import { describe, expect, it } from 'vitest';

import type { EaExprNode, SourceSpan } from '../../src/frontend/ast.js';
import type { CompileEnv } from '../../src/semantics/env.js';
import {
  foldLayoutCastAbsEa,
  layoutCastPathOffset,
} from '../../src/semantics/layoutCastFold.js';
import { sizeOfTypeExpr } from '../../src/semantics/layout.js';
import { evalImmExpr } from '../../src/semantics/env.js';

const span: SourceSpan = {
  file: 'fixture.asm',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const spriteArrayType = {
  kind: 'ArrayType' as const,
  span,
  element: { kind: 'TypeName' as const, span, name: 'Sprite' },
  length: 16,
};

function envWithSprite(): CompileEnv {
  return {
    types: new Map([
      [
        'Sprite',
        {
          kind: 'TypeDecl',
          span,
          name: 'Sprite',
          typeExpr: {
            kind: 'RecordType',
            span,
            fields: [
              { kind: 'RecordField', span, name: 'x', typeExpr: { kind: 'TypeName', span, name: 'byte' } },
              { kind: 'RecordField', span, name: 'y', typeExpr: { kind: 'TypeName', span, name: 'byte' } },
              { kind: 'RecordField', span, name: 'tile', typeExpr: { kind: 'TypeName', span, name: 'byte' } },
              { kind: 'RecordField', span, name: 'flags', typeExpr: { kind: 'TypeName', span, name: 'byte' } },
            ],
          },
        },
      ],
    ]),
    unions: new Map(),
    consts: new Map([['BASE', 2]]),
    enums: new Map(),
  } as CompileEnv;
}

function layoutCastExpr(baseName: string, index: number, field: string): EaExprNode {
  return {
    kind: 'EaField',
    span,
    field,
    base: {
      kind: 'EaIndex',
      span,
      base: {
        kind: 'EaReinterpret',
        span,
        typeExpr: spriteArrayType,
        base: { kind: 'EaName', span, name: baseName },
      },
      index: {
        kind: 'IndexImm',
        span,
        value: { kind: 'ImmLiteral', span, value: index },
      },
    },
  };
}

describe('layoutCastFold semantics', () => {
  it('matches offset(Sprite[16], [3].flags) for a constant index path', () => {
    const env = envWithSprite();
    const evalImm = (expr: Parameters<typeof evalImmExpr>[0]) => evalImmExpr(expr, env, []);

    const path: import('../../src/frontend/ast.js').OffsetofPathNode = {
      kind: 'OffsetofPath',
      span,
      steps: [
        { kind: 'OffsetofIndex', span, expr: { kind: 'ImmLiteral', span, value: 3 } },
        { kind: 'OffsetofField', span, name: 'flags' },
      ],
    };

    const fromOffset = layoutCastPathOffset(spriteArrayType, path, env, evalImm);
    const folded = foldLayoutCastAbsEa(layoutCastExpr('SPRITES', 3, 'flags'), {
      env,
      evalImm,
      resolveAbsBase: (baseEa) =>
        baseEa.kind === 'EaName' ? { baseLower: baseEa.name.toLowerCase(), addend: 0 } : undefined,
    });

    expect(fromOffset).toBe(15);
    expect(folded).toEqual({ baseLower: 'sprites', addend: 15 });
  });

  it('folds BASE + 1 index expressions', () => {
    const env = envWithSprite();
    const evalImm = (expr: Parameters<typeof evalImmExpr>[0]) => evalImmExpr(expr, env, []);

    const expr: EaExprNode = {
      kind: 'EaField',
      span,
      field: 'flags',
      base: {
        kind: 'EaIndex',
        span,
        base: {
          kind: 'EaReinterpret',
          span,
          typeExpr: spriteArrayType,
          base: { kind: 'EaName', span, name: 'SPRITES' },
        },
        index: {
          kind: 'IndexImm',
          span,
          value: {
            kind: 'ImmBinary',
            span,
            op: '+',
            left: { kind: 'ImmName', span, name: 'BASE' },
            right: { kind: 'ImmLiteral', span, value: 1 },
          },
        },
      },
    };

    const folded = foldLayoutCastAbsEa(expr, {
      env,
      evalImm,
      resolveAbsBase: (baseEa) =>
        baseEa.kind === 'EaName' ? { baseLower: baseEa.name.toLowerCase(), addend: 0 } : undefined,
    });

    expect(folded?.addend).toBe(15);
    expect(sizeOfTypeExpr(spriteArrayType.element, env)).toBe(4);
  });
});
