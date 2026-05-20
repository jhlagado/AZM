import type {
  BinDeclNode,
  ImmExprNode,
  NamedSectionNode,
  RawDataDeclNode,
} from '../frontend/ast.js';
import type { NamedSectionContributionSink } from './sectionContributions.js';

import type { Context } from './programLowering.js';
import type { SectionKind } from './loweringTypes.js';
import {
  createAsmRawDataLowerer,
  type RawDataLike,
} from './asmRawDataLowering.js';

type NamedSectionTarget = { node: NamedSectionNode; sink: NamedSectionContributionSink };

export function createProgramLoweringDeclarationHelpers(ctx: Context): {
  lowerBinDecl: (binDecl: BinDeclNode, namedSection?: NamedSectionTarget) => void;
  lowerRawDataDecl: (decl: RawDataDeclNode, namedSection?: NamedSectionTarget) => void;
  lowerAsmRawDataDirective: (decl: RawDataLike, namedSection?: NamedSectionTarget) => void;
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

  const lowerBinDecl = (binDecl: BinDeclNode, namedSection?: NamedSectionTarget): void => {
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
    if (namedSection) {
      const targetSection = namedSection.node.section;
      if (binDecl.section !== targetSection) {
        ctx.diag(
          ctx.diagnostics,
          binDecl.span.file,
          `bin declaration "${binDecl.name}" section "${binDecl.section}" does not match enclosing named section "${targetSection} ${namedSection.node.name}".`,
        );
        return;
      }
      namedSection.sink.pendingSymbols.push({
        kind: 'data',
        name: binDecl.name,
        section: targetSection,
        offset: namedSection.sink.offset,
        file: binDecl.span.file,
        line: binDecl.span.start.line,
        scope: 'global',
      });
      ctx.recordLoweredAsmItem({ kind: 'label', name: binDecl.name }, binDecl.span);
      for (const b of blob) {
        namedSection.sink.bytes.set(namedSection.sink.offset++, b & 0xff);
        ctx.recordLoweredAsmItem(
          { kind: 'db', values: [{ kind: 'literal', value: b & 0xff }] },
          binDecl.span,
        );
      }
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

  const lowerRawDataDecl = (decl: RawDataDeclNode, namedSection?: NamedSectionTarget): void => {
    if (!namedSection || namedSection.node.section !== 'data') {
      const sectionName = namedSection?.node.name ?? 'module scope';
      ctx.diag(
        ctx.diagnostics,
        decl.span.file,
        `Raw data declarations are only allowed inside data sections${namedSection ? ` like "${sectionName}"` : ''}.`,
      );
      return;
    }

    if (decl.name.length > 0) {
      const okToDeclareSymbol = !ctx.taken.has(decl.name);
      if (!okToDeclareSymbol) {
        ctx.diag(ctx.diagnostics, decl.span.file, `Duplicate symbol name "${decl.name}".`);
      } else {
        ctx.taken.add(decl.name);
        namedSection.sink.pendingSymbols.push({
          kind: 'data',
          name: decl.name,
          section: namedSection.node.section,
          offset: namedSection.sink.offset,
          file: decl.span.file,
          line: decl.span.start.line,
          scope: 'global',
        });
        ctx.recordLoweredAsmItem({ kind: 'label', name: decl.name }, decl.span);
      }
    }

    const emitByte = (b: number): void => {
      namedSection.sink.bytes.set(namedSection.sink.offset, b & 0xff);
      namedSection.sink.offset++;
      ctx.recordLoweredAsmItem(
        { kind: 'db', values: [{ kind: 'literal', value: b & 0xff }] },
        decl.span,
      );
    };
    const emitByteNoRecord = (b: number): void => {
      namedSection.sink.bytes.set(namedSection.sink.offset, b & 0xff);
      namedSection.sink.offset++;
    };
    const emitWord = (w: number): void => {
      namedSection.sink.bytes.set(namedSection.sink.offset, w & 0xff);
      namedSection.sink.offset++;
      namedSection.sink.bytes.set(namedSection.sink.offset, (w >> 8) & 0xff);
      namedSection.sink.offset++;
      ctx.recordLoweredAsmItem(
        { kind: 'dw', values: [{ kind: 'literal', value: w & 0xffff }] },
        decl.span,
      );
    };

    if (decl.directive === 'ds') {
      const size = ctx.evalImmExpr(decl.size, ctx.env, ctx.diagnostics);
      if (size === undefined) {
        ctx.diag(
          ctx.diagnostics,
          decl.span.file,
          `Failed to evaluate raw data size for "${decl.name}".`,
        );
        return;
      }
      if (size < 0) {
        ctx.diag(
          ctx.diagnostics,
          decl.span.file,
          `Raw data size for "${decl.name}" must be non-negative.`,
        );
        return;
      }
      ctx.recordLoweredAsmItem(
        {
          kind: 'ds',
          size: ctx.lowerImmExprForLoweredAsm(decl.size),
          fill: { kind: 'literal', value: 0 },
        },
        decl.span,
      );
      for (let i = 0; i < size; i++) emitByteNoRecord(0);
      return;
    }

    for (const value of decl.values) {
      const v = ctx.evalImmExpr(value, ctx.env, ctx.diagnostics);
      if (v !== undefined) {
        if (decl.directive === 'db') emitByte(v);
        else emitWord(v);
        continue;
      }
      if (decl.directive === 'dw') {
        const symbolic = symbolicTargetFromExpr(value);
        if (symbolic) {
          namedSection.sink.fixups.push({
            offset: namedSection.sink.offset,
            baseLower: symbolic.baseLower,
            addend: symbolic.addend,
            file: decl.span.file,
          });
          emitWord(0);
          continue;
        }
      }
      ctx.diag(
        ctx.diagnostics,
        decl.span.file,
        `Failed to evaluate raw data value for "${decl.name}".`,
      );
      if (decl.directive === 'db') emitByte(0);
      else emitWord(0);
    }
  };

  const lowerAsmRawDataDirective = createAsmRawDataLowerer(ctx, symbolicTargetFromExpr);

  return { lowerBinDecl, lowerRawDataDecl, lowerAsmRawDataDirective };
}
