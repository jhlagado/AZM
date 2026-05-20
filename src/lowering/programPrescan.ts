import type { ModuleItemNode, OpDeclNode, RawDataDeclNode } from '../frontend/ast.js';
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
    localOpsByFile: ctx.localOpsByFile,
    declaredOpNames: ctx.declaredOpNames,
    storageTypes: ctx.storageTypes,
    rawAddressSymbols: ctx.rawAddressSymbols,
  };
}
