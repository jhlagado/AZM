import type {
  AlignDirectiveNode,
  EnumDeclNode,
  RawDataDeclNode,
} from '../frontend/ast.js';
import type { LoweringContext, LoweringResult } from './programLowering.js';
import type { SectionKind } from './loweringTypes.js';
import { createProgramLoweringDeclarationHelpers } from './programLoweringDeclarations.js';
import { tryLowerAsmDirective } from './asmDirectiveLowering.js';
import { lowerNativeAsmInstruction } from './nativeAsmLowering.js';
import {
  isAsmBinFromDirective,
  isAsmBinToDirective,
  isAsmEndDirective,
  isAsmOrgDirective,
  isAsmRawDataDirective,
} from './asmDirectiveTraversal.js';

function sectionForAsmOrg(items: readonly unknown[], index: number): SectionKind {
  for (let lookahead = index + 1; lookahead < items.length; lookahead++) {
    const next = items[lookahead] as { kind?: string } | undefined;
    if (!next?.kind) continue;
    if (isAsmRawDataDirective(next as { kind: string })) return 'data';
    if (next.kind === 'AsmLabel' || next.kind === 'ClassicEqu') continue;
    return 'code';
  }
  return 'code';
}

function lowerItem(
  ctx: LoweringContext,
  lowerRawDataDecl: ReturnType<typeof createProgramLoweringDeclarationHelpers>['lowerRawDataDecl'],
  lowerAsmRawDataDirective: ReturnType<
    typeof createProgramLoweringDeclarationHelpers
  >['lowerAsmRawDataDirective'],
  item: any,
): void {
  if (tryLowerAsmDirective(ctx, item)) return;
  if (item.kind === 'AsmInstruction') {
    lowerNativeAsmInstruction(ctx, item);
    return;
  }
  if (isAsmRawDataDirective(item)) {
    lowerAsmRawDataDirective(item as Parameters<typeof lowerAsmRawDataDirective>[0]);
    return;
  }

  if (item.kind === 'EnumDecl') {
    const enumDecl = item as EnumDeclNode;
    for (let idx = 0; idx < enumDecl.members.length; idx++) {
      const member = enumDecl.members[idx]!;
      const name = `${enumDecl.name}.${member}`;
      if (ctx.env.enums.get(name) !== idx) continue;
      if (ctx.taken.has(name)) {
        ctx.diag(ctx.diagnostics, enumDecl.span.file, `Duplicate symbol name "${name}".`);
        continue;
      }
      ctx.taken.add(name);
      ctx.symbols.push({
        kind: 'constant',
        name,
        value: idx,
        address: idx & 0xffff,
        file: enumDecl.span.file,
        line: enumDecl.span.start.line,
        scope: 'global',
      });
    }
    return;
  }

  if (item.kind === 'Align') {
    const align = item as AlignDirectiveNode;
    const value = ctx.evalImmExpr(align.value, ctx.env, ctx.diagnostics);
    if (value === undefined) {
      ctx.diag(ctx.diagnostics, align.span.file, `Failed to evaluate align value.`);
      return;
    }
    if (value <= 0) {
      ctx.diag(ctx.diagnostics, align.span.file, `align value must be > 0.`);
      return;
    }
    const current = ctx.activeSectionRef.current === 'code'
        ? ctx.codeOffsetRef.current
        : ctx.dataOffsetRef.current;
    const aligned = ctx.alignTo(current, value);
    const pad = aligned - current;
    if (pad > 0) {
      ctx.recordLoweredAsmItem({ kind: 'ds', size: { kind: 'literal', value: pad } }, align.span);
    }
    ctx.advanceAlign(value);
    return;
  }

  if (item.kind === 'OpDecl') {
    const op = item as import('../frontend/ast.js').OpDeclNode;
    const key = op.name.toLowerCase();
    if (ctx.taken.has(op.name) && !ctx.declaredOpNames.has(key)) {
      ctx.diag(ctx.diagnostics, op.span.file, `Duplicate symbol name "${op.name}".`);
    } else {
      ctx.taken.add(op.name);
      ctx.declaredOpNames.add(key);
    }
    return;
  }

  if (item.kind === 'RawDataDecl') {
    lowerRawDataDecl(item as RawDataDeclNode);
    return;
  }

}

export function lowerProgramDeclarations(ctx: LoweringContext): LoweringResult {
  const { lowerRawDataDecl, lowerAsmRawDataDirective } =
    createProgramLoweringDeclarationHelpers(ctx);

  for (const module of ctx.program.files) {
    ctx.activeSectionRef.current = 'code';
    let asmEndReached = false;
    for (let index = 0; index < module.items.length; index++) {
      const item = module.items[index]!;
      if (isAsmEndDirective(item)) {
        asmEndReached = true;
        continue;
      }
      if (asmEndReached && !isAsmBinFromDirective(item) && !isAsmBinToDirective(item)) continue;
      if (isAsmOrgDirective(item)) {
        ctx.activeSectionRef.current = sectionForAsmOrg(module.items, index);
      }
      lowerItem(ctx, lowerRawDataDecl, lowerAsmRawDataDirective, item);
    }
  }

  return {
    codeOffset: ctx.codeOffsetRef.current,
    dataOffset: ctx.dataOffsetRef.current,
    pending: ctx.pending,
    symbols: ctx.symbols,
    absoluteSymbols: ctx.absoluteSymbols,
    codeBytes: ctx.codeBytes,
    dataBytes: ctx.dataBytes,
  };
}
