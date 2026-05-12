import type { Diagnostic } from '../diagnosticTypes.js';
import type {
  EmittedByteMap,
  EmittedSourceSegment,
  SymbolEntry,
} from '../formats/types.js';
import type { SourceSpan } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import {
  finalizeProgramEmission,
  type ProgramEmissionFinalizeContext,
} from './programLowering.js';
import { computeSectionBases } from './programLoweringFinalize.js';
import type { NamedSectionContributionSink } from './sectionContributions.js';
import {
  collectPlacedNamedSectionSymbols,
  placeNonBankedSectionContributions,
  resolvePlacedNamedSectionFixups,
} from './sectionPlacement.js';
import {
  collectNamedSectionOrigins,
  placeLoweredAsmStream,
} from './loweredAsmPlacement.js';
import {
  emitLoweredAsmBlockBytes,
  emitLoweredAsmProgramBytes,
  syncLoweredAsmInstructionBytesFromFinalBytes,
} from './loweredAsmByteEmission.js';
import {
  buildStartupInitRegion,
  buildStartupInitRoutine,
  STARTUP_ENTRY_LABEL,
} from './startupInit.js';
import type { LoweredAsmProgram, LoweredAsmStream } from './loweredAsmTypes.js';

export type EmitFinalizationContext = {
  /** Sinks carrying named section bytes/fixups from lowering. */
  namedSectionSinks: NamedSectionContributionSink[];
  /** Mutable diagnostics for placement and emission. */
  diagnostics: Diagnostic[];
  /** File-scoped diagnostic helper. */
  diag: (diagnostics: Diagnostic[], file: string, message: string) => void;
  /** Span-scoped diagnostic helper. */
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  /** Entry file path for diagnostics. */
  primaryFile: string;
  /** Optional section base expressions. */
  baseExprs: ProgramEmissionFinalizeContext['baseExprs'];
  /** Imm evaluator for bases and fixups. */
  evalImmExpr: ProgramEmissionFinalizeContext['evalImmExpr'];
  /** Compile environment. */
  env: CompileEnv;
  /** Lowered asm stream before placement. */
  loweredAsmStream: LoweredAsmStream;
  /** Current code section size cursor after lowering. */
  codeOffset: number;
  /** Current data section size cursor. */
  dataOffset: number;
  /** Current var section size cursor. */
  varOffset: number;
  /** Pending forward symbols from lowering. */
  pending: ProgramEmissionFinalizeContext['pending'];
  /** Symbol table (mutated when placing named sections). */
  symbols: SymbolEntry[];
  /** Absolute symbols from lowering. */
  absoluteSymbols: ProgramEmissionFinalizeContext['absoluteSymbols'];
  /** Deferred extern metadata. */
  deferredExterns: ProgramEmissionFinalizeContext['deferredExterns'];
  /** Absolute fixup queue. */
  fixups: ProgramEmissionFinalizeContext['fixups'];
  /** Relative fixup queue. */
  rel8Fixups: ProgramEmissionFinalizeContext['rel8Fixups'];
  /** Code section bytes. */
  codeBytes: ProgramEmissionFinalizeContext['codeBytes'];
  /** Data section bytes. */
  dataBytes: ProgramEmissionFinalizeContext['dataBytes'];
  /** Hex-ingested bytes. */
  hexBytes: ProgramEmissionFinalizeContext['hexBytes'];
  /** Merged working byte map across sections. */
  bytes: Map<number, number>;
  /** Code source segment map for listings. */
  codeSourceSegments: EmittedSourceSegment[];
  /** Align helper (section padding). */
  alignTo: ProgramEmissionFinalizeContext['alignTo'];
  /** Writes a section range into `bytes`. */
  writeSection: ProgramEmissionFinalizeContext['writeSection'];
  /** Computes min/max written for overlap detection. */
  computeWrittenRange: ProgramEmissionFinalizeContext['computeWrittenRange'];
  /** Rebases source segments after moves. */
  rebaseCodeSourceSegments: ProgramEmissionFinalizeContext['rebaseCodeSourceSegments'];
  /** Optional default code base when not inferred. */
  defaultCodeBase?: number;
};

export function finalizeEmitProgram(context: EmitFinalizationContext): {
  map: EmittedByteMap;
  symbols: SymbolEntry[];
  placedLoweredAsmProgram: LoweredAsmProgram;
} {
  const { placedContributions } = placeNonBankedSectionContributions(context.namedSectionSinks, {
    diagnostics: context.diagnostics,
    env: context.env,
    evalImmExpr: context.evalImmExpr,
  });
  const placedSymbols = collectPlacedNamedSectionSymbols(placedContributions, context.diagnostics);
  context.symbols.push(...placedSymbols);

  const { codeBase, dataBase, varBase } = computeSectionBases(
    {
      baseExprs: context.baseExprs,
      evalImmExpr: context.evalImmExpr,
      env: context.env,
      diagnostics: context.diagnostics,
      diag: context.diag,
      primaryFile: context.primaryFile,
      alignTo: context.alignTo,
      codeOffset: context.codeOffset,
      dataOffset: context.dataOffset,
    },
    context.defaultCodeBase,
    { quiet: true },
  );
  const namedSectionOrigins = collectNamedSectionOrigins(placedContributions);
  const placedProgram = placeLoweredAsmStream(context.loweredAsmStream, {
    diagnostics: context.diagnostics,
    diag: context.diag,
    primaryFile: context.primaryFile,
    baseAddresses: { codeBase, dataBase, varBase },
    namedSectionOrigins,
  });
  const emission = emitLoweredAsmProgramBytes(placedProgram, {
    diagnostics: context.diagnostics,
    diag: context.diag,
    primaryFile: context.primaryFile,
    env: context.env,
  });
  for (const placed of placedContributions) {
    const key = `contrib:${placed.sink.contribution.order}`;
    const replacement = emission.namedBytesByKey.get(key) ?? new Map<number, number>();
    const size = emission.blockSizesByKey.get(key);
    if (size !== undefined && size !== placed.sink.offset) {
      context.diag(
        context.diagnostics,
        context.primaryFile,
        `Lowered named section size mismatch for "${placed.sink.anchor.key.section} ${placed.sink.anchor.key.name}" (${size} vs ${placed.sink.offset}).`,
      );
    }
    placed.sink.bytes = replacement;
  }

  const placedSourceSegments: EmittedSourceSegment[] = [];
  for (const placed of placedContributions) {
    const sink = placed.sink;
    for (const [offset, value] of sink.bytes) {
      const addr = placed.baseAddress + offset;
      if (addr < 0 || addr > 0xffff) {
        context.diagAt(
          context.diagnostics,
          sink.contribution.node.span,
          `Named section byte address out of range for section "${sink.anchor.key.section} ${sink.anchor.key.name}": ${addr}.`,
        );
        continue;
      }
      if (context.bytes.has(addr)) {
        context.diagAt(
          context.diagnostics,
          sink.contribution.node.span,
          `Named section content overlaps emitted bytes at address ${addr}.`,
        );
        continue;
      }
      context.bytes.set(addr, value);
    }
    if (sink.anchor.key.section === 'code') {
      placedSourceSegments.push(
        ...context.rebaseCodeSourceSegments(placed.baseAddress, sink.sourceSegments),
      );
    }
  }

  const mergedCodeBytes = new Map([...context.codeBytes, ...emission.codeBytes]);
  const mergedDataBytes = new Map([...context.dataBytes, ...emission.dataBytes]);

  const { writtenRange, sourceSegments } = finalizeProgramEmission({
    diagnostics: context.diagnostics,
    diag: context.diag,
    primaryFile: context.primaryFile,
    baseExprs: context.baseExprs,
    evalImmExpr: context.evalImmExpr,
    env: context.env,
    codeOffset: context.codeOffset,
    dataOffset: context.dataOffset,
    varOffset: context.varOffset,
    pending: context.pending,
    symbols: context.symbols,
    absoluteSymbols: context.absoluteSymbols,
    deferredExterns: context.deferredExterns,
    fixups: context.fixups,
    rel8Fixups: context.rel8Fixups,
    codeBytes: mergedCodeBytes,
    dataBytes: mergedDataBytes,
    hexBytes: context.hexBytes,
    bytes: context.bytes,
    codeSourceSegments: context.codeSourceSegments,
    alignTo: context.alignTo,
    writeSection: context.writeSection,
    computeWrittenRange: context.computeWrittenRange,
    rebaseCodeSourceSegments: context.rebaseCodeSourceSegments,
    ...(context.defaultCodeBase !== undefined
      ? { defaultCodeBase: context.defaultCodeBase }
      : {}),
  });

  resolvePlacedNamedSectionFixups(
    placedContributions,
    context.diagnostics,
    context.bytes,
    context.symbols,
    context.env,
  );

  syncLoweredAsmInstructionBytesFromFinalBytes(placedProgram, context.bytes, context.env);

  const mergedSourceSegments = [...placedSourceSegments, ...sourceSegments].sort((a, b) =>
    a.start === b.start ? a.end - b.end : a.start - b.start,
  );

  const startupInitRegion = buildStartupInitRegion(placedContributions);
  let finalWrittenRange = writtenRange;
  if (startupInitRegion.encoded.length > 0) {
    const mainEntry = context.symbols.find(
      (symbol): symbol is SymbolEntry & { kind: 'label' } =>
        symbol.kind === 'label' && symbol.name.toLowerCase() === 'main',
    );
    const literalValues = (values: number[]) =>
      values.map((value) => ({ kind: 'literal' as const, value }));
    const highest = [...context.bytes.keys()].reduce((max, value) => (value > max ? value : max), -1);
    if (!mainEntry) {
      const start = highest + 1;
      const end = start + startupInitRegion.encoded.length - 1;
      if (end > 0xffff) {
        context.diag(
          context.diagnostics,
          context.primaryFile,
          'Compiler-owned startup init region exceeds 16-bit address space.',
        );
      } else {
        const startupBlock = {
          kind: 'absolute' as const,
          origin: start,
          items: [{ kind: 'db' as const, values: literalValues(startupInitRegion.encoded) }],
        };
        placedProgram.blocks.push(startupBlock);
        const emitted = emitLoweredAsmBlockBytes(startupBlock, {
          diagnostics: context.diagnostics,
          diag: context.diag,
          primaryFile: context.primaryFile,
          env: context.env,
        });
        for (const [offset, value] of emitted.bytes) {
          context.bytes.set(start + offset, value);
        }
        finalWrittenRange = { start: writtenRange.start, end: highest + startupInitRegion.encoded.length };
      }
    } else {
      const startupAddress = highest + 1;
      const startupTemplate = buildStartupInitRoutine(0, startupInitRegion, 0);
      const initRegionAddress = startupAddress + startupTemplate.length;
      const startupBytes = buildStartupInitRoutine(initRegionAddress, startupInitRegion, mainEntry.address);
      const startupEnd = startupAddress + startupBytes.length - 1;
      const startupRegionEnd = startupEnd + startupInitRegion.encoded.length;
      if (startupRegionEnd > 0xffff) {
        context.diag(
          context.diagnostics,
          context.primaryFile,
          'Compiler-owned startup routine exceeds 16-bit address space.',
        );
      } else {
        const startupBlock = {
          kind: 'absolute' as const,
          origin: startupAddress,
          items: [
            { kind: 'label' as const, name: STARTUP_ENTRY_LABEL },
            { kind: 'db' as const, values: literalValues(startupBytes) },
            { kind: 'db' as const, values: literalValues(startupInitRegion.encoded) },
          ],
        };
        placedProgram.blocks.push(startupBlock);
        const emitted = emitLoweredAsmBlockBytes(startupBlock, {
          diagnostics: context.diagnostics,
          diag: context.diag,
          primaryFile: context.primaryFile,
          env: context.env,
        });
        for (const [offset, value] of emitted.bytes) {
          context.bytes.set(startupAddress + offset, value);
        }
        context.symbols.push({
          kind: 'label',
          name: STARTUP_ENTRY_LABEL,
          address: startupAddress,
          file: context.primaryFile,
          scope: 'global',
        });
        finalWrittenRange = { start: writtenRange.start, end: startupRegionEnd };
      }
    }
  }

  return {
    map: {
      bytes: context.bytes,
      writtenRange: finalWrittenRange,
      ...(mergedSourceSegments.length > 0 ? { sourceSegments: mergedSourceSegments } : {}),
    },
    symbols: context.symbols,
    placedLoweredAsmProgram: placedProgram,
  };
}
