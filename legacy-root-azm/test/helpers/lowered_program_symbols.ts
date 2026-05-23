import type { SymbolEntry } from '../../src/formats/types.js';
import {
  flattenLoweredInstructions,
  instructionsInLabelRange,
} from './lowered_program_navigation.js';
import type {
  CompiledLoweredProgram,
  LoweredInstrView,
  RawAbs16TargetSpec,
  ResolvedRawAbs16TargetView,
} from './lowered_program_types.js';

function findSymbol(symbols: SymbolEntry[], name: string): SymbolEntry | undefined {
  return symbols.find((symbol) => symbol.name.toUpperCase() === name.toUpperCase());
}

function readResolvedAbs16Target(view: LoweredInstrView): number | undefined {
  if (view.head !== '@raw' || !view.resolvedBytes) return undefined;
  if (view.resolvedBytes.length < 3) return undefined;
  if (
    view.resolvedBytes[0] === 0xed ||
    view.resolvedBytes[0] === 0xdd ||
    view.resolvedBytes[0] === 0xfd
  ) {
    if (view.resolvedBytes.length < 4) return undefined;
    return view.resolvedBytes[2]! | (view.resolvedBytes[3]! << 8);
  }
  return view.resolvedBytes[1]! | (view.resolvedBytes[2]! << 8);
}

export function findRawAbs16Target(
  lowered: CompiledLoweredProgram,
  spec: RawAbs16TargetSpec,
): ResolvedRawAbs16TargetView | undefined {
  const symbol = findSymbol(lowered.symbols, spec.target);
  if (!symbol) return undefined;
  const symbolAddress = symbol.kind === 'constant' ? symbol.value : symbol.address;
  const expectedAddress = (symbolAddress + (spec.addend ?? 0)) & 0xffff;
  const search = spec.range
    ? instructionsInLabelRange(lowered, spec.range.startLabel, spec.range.endLabel)
    : flattenLoweredInstructions(lowered.program, lowered.map);

  for (const instr of search) {
    if (instr.head !== '@raw' || !instr.bytes) continue;
    if (instr.bytes[0] !== spec.opcode) continue;
    if (spec.opcode2 !== undefined && instr.bytes[1] !== spec.opcode2) continue;
    const resolvedTargetAddress = readResolvedAbs16Target(instr);
    if (resolvedTargetAddress === undefined || resolvedTargetAddress !== expectedAddress) continue;
    return { ...instr, resolvedTargetAddress, resolvedTargetSymbol: symbol };
  }
  return undefined;
}
