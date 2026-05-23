import type { EnumDeclNode } from '../frontend/ast.js';
import type { LoweringContext, LoweringResult } from './programLowering.js';
import type { PlacementKind } from './loweringTypes.js';
import { createProgramLoweringDeclarationHelpers } from './programLoweringDeclarations.js';
import { tryLowerAsmDirective } from './asmDirectiveLowering.js';
import { lowerAsmSourceInstruction } from './asmSourceInstructionLowering.js';
import {
  isAsmBinFromDirective,
  isAsmBinToDirective,
  isAsmEndDirective,
  isAsmOrgDirective,
  isAsmRawDataDirective,
} from './asmDirectiveTraversal.js';

function placementForAsmOrg(items: readonly unknown[], index: number): PlacementKind {
  for (let lookahead = index + 1; lookahead < items.length; lookahead++) {
    const next = items[lookahead] as { kind?: string } | undefined;
    if (!next?.kind) continue;
    if (isAsmRawDataDirective(next as { kind: string })) return 'data';
    if (next.kind === 'AsmLabel' || next.kind === 'AsmEqu') continue;
    return 'code';
  }
  return 'code';
}

function lowerItem(
  ctx: LoweringContext,
  lowerAsmRawDataDirective: ReturnType<
    typeof createProgramLoweringDeclarationHelpers
  >['lowerAsmRawDataDirective'],
  item: any,
): void {
  if (tryLowerAsmDirective(ctx, item)) return;
  if (item.kind === 'AsmInstruction') {
    lowerAsmSourceInstruction(ctx, item);
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
        file: enumDecl.span.file,
        line: enumDecl.span.start.line,
        scope: 'global',
      });
    }
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
}

export function lowerProgramDeclarations(ctx: LoweringContext): LoweringResult {
  const { lowerAsmRawDataDirective } = createProgramLoweringDeclarationHelpers(ctx);

  for (const sourceFile of ctx.program.files) {
    ctx.activePlacementRef.current = 'code';
    let asmEndReached = false;
    for (let index = 0; index < sourceFile.items.length; index++) {
      const item = sourceFile.items[index]!;
      if (isAsmEndDirective(item)) {
        asmEndReached = true;
        continue;
      }
      if (asmEndReached && !isAsmBinFromDirective(item) && !isAsmBinToDirective(item)) continue;
      if (isAsmOrgDirective(item)) {
        ctx.activePlacementRef.current = placementForAsmOrg(sourceFile.items, index);
      }
      lowerItem(ctx, lowerAsmRawDataDirective, item);
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
