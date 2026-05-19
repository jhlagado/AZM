import type {
  AlignDirectiveNode,
  BinDeclNode,
  ConstDeclNode,
  DataBlockNode,
  DataDeclNode,
  EnumDeclNode,
  ExternDeclNode,
  HexDeclNode,
  NamedSectionNode,
  RawDataDeclNode,
  VarBlockNode,
} from '../frontend/ast.js';
import type { NamedSectionContributionSink } from './sectionContributions.js';
import type { LoweringContext, LoweringResult } from './programLowering.js';
import { sizeOfTypeExpr } from '../semantics/layout.js';
import type { SectionKind } from './loweringTypes.js';
import { lowerDataBlock } from './programLoweringData.js';
import { createProgramLoweringDeclarationHelpers } from './programLoweringDeclarations.js';
import { isAzmNativePath } from '../frontend/sourceMode.js';
import { lowerClassicInstruction } from './classicInstructionLowering.js';
import { tryLowerClassicDirective } from './classicDirectiveLowering.js';
import { lowerNativeAsmInstruction } from './nativeAsmLowering.js';
import {
  isClassicBinFrom,
  isClassicBinTo,
  isClassicEnd,
  isClassicOrg,
  isClassicRawData,
} from './classicTraversalHelpers.js';

function sinkOffsetRef(sink: NamedSectionContributionSink) {
  return {
    get current() {
      return sink.offset;
    },
    set current(value: number) {
      sink.offset = value;
    },
  };
}

function alignNamedSection(
  ctx: LoweringContext,
  sink: NamedSectionContributionSink,
  value: number,
): void {
  sink.offset = ctx.alignTo(sink.offset, value);
}

function lowerVarBlock(ctx: LoweringContext, varBlock: VarBlockNode): void {
  for (const decl of varBlock.decls) {
    if (decl.form !== 'typed') continue;
    const size = sizeOfTypeExpr(decl.typeExpr, ctx.env, ctx.diagnostics);
    if (size === undefined) continue;
    if (ctx.env.consts.has(decl.name)) {
      ctx.diag(ctx.diagnostics, decl.span.file, `Var name "${decl.name}" collides with a const.`);
      ctx.varOffsetRef.current += size;
      continue;
    }
    if (ctx.env.enums.has(decl.name)) {
      ctx.diag(
        ctx.diagnostics,
        decl.span.file,
        `Var name "${decl.name}" collides with an enum member.`,
      );
      ctx.varOffsetRef.current += size;
      continue;
    }
    if (ctx.env.types.has(decl.name)) {
      ctx.diag(
        ctx.diagnostics,
        decl.span.file,
        `Var name "${decl.name}" collides with a type name.`,
      );
      ctx.varOffsetRef.current += size;
      continue;
    }
    if (ctx.taken.has(decl.name)) {
      ctx.diag(
        ctx.diagnostics,
        decl.span.file,
        `Duplicate symbol name "${decl.name}" for var declaration.`,
      );
      ctx.varOffsetRef.current += size;
      continue;
    }
    ctx.taken.add(decl.name);
    ctx.pending.push({
      kind: 'var',
      name: decl.name,
      section: 'var',
      offset: ctx.varOffsetRef.current,
      file: decl.span.file,
      line: decl.span.start.line,
      scope: 'global',
      size,
    });
    ctx.varOffsetRef.current += size;
  }
}

function sectionForClassicOrg(items: readonly unknown[], index: number): SectionKind {
  for (let lookahead = index + 1; lookahead < items.length; lookahead++) {
    const next = items[lookahead] as { kind?: string } | undefined;
    if (!next?.kind) continue;
    if (isClassicRawData(next as { kind: string })) return 'data';
    if (next.kind === 'AsmLabel' || next.kind === 'ClassicEqu' || next.kind === 'ConstDecl') continue;
    return 'code';
  }
  return 'code';
}

function lowerExternDecl(ctx: LoweringContext, externDecl: ExternDeclNode): void {
  const baseLower = externDecl.base?.toLowerCase();
  if (baseLower !== undefined && !ctx.declaredBinNames.has(baseLower)) {
    ctx.diag(
      ctx.diagnostics,
      externDecl.span.file,
      `extern base "${externDecl.base}" does not reference a declared bin symbol.`,
    );
    return;
  }
  for (const fn of externDecl.funcs) {
    if (ctx.taken.has(fn.name)) {
      ctx.diag(ctx.diagnostics, fn.span.file, `Duplicate symbol name "${fn.name}".`);
      continue;
    }
    ctx.taken.add(fn.name);
    if (baseLower !== undefined) {
      const offset = ctx.evalImmExpr(fn.at, ctx.env, ctx.diagnostics);
      if (offset === undefined) {
        ctx.diag(
          ctx.diagnostics,
          fn.span.file,
          `Failed to evaluate extern func offset for "${fn.name}".`,
        );
        continue;
      }
      if (offset < 0 || offset > 0xffff) {
        ctx.diag(
          ctx.diagnostics,
          fn.span.file,
          `extern func "${fn.name}" offset out of range (0..65535).`,
        );
        continue;
      }
      ctx.deferredExterns.push({
        name: fn.name,
        baseLower,
        addend: offset,
        file: fn.span.file,
        line: fn.span.start.line,
      });
      continue;
    }
    const addr = ctx.evalImmExpr(fn.at, ctx.env, ctx.diagnostics);
    if (addr === undefined) {
      ctx.diag(
        ctx.diagnostics,
        fn.span.file,
        `Failed to evaluate extern func address for "${fn.name}".`,
      );
      continue;
    }
    if (addr < 0 || addr > 0xffff) {
      ctx.diag(
        ctx.diagnostics,
        fn.span.file,
        `extern func "${fn.name}" address out of range (0..65535).`,
      );
      continue;
    }
    ctx.symbols.push({
      kind: 'label',
      name: fn.name,
      address: addr,
      file: fn.span.file,
      line: fn.span.start.line,
      scope: 'global',
    });
  }
}

function lowerItem(
  ctx: LoweringContext,
  lowerBinDecl: ReturnType<typeof createProgramLoweringDeclarationHelpers>['lowerBinDecl'],
  lowerRawDataDecl: ReturnType<typeof createProgramLoweringDeclarationHelpers>['lowerRawDataDecl'],
  lowerClassicRawDataDecl: ReturnType<
    typeof createProgramLoweringDeclarationHelpers
  >['lowerClassicRawDataDecl'],
  item: any,
  namedSection?: { node: NamedSectionNode; sink: NamedSectionContributionSink },
): void {
  if (tryLowerClassicDirective(ctx, item)) return;
  if (item.kind === 'AsmInstruction') {
    if (isAzmNativePath(ctx.program.entryFile)) {
      lowerNativeAsmInstruction(ctx, item);
    } else {
      lowerClassicInstruction(ctx, item);
    }
    return;
  }
  if (isClassicRawData(item)) {
    lowerClassicRawDataDecl(item as Parameters<typeof lowerClassicRawDataDecl>[0], namedSection);
    return;
  }

  if (item.kind === 'NamedSection') {
    const sectionNode = item as NamedSectionNode;
    const sink = ctx.namedSectionSinksByNode.get(sectionNode);
    if (!sink) return;
    const prevSection = ctx.activeSectionRef.current;
    ctx.activeSectionRef.current = sectionNode.section;
    ctx.withNamedSectionSink(sink, () => {
      for (const sectionItem of sectionNode.items) {
        lowerItem(ctx, lowerBinDecl, lowerRawDataDecl, lowerClassicRawDataDecl, sectionItem, {
          node: sectionNode,
          sink,
        });
      }
    });
    ctx.activeSectionRef.current = prevSection;
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
    const current = namedSection
      ? namedSection.sink.offset
      : ctx.activeSectionRef.current === 'code'
        ? ctx.codeOffsetRef.current
        : ctx.activeSectionRef.current === 'data'
          ? ctx.dataOffsetRef.current
          : ctx.varOffsetRef.current;
    const aligned = ctx.alignTo(current, value);
    const pad = aligned - current;
    if (pad > 0) {
      ctx.recordLoweredAsmItem({ kind: 'ds', size: { kind: 'literal', value: pad } }, align.span);
    }
    if (namedSection) alignNamedSection(ctx, namedSection.sink, value);
    else ctx.advanceAlign(value);
    return;
  }

  if (item.kind === 'ExternDecl') {
    lowerExternDecl(ctx, item as ExternDeclNode);
    return;
  }

  if (item.kind === 'BinDecl') {
    lowerBinDecl(item as BinDeclNode, namedSection);
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

  if (item.kind === 'FuncDecl') {
    if (namedSection && namedSection.node.section !== 'code') {
      ctx.diag(
        ctx.diagnostics,
        item.span.file,
        `Function "${item.name}" is not allowed inside data section "${namedSection.node.name}".`,
      );
      return;
    }
    ctx.lowerFunctionDecl({
      ...ctx,
      item,
      ...(namedSection ? { pending: namedSection.sink.pendingSymbols } : {}),
    });
    return;
  }

  if (item.kind === 'DataBlock') {
    if (namedSection && namedSection.node.section !== 'data') {
      ctx.diag(
        ctx.diagnostics,
        item.span.file,
        `Data declarations are not allowed inside code section "${namedSection.node.name}".`,
      );
      return;
    }
    if (namedSection) {
      lowerDataBlock(ctx, item as DataBlockNode, {
        section: namedSection.node.section,
        bytes: namedSection.sink.bytes,
        offsetRef: sinkOffsetRef(namedSection.sink),
        pending: namedSection.sink.pendingSymbols,
        startupInitActions: namedSection.sink.startupInitActions,
      });
    } else {
      lowerDataBlock(ctx, item as DataBlockNode);
    }
    return;
  }

  if (item.kind === 'DataDecl') {
    if (!namedSection || namedSection.node.section !== 'data') {
      const sectionName = namedSection?.node.name ?? 'module scope';
      ctx.diag(
        ctx.diagnostics,
        item.span.file,
        `Data declarations are only allowed inside data sections${namedSection ? ` like "${sectionName}"` : ''}.`,
      );
      return;
    }
    lowerDataBlock(
      ctx,
      {
        kind: 'DataBlock',
        span: item.span,
        decls: [item as DataDeclNode],
      },
      {
        section: namedSection.node.section,
        bytes: namedSection.sink.bytes,
        offsetRef: sinkOffsetRef(namedSection.sink),
        pending: namedSection.sink.pendingSymbols,
        startupInitActions: namedSection.sink.startupInitActions,
      },
    );
    return;
  }

  if (item.kind === 'RawDataDecl') {
    lowerRawDataDecl(item as RawDataDeclNode, namedSection);
    return;
  }

  if (item.kind === 'VarBlock' && item.scope === 'module') {
    if (namedSection) {
      ctx.diag(
        ctx.diagnostics,
        item.span.file,
        `Module-scope var blocks are not allowed inside named section "${namedSection.node.name}".`,
      );
      return;
    }
    lowerVarBlock(ctx, item as VarBlockNode);
  }
}

export function lowerProgramDeclarations(ctx: LoweringContext): LoweringResult {
  const { lowerBinDecl, lowerRawDataDecl, lowerClassicRawDataDecl } =
    createProgramLoweringDeclarationHelpers(ctx);

  for (const module of ctx.program.files) {
    ctx.activeSectionRef.current = 'code';
    let classicEnded = false;
    for (let index = 0; index < module.items.length; index++) {
      const item = module.items[index]!;
      if (isClassicEnd(item)) {
        classicEnded = true;
        continue;
      }
      if (classicEnded && !isClassicBinFrom(item) && !isClassicBinTo(item)) continue;
      if (isAzmNativePath(ctx.program.entryFile) && isClassicOrg(item)) {
        ctx.activeSectionRef.current = sectionForClassicOrg(module.items, index);
      }
      lowerItem(ctx, lowerBinDecl, lowerRawDataDecl, lowerClassicRawDataDecl, item);
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
