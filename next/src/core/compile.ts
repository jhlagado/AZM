import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { assembleProgram } from '../assembly/assemble-program.js';
import { writeIntelHex } from '../outputs/hex.js';
import { createSourceFile } from '../source/source-file.js';
import { scanLogicalLines } from '../source/logical-lines.js';
import { parseLogicalLine } from '../syntax/parse-line.js';

export interface CompileNextOptions {
  readonly entryName?: string;
}

export interface CompileNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly symbols: Readonly<Record<string, number>>;
  readonly bytes: Uint8Array;
  readonly hexText: string;
}

export function compileNext(
  sourceText: string,
  options: CompileNextOptions = {},
): CompileNextResult {
  const source = createSourceFile(options.entryName ?? '<memory>', sourceText);
  const diagnostics: Diagnostic[] = [];
  const items: SourceItem[] = [];

  for (const line of scanLogicalLines(source)) {
    const result = parseLogicalLine(line);
    diagnostics.push(...result.diagnostics);
    items.push(...result.items);
  }

  if (diagnostics.length > 0) {
    return {
      diagnostics,
      symbols: {},
      bytes: new Uint8Array(),
      hexText: writeIntelHex(0, new Uint8Array()),
    };
  }

  const assembly = assembleProgram(items);
  const allDiagnostics = [...diagnostics, ...assembly.diagnostics];
  return {
    diagnostics: allDiagnostics,
    symbols: assembly.symbols,
    bytes: assembly.bytes,
    hexText: writeIntelHex(assembly.origin, assembly.bytes),
  };
}
