import type {
  AddressRange,
  EmittedSourceSegment,
} from '../formats/types.js';
import type { SectionKind } from './loweringTypes.js';
import type { ProgramEmissionFinalizeContext } from './programLowering.js';
import { createFixupBaseResolver } from './fixupBaseResolution.js';

export function computeSectionBases(
  ctx: Pick<ProgramEmissionFinalizeContext, 'baseExprs' | 'evalImmExpr' | 'env' | 'diagnostics' | 'diag' | 'primaryFile' | 'alignTo' | 'codeOffset' | 'dataOffset'>,
  defaultCodeBase?: number,
  options?: { quiet?: boolean },
): {
  codeBase: number;
  dataBase: number;
  codeOk: boolean;
  dataOk: boolean;
} {
  const diagnostics = options?.quiet ? [] : ctx.diagnostics;
  const diagFn = options?.quiet ? () => {} : ctx.diag;
  const evalBase = (kind: SectionKind): number | undefined => {
    const at = ctx.baseExprs[kind];
    if (!at) return undefined;
    const value = ctx.evalImmExpr(at, ctx.env, diagnostics);
    if (value === undefined) {
      diagFn(diagnostics, at.span.file, `Failed to evaluate section "${kind}" base address.`);
      return undefined;
    }
    if (value < 0 || value > 0xffff) {
      diagFn(diagnostics, at.span.file, `Section "${kind}" base address out of range (0..65535).`);
      return undefined;
    }
    return value;
  };

  const explicitCodeBase = evalBase('code');
  const explicitDataBase = evalBase('data');
  const codeOk = explicitCodeBase !== undefined || !ctx.baseExprs.code;
  const codeBase = explicitCodeBase ?? (defaultCodeBase ?? 0);
  const dataBase =
    explicitDataBase ??
    (codeOk
      ? ctx.alignTo(codeBase + ctx.codeOffset, 2)
      : (diagFn(
          diagnostics,
          ctx.primaryFile,
          `Cannot compute default data base address because code base address is invalid.`,
        ),
        0));
  const dataOk = explicitDataBase !== undefined || (ctx.baseExprs.data === undefined && codeOk);

  return { codeBase, dataBase, codeOk, dataOk };
}

export function finalizeProgramEmission(ctx: ProgramEmissionFinalizeContext): {
  codeBase: number;
  dataBase: number;
  codeOk: boolean;
  dataOk: boolean;
  writtenRange: AddressRange;
  sourceSegments: EmittedSourceSegment[];
} {
  const { codeBase, dataBase, codeOk, dataOk } = computeSectionBases(
    ctx,
    ctx.defaultCodeBase,
  );

  const addrByNameLower = new Map<string, number>();
  for (const ps of ctx.pending) {
    const base = ps.section === 'code' ? codeBase : dataBase;
    const ok = ps.section === 'code' ? codeOk : dataOk;
    if (!ok) continue;
    addrByNameLower.set(ps.name.toLowerCase(), base + ps.offset);
  }
  for (const [name, value] of ctx.env.consts) {
    addrByNameLower.set(name.toLowerCase(), value);
  }
  for (const sym of ctx.symbols) {
    if (sym.kind === 'constant') continue;
    addrByNameLower.set(sym.name.toLowerCase(), sym.address);
  }
  for (const sym of ctx.absoluteSymbols) {
    if (sym.kind === 'constant' || sym.address === undefined) continue;
    addrByNameLower.set(sym.name.toLowerCase(), sym.address);
  }
  const resolveFixupBase = createFixupBaseResolver({ env: ctx.env, addrByNameLower });

  for (const fx of ctx.fixups) {
    const base = resolveFixupBase(fx.baseLower);
    const addr = base === undefined ? undefined : base + fx.addend;
    if (addr === undefined) {
      ctx.diag(ctx.diagnostics, fx.file, `Unresolved symbol "${fx.baseLower}" in 16-bit fixup.`);
      continue;
    }
    if (addr < 0 || addr > 0xffff) {
      ctx.diag(
        ctx.diagnostics,
        fx.file,
        `16-bit fixup address out of range for "${fx.baseLower}" with addend ${fx.addend}: ${addr}.`,
      );
      continue;
    }
    ctx.codeBytes.set(fx.offset, addr & 0xff);
    ctx.codeBytes.set(fx.offset + 1, (addr >> 8) & 0xff);
  }

  for (const fx of ctx.rel8Fixups) {
    const base = resolveFixupBase(fx.baseLower);
    const target = base === undefined ? undefined : base + fx.addend;
    if (target === undefined) {
      ctx.diag(
        ctx.diagnostics,
        fx.file,
        `Unresolved symbol "${fx.baseLower}" in rel8 ${fx.mnemonic} fixup.`,
      );
      continue;
    }
    const origin = codeBase + fx.origin;
    const disp = target - origin;
    if (disp < -128 || disp > 127) {
      ctx.diag(
        ctx.diagnostics,
        fx.file,
        `${fx.mnemonic} target out of range for rel8 branch (${disp}, expected -128..127).`,
      );
      continue;
    }
    ctx.codeBytes.set(fx.offset, disp & 0xff);
  }

  if (codeOk) {
    ctx.writeSection(codeBase, ctx.codeBytes, ctx.bytes, (message) =>
      ctx.diag(ctx.diagnostics, ctx.primaryFile, message),
    );
  }
  if (dataOk) {
    ctx.writeSection(dataBase, ctx.dataBytes, ctx.bytes, (message) =>
      ctx.diag(ctx.diagnostics, ctx.primaryFile, message),
    );
  }

  for (const ps of ctx.pending) {
    const base = ps.section === 'code' ? codeBase : dataBase;
    const ok = ps.section === 'code' ? codeOk : dataOk;
    if (!ok) continue;
    ctx.symbols.push({
      kind: ps.kind,
      name: ps.name,
      address: base + ps.offset,
      ...(ps.file !== undefined ? { file: ps.file } : {}),
      ...(ps.line !== undefined ? { line: ps.line } : {}),
      ...(ps.scope !== undefined ? { scope: ps.scope } : {}),
      ...(ps.size !== undefined ? { size: ps.size } : {}),
    });
  }
  ctx.symbols.push(...ctx.absoluteSymbols);

  return {
    codeBase,
    dataBase,
    codeOk,
    dataOk,
    writtenRange: ctx.computeWrittenRange(ctx.bytes),
    sourceSegments: codeOk ? ctx.rebaseCodeSourceSegments(codeBase, ctx.codeSourceSegments) : [],
  };
}
