import type {
  AlignDirectiveNode,
  BinDeclNode,
  ConstDeclNode,
  EnumDeclNode,
  HexDeclNode,
  RawDataDeclNode,
} from '../frontend/ast.js';
import type { LoweringContext, LoweringResult } from './programLowering.js';
import type { SectionKind } from './loweringTypes.js';
import { createProgramLoweringDeclarationHelpers } from './programLoweringDeclarations.js';
import { isAzmNativePath } from '../frontend/sourceMode.js';
import { lowerAsm80Instruction } from './asm80InstructionLowering.js';
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
    if (next.kind === 'AsmLabel' || next.kind === 'ClassicEqu' || next.kind === 'ConstDecl') continue;
    return 'code';
  }
  return 'code';
}

function lowerItem(
  ctx: LoweringContext,
  lowerBinDecl: ReturnType<typeof createProgramLoweringDeclarationHelpers>['lowerBinDecl'],
  lowerRawDataDecl: ReturnType<typeof createProgramLoweringDeclarationHelpers>['lowerRawDataDecl'],
  lowerAsmRawDataDirective: ReturnType<
    typeof createProgramLoweringDeclarationHelpers
  >['lowerAsmRawDataDirective'],
  item: any,
): void {
  if (tryLowerAsmDirective(ctx, item)) return;
  if (item.kind === 'AsmInstruction') {
    if (isAzmNativePath(ctx.program.entryFile)) {
      lowerNativeAsmInstruction(ctx, item);
    } else {
      lowerAsm80Instruction(ctx, item);
    }
    return;
  }
  if (isAsmRawDataDirective(item)) {
    lowerAsmRawDataDirective(item as Parameters<typeof lowerAsmRawDataDirective>[0]);
    return;
  }

  if (item.kind === 'ConstDecl') {
    const constItem = item as ConstDeclNode;
    const value = ctx.env.consts.get(constItem.name);
    if (value !== undefined) {
      if (ctx.taken.has(constItem.name)) {
        ctx.diag(
          ctx.diagnostics,
          constItem.span.file,
          `Duplicate symbol name "${constItem.name}".`,
        );
        return;
      }
      ctx.taken.add(constItem.name);
      ctx.symbols.push({
        kind: 'constant',
        name: constItem.name,
        value,
        address: value & 0xffff,
        file: constItem.span.file,
        line: constItem.span.start.line,
        scope: 'global',
      });
      ctx.recordLoweredAsmItem(
        {
          kind: 'const',
          name: constItem.name,
          value: { kind: 'literal', value },
        },
        constItem.span,
      );
    }
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
        : ctx.activeSectionRef.current === 'data'
          ? ctx.dataOffsetRef.current
          : ctx.varOffsetRef.current;
    const aligned = ctx.alignTo(current, value);
    const pad = aligned - current;
    if (pad > 0) {
      ctx.recordLoweredAsmItem({ kind: 'ds', size: { kind: 'literal', value: pad } }, align.span);
    }
    ctx.advanceAlign(value);
    return;
  }

  if (item.kind === 'BinDecl') {
    lowerBinDecl(item as BinDeclNode);
    return;
  }

  if (item.kind === 'HexDecl') {
    const hexDecl = item as HexDeclNode;
    if (ctx.taken.has(hexDecl.name)) {
      ctx.diag(ctx.diagnostics, hexDecl.span.file, `Duplicate symbol name "${hexDecl.name}".`);
      return;
    }
    ctx.taken.add(hexDecl.name);
    const parsed = ctx.loadHexInput(
      hexDecl.span.file,
      hexDecl.fromPath,
      ctx.includeDirs,
      (file, message) => ctx.diag(ctx.diagnostics, file, message),
    );
    if (!parsed) return;
    for (const [addr, byte] of parsed.bytes) {
      if (ctx.hexBytes.has(addr)) {
        ctx.diag(ctx.diagnostics, hexDecl.span.file, `HEX overlap at address ${addr}.`);
        continue;
      }
      ctx.hexBytes.set(addr, byte);
    }
    ctx.absoluteSymbols.push({
      kind: 'data',
      name: hexDecl.name,
      address: parsed.minAddress,
      file: hexDecl.span.file,
      line: hexDecl.span.start.line,
      scope: 'global',
    });
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
  const { lowerBinDecl, lowerRawDataDecl, lowerAsmRawDataDirective } =
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
      if (isAzmNativePath(ctx.program.entryFile) && isAsmOrgDirective(item)) {
        ctx.activeSectionRef.current = sectionForAsmOrg(module.items, index);
      }
      lowerItem(ctx, lowerBinDecl, lowerRawDataDecl, lowerAsmRawDataDirective, item);
    }
  }

  return {
    codeOffset: ctx.codeOffsetRef.current,
    dataOffset: ctx.dataOffsetRef.current,
    varOffset: ctx.varOffsetRef.current,
    pending: ctx.pending,
    symbols: ctx.symbols,
    absoluteSymbols: ctx.absoluteSymbols,
    deferredExterns: ctx.deferredExterns,
    codeBytes: ctx.codeBytes,
    dataBytes: ctx.dataBytes,
    hexBytes: ctx.hexBytes,
  };
}
