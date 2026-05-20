import type {
  BinDeclNode,
  ImmExprNode,
  RawDataDeclNode,
} from '../frontend/ast.js';

import type { Context } from './programLowering.js';
import type { SectionKind } from './loweringTypes.js';
import {
  createAsmRawDataLowerer,
  type RawDataLike,
} from './asmRawDataLowering.js';

export function createProgramLoweringDeclarationHelpers(ctx: Context): {
  lowerBinDecl: (binDecl: BinDeclNode) => void;
  lowerRawDataDecl: (decl: RawDataDeclNode) => void;
  lowerAsmRawDataDirective: (decl: RawDataLike) => void;
} {
  const symbolicTargetFromExpr = (
    expr: ImmExprNode,
  ): { baseLower: string; addend: number } | undefined => {
    if (expr.kind === 'ImmName') return { baseLower: expr.name.toLowerCase(), addend: 0 };
    if (expr.kind !== 'ImmBinary') return undefined;
    if (expr.op !== '+' && expr.op !== '-') return undefined;

    const leftName = expr.left.kind === 'ImmName' ? expr.left.name.toLowerCase() : undefined;
    const rightName = expr.right.kind === 'ImmName' ? expr.right.name.toLowerCase() : undefined;

    if (leftName) {
      const right = ctx.evalImmExpr(expr.right, ctx.env, ctx.diagnostics);
      if (right === undefined) return undefined;
      return { baseLower: leftName, addend: expr.op === '+' ? right : -right };
    }

    if (expr.op === '+' && rightName) {
      const left = ctx.evalImmExpr(expr.left, ctx.env, ctx.diagnostics);
      if (left === undefined) return undefined;
      return { baseLower: rightName, addend: left };
    }

    return undefined;
  };

  const lowerBinDecl = (binDecl: BinDeclNode): void => {
    const withTempSection = (section: SectionKind, fn: () => void): void => {
      const prev = ctx.activeSectionRef.current;
      ctx.activeSectionRef.current = section;
      try {
        fn();
      } finally {
        ctx.activeSectionRef.current = prev;
      }
    };

    if (ctx.taken.has(binDecl.name)) {
      ctx.diag(ctx.diagnostics, binDecl.span.file, `Duplicate symbol name "${binDecl.name}".`);
      return;
    }
    ctx.taken.add(binDecl.name);
    const blob = ctx.loadBinInput(
      binDecl.span.file,
      binDecl.fromPath,
      ctx.includeDirs,
      (file, message) => ctx.diag(ctx.diagnostics, file, message),
    );
    if (!blob) return;
    if (binDecl.section === 'var') {
      ctx.diag(
        ctx.diagnostics,
        binDecl.span.file,
        `bin declarations cannot target section "var" in v0.2.`,
      );
      return;
    }
    if (binDecl.section === 'code') {
      ctx.pending.push({
        kind: 'data',
        name: binDecl.name,
        section: 'code',
        offset: ctx.codeOffsetRef.current,
        file: binDecl.span.file,
        line: binDecl.span.start.line,
        scope: 'global',
      });
      withTempSection('code', () => {
        ctx.recordLoweredAsmItem({ kind: 'label', name: binDecl.name }, binDecl.span);
        for (const b of blob) {
          ctx.codeBytes.set(ctx.codeOffsetRef.current++, b & 0xff);
          ctx.recordLoweredAsmItem(
            { kind: 'db', values: [{ kind: 'literal', value: b & 0xff }] },
            binDecl.span,
          );
        }
      });
      return;
    }
    ctx.pending.push({
      kind: 'data',
      name: binDecl.name,
      section: 'data',
      offset: ctx.dataOffsetRef.current,
      file: binDecl.span.file,
      line: binDecl.span.start.line,
      scope: 'global',
    });
    withTempSection('data', () => {
      ctx.recordLoweredAsmItem({ kind: 'label', name: binDecl.name }, binDecl.span);
      for (const b of blob) {
        ctx.dataBytes.set(ctx.dataOffsetRef.current++, b & 0xff);
        ctx.recordLoweredAsmItem(
          { kind: 'db', values: [{ kind: 'literal', value: b & 0xff }] },
          binDecl.span,
        );
      }
    });
  };

  const lowerRawDataDecl = (decl: RawDataDeclNode): void => {
    ctx.diag(ctx.diagnostics, decl.span.file, `Raw data declaration nodes are retired ZAX syntax.`);
  };

  const lowerAsmRawDataDirective = createAsmRawDataLowerer(ctx, symbolicTargetFromExpr);

  return { lowerBinDecl, lowerRawDataDecl, lowerAsmRawDataDirective };
}
