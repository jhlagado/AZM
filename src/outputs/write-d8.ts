import type {
  D8mArtifact,
  D8mGenerator,
  EmittedByteMap,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';
import { getWrittenRange, getWrittenSegments } from './range.js';
import {
  normalizeInputs,
  normalizeSourceSegments,
  toD8mSymbol,
} from './d8-helpers.js';
import { buildD8mFiles } from './d8-files.js';

export function writeD8m(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts?: WriteD8mOptions,
): D8mArtifact {
  const { start, end } = getWrittenRange(map);
  const writtenSegments = getWrittenSegments(map);
  const segments =
    writtenSegments.length > 0
      ? writtenSegments
      : start < end
        ? [{ start, end }]
        : [{ start: 0, end: 0 }];
  const jsonSymbols = symbols.map((symbol) => toD8mSymbol(symbol, opts?.rootDir));
  const normalizedSourceSegments = normalizeSourceSegments(
    map.sourceSegments ?? [],
    segments,
    opts?.rootDir,
  );

  const fileSet = new Set(
    jsonSymbols
      .map((symbol) => symbol.file)
      .filter((file): file is string => typeof file === 'string' && file.length > 0),
  );
  for (const segment of normalizedSourceSegments) {
    if (segment.file.length > 0) fileSet.add(segment.file);
  }
  const fileList = [...fileSet].sort((a, b) => a.localeCompare(b));

  const { files, sortedSymbols } = buildD8mFiles(
    jsonSymbols,
    normalizedSourceSegments,
    segments,
    fileList,
  );

  const generatorInputs =
    opts?.inputs !== undefined ? normalizeInputs(opts.inputs, opts.rootDir) : undefined;
  const generator: D8mGenerator = {
    name: 'azm',
    tool: 'azm',
    ...(opts?.packageVersion !== undefined ? { version: opts.packageVersion } : {}),
    ...(generatorInputs !== undefined ? { inputs: generatorInputs } : {}),
    ...(opts?.entrySymbol !== undefined ? { entrySymbol: opts.entrySymbol } : {}),
    ...(opts?.entryAddress !== undefined ? { entryAddress: opts.entryAddress & 0xffff } : {}),
  };

  return {
    kind: 'd8m',
    json: {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files,
      segments,
      ...(fileList.length > 0 ? { fileList } : {}),
      symbols: sortedSymbols,
      generator,
    },
  };
}
