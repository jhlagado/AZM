import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import type { EmittedSourceSegment } from '../outputs/types.js';
import { buildAddressState, resolveSymbols } from './address-planning.js';
import { emitProgramImage } from './program-emission.js';

export interface AssemblyResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: import('../model/symbol.js').SymbolTable;
  readonly origin: number;
  readonly initializedAddresses: readonly number[];
  readonly reservedAddresses: readonly number[];
  readonly sourceSegments: readonly EmittedSourceSegment[];
  readonly bytes: Uint8Array;
}

function emptyAssemblyResult(
  diagnostics: Diagnostic[],
  partial: Partial<AssemblyResult> = {},
): AssemblyResult {
  return {
    diagnostics,
    symbols: partial.symbols ?? {},
    origin: partial.origin ?? 0,
    initializedAddresses: [],
    reservedAddresses: [],
    sourceSegments: [],
    bytes: new Uint8Array(),
  };
}

export function assembleProgram(items: readonly SourceItem[]): AssemblyResult {
  const diagnostics: Diagnostic[] = [];
  const addressState = buildAddressState(items, diagnostics);
  if (diagnostics.length > 0) {
    return emptyAssemblyResult(diagnostics, { origin: addressState.origin });
  }

  const symbols = resolveSymbols(
    addressState.labels,
    addressState.equates,
    addressState.layouts,
    diagnostics,
  );
  if (diagnostics.length > 0) {
    return emptyAssemblyResult(diagnostics, { symbols, origin: addressState.origin });
  }

  const emitted = emitProgramImage(items, addressState, symbols, diagnostics);
  return {
    diagnostics,
    symbols,
    origin: emitted.origin,
    initializedAddresses: emitted.initializedAddresses,
    reservedAddresses: emitted.reservedAddresses,
    sourceSegments: emitted.sourceSegments,
    bytes: diagnostics.length > 0 ? new Uint8Array() : emitted.bytes,
  };
}
