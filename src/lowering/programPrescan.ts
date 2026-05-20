import type {
  BinDeclNode,
  ModuleItemNode,
  OpDeclNode,
  RawDataDeclNode,
  VarBlockNode,
} from '../frontend/ast.js';
import type { PrescanResult } from './prescanTypes.js';
import type { PrescanContext } from './programLowering.js';

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

function addFileOp(ctx: PrescanContext, file: string, key: string, op: OpDeclNode): void {
  const fileOps = getOrCreateFileOps(ctx, file);
  const existing = fileOps.get(key);
  if (existing) existing.push(op);
  else fileOps.set(key, [op]);
}

function preScanItem(
  ctx: PrescanContext,
  item: ModuleItemNode,
  sourceUnitFile?: string,
): void {
  const localSourceUnitFile = sourceUnitFile ?? item.span?.file ?? ctx.program.entryFile;

  if (item.kind === 'OpDecl') {
    const op = item as OpDeclNode;
    const key = op.name.toLowerCase();
    addFileOp(ctx, localSourceUnitFile, key, op);
    if (op.span.file !== localSourceUnitFile) addFileOp(ctx, op.span.file, key, op);
    if (op.exported) {
      const visible = ctx.visibleOpsByName.get(key);
      if (visible) visible.push(op);
      else ctx.visibleOpsByName.set(key, [op]);
    }
    return;
  }

  if (item.kind === 'VarBlock' && item.scope === 'module') {
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

  if (item.kind === 'RawDataDecl') {
    const decl = item as RawDataDeclNode;
    if (decl.name.length > 0) {
      ctx.rawAddressSymbols.add(decl.name.toLowerCase());
    }
  }
}

export function preScanProgramDeclarations(ctx: PrescanContext): PrescanResult {
  for (const module of ctx.program.files) {
    for (const item of module.items) preScanItem(ctx, item, module.path);
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
