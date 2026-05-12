import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Asm80Artifact, BinArtifact, EmittedByteMap, SymbolEntry } from '../../src/formats/types.js';
import type { LoweredAsmProgram } from '../../src/lowering/loweredAsmTypes.js';
import type { CompiledLoweredProgram } from './lowered_program_types.js';

export async function compilePlacedProgram(entry: string): Promise<CompiledLoweredProgram> {
  let capturedProgram: LoweredAsmProgram | undefined;
  let capturedMap: EmittedByteMap | undefined;
  let capturedSymbols: SymbolEntry[] | undefined;
  const formats = {
    ...defaultFormatWriters,
    writeBin: (map: EmittedByteMap, symbols: SymbolEntry[]): BinArtifact => {
      capturedMap = map;
      capturedSymbols = symbols;
      return { kind: 'bin', bytes: new Uint8Array() };
    },
    writeAsm80: (program: LoweredAsmProgram): Asm80Artifact => {
      capturedProgram = program;
      return { kind: 'asm80', text: '' };
    },
  };
  const res = await compile(
    entry,
    { emitAsm80: true, emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
    { formats },
  );
  if (!capturedProgram) {
    throw new Error('Placed lowered program was not captured from ASM80 emission.');
  }
  if (!capturedMap || !capturedSymbols) {
    throw new Error('Resolved byte map and symbols were not captured from BIN emission.');
  }
  return { program: capturedProgram, diagnostics: res.diagnostics, map: capturedMap, symbols: capturedSymbols };
}
