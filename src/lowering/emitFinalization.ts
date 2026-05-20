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
import { placeLoweredAsmStream } from './loweredAsmPlacement.js';
import {
  emitLoweredAsmProgramBytes,
  syncLoweredAsmInstructionBytesFromFinalBytes,
} from './loweredAsmByteEmission.js';
import type { LoweredAsmProgram, LoweredAsmStream } from './loweredAsmTypes.js';

export type EmitFinalizationContext = {
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
  /** Symbol table. */
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
  const placedProgram = placeLoweredAsmStream(context.loweredAsmStream, {
    diagnostics: context.diagnostics,
    diag: context.diag,
    primaryFile: context.primaryFile,
    baseAddresses: { codeBase, dataBase, varBase },
  });
  const emission = emitLoweredAsmProgramBytes(placedProgram, {
    diagnostics: context.diagnostics,
    diag: context.diag,
    primaryFile: context.primaryFile,
    env: context.env,
  });
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

  syncLoweredAsmInstructionBytesFromFinalBytes(placedProgram, context.bytes, context.env);

  const mergedSourceSegments = [...sourceSegments].sort((a, b) =>
    a.start === b.start ? a.end - b.end : a.start - b.start,
  );

  return {
    map: {
      bytes: context.bytes,
      writtenRange,
      ...(mergedSourceSegments.length > 0 ? { sourceSegments: mergedSourceSegments } : {}),
    },
    symbols: context.symbols,
    placedLoweredAsmProgram: placedProgram,
  };
}
