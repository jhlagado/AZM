import type {
  BinDeclNode,
  DataBlockNode,
  DataDeclNode,
  ExternDeclNode,
  FuncDeclNode,
  ModuleItemNode,
  NamedSectionNode,
  OpDeclNode,
  RawDataDeclNode,
  SectionItemNode,
  VarBlockNode,
} from '../frontend/ast.js';
import type { Callable } from './loweringTypes.js';
import type { PrescanResult } from './prescanTypes.js';
import type { PrescanContext } from './programLowering.js';

function getOrCreateFileCallables(
  ctx: PrescanContext,
  file: string,
): Map<string, Callable> {
  const existing = ctx.localCallablesByFile.get(file);
  if (existing) return existing;
  const created = new Map<string, Callable>();
  ctx.localCallablesByFile.set(file, created);
  return created;
}

function getOrCreateFileOps(
  ctx: PrescanContext,
  file: string,
): Map<string, OpDeclNode[]> {
  const existing = ctx.localOpsByFile.get(file);
  if (existing) return existing;
  const created = new Map<string, OpDeclNode[]>();
  ctx.localOpsByFile.set(file, created);
  return created;
}

function preScanItem(
  ctx: PrescanContext,
  item: ModuleItemNode | SectionItemNode,
  namedSection?: NamedSectionNode,
): void {
  if (item.kind === 'NamedSection') {
    for (const sectionItem of item.items) preScanItem(ctx, sectionItem, item);
    return;
  }

  if (item.kind === 'FuncDecl') {
    const func = item as FuncDeclNode;
    const fileCallables = getOrCreateFileCallables(ctx, func.span.file);
    fileCallables.set(func.name.toLowerCase(), { kind: 'func', node: func });
    if (func.exported) {
      const moduleId = (ctx.env.moduleIds?.get(func.span.file) ?? func.span.file).toLowerCase();
      ctx.visibleCallables.set(`${moduleId}.${func.name.toLowerCase()}`, { kind: 'func', node: func });
    }
    return;
  }

  if (item.kind === 'OpDecl') {
    const op = item as OpDeclNode;
    const key = op.name.toLowerCase();
    const fileOps = getOrCreateFileOps(ctx, op.span.file);
    const existing = fileOps.get(key);
    if (existing) existing.push(op);
    else fileOps.set(key, [op]);
    if (op.exported) {
      const moduleId = (ctx.env.moduleIds?.get(op.span.file) ?? op.span.file).toLowerCase();
      const qualified = `${moduleId}.${key}`;
      const visible = ctx.visibleOpsByName.get(qualified);
      if (visible) visible.push(op);
      else ctx.visibleOpsByName.set(qualified, [op]);
    }
    return;
  }

  if (item.kind === 'ExternDecl') {
    const externDecl = item as ExternDeclNode;
    const fileCallables = getOrCreateFileCallables(ctx, externDecl.span.file);
    for (const func of externDecl.funcs) {
      fileCallables.set(func.name.toLowerCase(), {
        kind: 'extern',
        node: func,
        targetLower: func.name.toLowerCase(),
      });
    }
    return;
  }

  if (item.kind === 'VarBlock' && item.scope === 'module') {
    if (namedSection) return;
    const varBlock = item as VarBlockNode;
    for (const decl of varBlock.decls) {
      const lower = decl.name.toLowerCase();
      if (decl.form === 'typed') {
        ctx.storageTypes.set(lower, decl.typeExpr);
        continue;
      }
      if (decl.initializer.kind === 'VarInitAlias') {
        ctx.moduleAliasTargets.set(lower, decl.initializer.expr);
        ctx.moduleAliasDecls.set(lower, decl);
      }
    }
    return;
  }

  if (item.kind === 'BinDecl') {
    const binDecl = item as BinDeclNode;
    if (namedSection && binDecl.section !== namedSection.section) return;
    ctx.declaredBinNames.add(binDecl.name.toLowerCase());
    ctx.rawAddressSymbols.add(binDecl.name.toLowerCase());
    ctx.storageTypes.set(binDecl.name.toLowerCase(), {
      kind: 'TypeName',
      span: binDecl.span,
      name: 'addr',
    });
    return;
  }

  if (item.kind === 'HexDecl') {
    ctx.rawAddressSymbols.add(item.name.toLowerCase());
    ctx.storageTypes.set(item.name.toLowerCase(), { kind: 'TypeName', span: item.span, name: 'addr' });
    return;
  }

  if (item.kind === 'DataBlock') {
    const dataBlock = item as DataBlockNode;
    for (const decl of dataBlock.decls) {
      const lower = decl.name.toLowerCase();
      ctx.storageTypes.set(lower, decl.typeExpr);
      const scalar = ctx.resolveScalarKind(decl.typeExpr);
      if (!scalar) ctx.rawAddressSymbols.add(lower);
    }
    return;
  }

  if (item.kind === 'DataDecl') {
    if (namedSection && namedSection.section !== 'data') return;
    const decl = item as DataDeclNode;
    const lower = decl.name.toLowerCase();
    ctx.storageTypes.set(lower, decl.typeExpr);
    const scalar = ctx.resolveScalarKind(decl.typeExpr);
    if (!scalar) ctx.rawAddressSymbols.add(lower);
    return;
  }

  if (item.kind === 'RawDataDecl') {
    if (namedSection && namedSection.section !== 'data') return;
    const decl = item as RawDataDeclNode;
    if (decl.name.length > 0) {
      ctx.rawAddressSymbols.add(decl.name.toLowerCase());
    }
  }
}

export function preScanProgramDeclarations(ctx: PrescanContext): PrescanResult {
  for (const module of ctx.program.files) {
    for (const item of module.items) preScanItem(ctx, item);
  }

  return {
    localCallablesByFile: ctx.localCallablesByFile,
    visibleCallables: ctx.visibleCallables,
    localOpsByFile: ctx.localOpsByFile,
    visibleOpsByName: ctx.visibleOpsByName,
    declaredOpNames: ctx.declaredOpNames,
    declaredBinNames: ctx.declaredBinNames,
    storageTypes: ctx.storageTypes,
    moduleAliasTargets: ctx.moduleAliasTargets,
    moduleAliasDecls: ctx.moduleAliasDecls,
    rawAddressSymbols: ctx.rawAddressSymbols,
  };
}
