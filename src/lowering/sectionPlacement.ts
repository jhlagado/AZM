import type { Diagnostic } from '../diagnosticTypes.js';
import type { SymbolEntry } from '../formats/types.js';
import type { CompileEnv } from '../semantics/env.js';
import type { ImmExprNode, SourceSpan } from '../frontend/ast.js';
import { diagAt } from './loweringDiagnostics.js';
import type { NamedSectionContributionSink } from './sectionContributions.js';
import type { NonBankedSectionKeyId } from '../sectionKeys.js';
import { formatNonBankedSectionKey } from '../sectionKeys.js';
import { createFixupBaseResolver } from './fixupBaseResolution.js';

export type PlacedNamedSectionContribution = {
  /** Sink carrying bytes/fixups for one contribution. */
  sink: NamedSectionContributionSink;
  /** Assigned base address for this contribution. */
  baseAddress: number;
};

export type PlacedNamedSectionRegion = {
  /** Stable section key id. */
  keyId: NonBankedSectionKeyId;
  /** Logical section kind. */
  section: 'code' | 'data';
  /** Section display name. */
  name: string;
  /** Region base address. */
  baseAddress: number;
  /** Total span in bytes. */
  totalSize: number;
  /** Inclusive end address when known; `undefined` while sizing. */
  endAddress: number | undefined;
  /** Ordered contributions in this region. */
  contributions: PlacedNamedSectionContribution[];
};

type SectionPlacementContext = {
  /** Diagnostic sink. */
  diagnostics: Diagnostic[];
  /** Compile environment for imm eval. */
  env: CompileEnv;
  /** Evaluates imm with env; `undefined` if not const. */
  evalImmExpr: (expr: ImmExprNode, env: CompileEnv, diagnostics: Diagnostic[]) => number | undefined;
};

function pointSpan(file: string, line: number, column: number, offset: number): SourceSpan {
  return {
    file,
    start: { line, column, offset },
    end: { line, column, offset },
  };
}

function toHexWord(value: number): string {
  return `$${(value & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
}

function startOf(sink: NamedSectionContributionSink): {
  file: string;
  line: number;
  column: number;
  offset: number;
} {
  return {
    file: sink.anchor.node.span.file,
    line: sink.anchor.node.span.start.line,
    column: sink.anchor.node.span.start.column,
    offset: sink.anchor.node.span.start.offset,
  };
}

function evaluateAnchorBase(ctx: SectionPlacementContext, sink: NamedSectionContributionSink): number | undefined {
  const anchor = sink.anchor.node.anchor;
  if (!anchor) return undefined;
  const at = ctx.evalImmExpr(anchor.at, ctx.env, ctx.diagnostics);
  if (at === undefined) {
    const where = startOf(sink);
    diagAt(
      ctx.diagnostics,
      pointSpan(where.file, where.line, where.column, where.offset),
      `Failed to evaluate anchor base for section "${formatNonBankedSectionKey(sink.anchor.key)}".`,
    );
    return undefined;
  }
  if (at < 0 || at > 0xffff) {
    const where = startOf(sink);
    diagAt(
      ctx.diagnostics,
      pointSpan(where.file, where.line, where.column, where.offset),
      `Anchor base out of range for section "${formatNonBankedSectionKey(sink.anchor.key)}": ${at}.`,
    );
    return undefined;
  }
  return at;
}

function evaluateCapacity(
  ctx: SectionPlacementContext,
  sink: NamedSectionContributionSink,
  baseAddress: number,
): number | undefined {
  const anchor = sink.anchor.node.anchor;
  if (!anchor) return undefined;
  switch (anchor.bound.kind) {
    case 'none':
      return undefined;
    case 'size': {
      const size = ctx.evalImmExpr(anchor.bound.size, ctx.env, ctx.diagnostics);
      if (size === undefined) {
        const where = startOf(sink);
        diagAt(
          ctx.diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Failed to evaluate anchor size for section "${formatNonBankedSectionKey(sink.anchor.key)}".`,
        );
        return undefined;
      }
      if (size < 0) {
        const where = startOf(sink);
        diagAt(
          ctx.diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Anchor size must be non-negative for section "${formatNonBankedSectionKey(sink.anchor.key)}".`,
        );
        return undefined;
      }
      return size;
    }
    case 'end': {
      const end = ctx.evalImmExpr(anchor.bound.end, ctx.env, ctx.diagnostics);
      if (end === undefined) {
        const where = startOf(sink);
        diagAt(
          ctx.diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Failed to evaluate anchor end for section "${formatNonBankedSectionKey(sink.anchor.key)}".`,
        );
        return undefined;
      }
      if (end < baseAddress) {
        const where = startOf(sink);
        diagAt(
          ctx.diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Anchor end must be greater than or equal to the base for section "${formatNonBankedSectionKey(
            sink.anchor.key,
          )}".`,
        );
        return undefined;
      }
      if (end > 0xffff) {
        const where = startOf(sink);
        diagAt(
          ctx.diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Anchor end out of range for section "${formatNonBankedSectionKey(sink.anchor.key)}": ${end}.`,
        );
        return undefined;
      }
      return end - baseAddress + 1;
    }
  }
}

export function placeNonBankedSectionContributions(
  sinks: NamedSectionContributionSink[],
  ctx: SectionPlacementContext,
): { placedRegions: PlacedNamedSectionRegion[]; placedContributions: PlacedNamedSectionContribution[] } {
  const placedRegions: PlacedNamedSectionRegion[] = [];
  const placedContributions: PlacedNamedSectionContribution[] = [];
  const regionsByKey = new Map<NonBankedSectionKeyId, PlacedNamedSectionRegion>();

  for (const sink of sinks) {
    let region = regionsByKey.get(sink.anchor.keyId);
    if (!region) {
      const baseAddress = evaluateAnchorBase(ctx, sink);
      if (baseAddress === undefined) continue;
      region = {
        keyId: sink.anchor.keyId,
        section: sink.anchor.key.section,
        name: sink.anchor.key.name,
        baseAddress,
        totalSize: 0,
        endAddress: undefined,
        contributions: [],
      };
      regionsByKey.set(sink.anchor.keyId, region);
      placedRegions.push(region);
    }

    const placed: PlacedNamedSectionContribution = {
      sink,
      baseAddress: region.baseAddress + region.totalSize,
    };
    region.contributions.push(placed);
    placedContributions.push(placed);
    region.totalSize += sink.offset;
  }

  for (const region of placedRegions) {
    if (region.totalSize > 0) {
      region.endAddress = region.baseAddress + region.totalSize - 1;
      if (region.endAddress > 0xffff) {
        const where = startOf(region.contributions[0]!.sink);
        diagAt(
          ctx.diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Section "${region.section} ${region.name}" exceeds the 16-bit address space.`,
        );
      }
    }

    const capacity = evaluateCapacity(ctx, region.contributions[0]!.sink, region.baseAddress);
    if (capacity !== undefined && region.totalSize > capacity) {
      const where = startOf(region.contributions[0]!.sink);
      diagAt(
        ctx.diagnostics,
        pointSpan(where.file, where.line, where.column, where.offset),
        `Section "${region.section} ${region.name}" exceeds its anchored capacity (${region.totalSize} > ${capacity}).`,
      );
    }
  }

  for (let i = 0; i < placedRegions.length; i++) {
    const left = placedRegions[i]!;
    if (left.endAddress === undefined) continue;
    for (let j = i + 1; j < placedRegions.length; j++) {
      const right = placedRegions[j]!;
      if (right.endAddress === undefined) continue;
      if (left.endAddress < right.baseAddress || right.endAddress < left.baseAddress) continue;
      const where = startOf(left.contributions[0]!.sink);
      diagAt(
        ctx.diagnostics,
        pointSpan(where.file, where.line, where.column, where.offset),
        `Anchored sections overlap: "${left.section} ${left.name}" (${toHexWord(left.baseAddress)}..${toHexWord(
          left.endAddress,
        )}) and "${right.section} ${right.name}" (${toHexWord(right.baseAddress)}..${toHexWord(
          right.endAddress,
        )}).`,
      );
    }
  }

  return { placedRegions, placedContributions };
}

export function collectPlacedNamedSectionSymbols(
  placedContributions: PlacedNamedSectionContribution[],
  diagnostics: Diagnostic[],
): SymbolEntry[] {
  const symbols: SymbolEntry[] = [];

  for (const placed of placedContributions) {
    for (const pending of placed.sink.pendingSymbols) {
      const address = placed.baseAddress + pending.offset;
      if (address < 0 || address > 0xffff) {
        const where = startOf(placed.sink);
        diagAt(
          diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Named section symbol "${pending.name}" resolves out of range in section "${formatNonBankedSectionKey(
            placed.sink.anchor.key,
          )}".`,
        );
        continue;
      }
      symbols.push({
        kind: pending.kind,
        name: pending.name,
        address,
        ...(pending.file !== undefined ? { file: pending.file } : {}),
        ...(pending.line !== undefined ? { line: pending.line } : {}),
        ...(pending.scope !== undefined ? { scope: pending.scope } : {}),
        ...(pending.size !== undefined ? { size: pending.size } : {}),
      });
    }
  }

  return symbols;
}

export function resolvePlacedNamedSectionFixups(
  placedContributions: PlacedNamedSectionContribution[],
  diagnostics: Diagnostic[],
  bytes: Map<number, number>,
  symbols: SymbolEntry[],
  env: CompileEnv,
): void {
  const addrByNameLower = new Map<string, number>();
  for (const [name, value] of env.consts) {
    addrByNameLower.set(name.toLowerCase(), value);
  }
  for (const sym of symbols) {
    if (sym.kind === 'constant' || sym.address === undefined) continue;
    addrByNameLower.set(sym.name.toLowerCase(), sym.address);
  }
  const resolveFixupBase = createFixupBaseResolver({ env, addrByNameLower });

  for (const placed of placedContributions) {
    const sink = placed.sink;

    for (const fx of sink.fixups) {
      const base = resolveFixupBase(fx.baseLower);
      const addr = base === undefined ? undefined : base + fx.addend;
      if (addr === undefined) {
        const where = startOf(sink);
        diagAt(
          diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Unresolved symbol "${fx.baseLower}" in named-section 16-bit fixup.`,
        );
        continue;
      }
      if (addr < 0 || addr > 0xffff) {
        const where = startOf(sink);
        diagAt(
          diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Named-section 16-bit fixup address out of range for "${fx.baseLower}" with addend ${fx.addend}: ${addr}.`,
        );
        continue;
      }
      const patch = placed.baseAddress + fx.offset;
      bytes.set(patch, addr & 0xff);
      bytes.set(patch + 1, (addr >> 8) & 0xff);
    }

    for (const fx of sink.rel8Fixups) {
      const base = resolveFixupBase(fx.baseLower);
      const target = base === undefined ? undefined : base + fx.addend;
      if (target === undefined) {
        const where = startOf(sink);
        diagAt(
          diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Unresolved symbol "${fx.baseLower}" in named-section rel8 ${fx.mnemonic} fixup.`,
        );
        continue;
      }
      const origin = placed.baseAddress + fx.origin;
      const disp = target - origin;
      if (disp < -128 || disp > 127) {
        const where = startOf(sink);
        diagAt(
          diagnostics,
          pointSpan(where.file, where.line, where.column, where.offset),
          `Named-section ${fx.mnemonic} target out of range for rel8 branch (${disp}, expected -128..127).`,
        );
        continue;
      }
      bytes.set(placed.baseAddress + fx.offset, disp & 0xff);
    }
  }
}
