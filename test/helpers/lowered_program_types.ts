import type { Diagnostic } from '../../src/diagnosticTypes.js';
import type { EmittedByteMap, SymbolEntry } from '../../src/formats/types.js';
import type {
  LoweredAsmBlock,
  LoweredAsmProgram,
  LoweredOperand,
} from '../../src/lowering/loweredAsmTypes.js';

export type CompiledLoweredProgram = {
  program: LoweredAsmProgram;
  diagnostics: Diagnostic[];
  map: EmittedByteMap;
  symbols: SymbolEntry[];
};

export type LoweredInstrView = {
  head: string;
  operands: LoweredOperand[];
  bytes?: number[];
  resolvedBytes?: number[];
  block: LoweredAsmBlock;
  address: number;
  size: number;
  itemIndex: number;
};

export type LoweredLabelView = {
  name: string;
  address: number;
  block: LoweredAsmBlock;
  itemIndex: number;
};

export type LoweredBlockMatcher = Partial<
  Pick<LoweredAsmBlock, 'kind' | 'origin' | 'section' | 'name' | 'contributionOrder'>
>;

export type OperandPredicate = (op: LoweredOperand | undefined) => boolean;

export type LoweredLabelRange = {
  startLabel: string;
  endLabel?: string;
};

export type RawAbs16TargetSpec = {
  opcode: number;
  opcode2?: number;
  target: string;
  addend?: number;
  range?: LoweredLabelRange;
};

export type ResolvedRawAbs16TargetView = LoweredInstrView & {
  resolvedTargetAddress: number;
  resolvedTargetSymbol?: SymbolEntry;
};

export function isCompiledLoweredProgram(
  value: LoweredAsmProgram | CompiledLoweredProgram,
): value is CompiledLoweredProgram {
  return 'program' in value;
}

export function getProgram(value: LoweredAsmProgram | CompiledLoweredProgram): LoweredAsmProgram {
  return isCompiledLoweredProgram(value) ? value.program : value;
}

export function getMap(
  value: LoweredAsmProgram | CompiledLoweredProgram,
): EmittedByteMap | undefined {
  return isCompiledLoweredProgram(value) ? value.map : undefined;
}
