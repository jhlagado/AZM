import type {
  D8mFileEntry,
  D8mSymbol,
  EmittedSourceSegment,
} from './types.js';
import {
  compareFileSymbol,
  compareSegment,
  compareSymbol,
  rangesOverlap,
} from './d8-helpers.js';

type AddressRange = { start: number; end: number };

function hasOverlappingSourceSegment(
  sourceSegmentsByFile: ReadonlyMap<string, EmittedSourceSegment[]>,
  file: string,
  range: AddressRange,
): boolean {
  return (sourceSegmentsByFile.get(file) ?? []).some((segment) =>
    rangesOverlap({ start: segment.start, end: segment.end }, range),
  );
}

function sourceSegmentsByFile(
  sourceSegments: readonly EmittedSourceSegment[],
): Map<string, EmittedSourceSegment[]> {
  const byFile = new Map<string, EmittedSourceSegment[]>();
  for (const segment of sourceSegments) {
    const segments = byFile.get(segment.file);
    if (segments) {
      segments.push(segment);
    } else {
      byFile.set(segment.file, [segment]);
    }
  }
  return byFile;
}

function symbolRangesByFile(symbols: readonly D8mSymbol[]): Map<string, AddressRange[]> {
  const byFile = new Map<string, AddressRange[]>();
  for (const symbol of symbols) {
    if (symbol.kind === 'constant' || symbol.file === undefined) continue;
    if (symbol.address === undefined) continue;
    const size = symbol.size !== undefined && symbol.size > 0 ? symbol.size : 1;
    const ranges = byFile.get(symbol.file) ?? [];
    ranges.push({ start: symbol.address, end: Math.min(0x10000, symbol.address + size) });
    byFile.set(symbol.file, ranges);
  }
  return byFile;
}

function ensureEntry(
  entries: Map<string, Required<D8mFileEntry>>,
  file: string,
): Required<D8mFileEntry> {
  let entry = entries.get(file);
  if (!entry) {
    entry = { symbols: [], segments: [] };
    entries.set(file, entry);
  }
  return entry;
}

function addFileSymbols(
  entries: Map<string, Required<D8mFileEntry>>,
  symbols: readonly D8mSymbol[],
): D8mSymbol[] {
  const sortedSymbols = [...symbols].sort(compareSymbol);
  for (const symbol of sortedSymbols) {
    const entry = ensureEntry(entries, symbol.file ?? '');
    const symbolWithoutFile = { ...symbol };
    delete symbolWithoutFile.file;
    entry.symbols.push(symbolWithoutFile);
  }
  return sortedSymbols;
}

function addSourceSegments(
  entries: Map<string, Required<D8mFileEntry>>,
  sourceSegments: readonly EmittedSourceSegment[],
): void {
  for (const segment of sourceSegments) {
    ensureEntry(entries, segment.file).segments.push({
      start: segment.start,
      end: segment.end,
      line: segment.line,
      lstLine: segment.line,
      kind: segment.kind,
      confidence: segment.confidence,
    });
  }
}

function addFallbackSegments(
  entries: Map<string, Required<D8mFileEntry>>,
  segments: readonly AddressRange[],
  symbols: readonly D8mSymbol[],
  sourceSegments: readonly EmittedSourceSegment[],
  fileList: readonly string[],
): void {
  const sourceByFile = sourceSegmentsByFile(sourceSegments);
  const rangesByFile = symbolRangesByFile(symbols);

  for (const segment of segments) {
    const targetFiles = [...rangesByFile.entries()]
      .filter(([, ranges]) => ranges.some((range) => rangesOverlap(range, segment)))
      .map(([file]) => file)
      .sort((a, b) => a.localeCompare(b));
    const targets = targetFiles.length > 0 ? targetFiles : [fileList[0] ?? ''];
    for (const target of targets) {
      if (hasOverlappingSourceSegment(sourceByFile, target, segment)) continue;
      ensureEntry(entries, target).segments.push({
        start: segment.start,
        end: segment.end,
        lstLine: 1,
        kind: 'unknown',
        confidence: 'low',
      });
    }
  }
}

export function buildD8mFiles(
  symbols: readonly D8mSymbol[],
  sourceSegments: readonly EmittedSourceSegment[],
  segments: readonly AddressRange[],
  fileList: readonly string[],
): { files: Record<string, D8mFileEntry>; sortedSymbols: D8mSymbol[] } {
  const entries = new Map<string, Required<D8mFileEntry>>();
  const sortedSymbols = addFileSymbols(entries, symbols);
  addSourceSegments(entries, sourceSegments);
  addFallbackSegments(entries, segments, sortedSymbols, sourceSegments, fileList);

  for (const entry of entries.values()) {
    entry.symbols.sort(compareFileSymbol);
    entry.segments.sort(compareSegment);
  }

  const files = Object.fromEntries(
    [...entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, fileEntry]) => [
        path,
        {
          ...(fileEntry.segments.length > 0 ? { segments: fileEntry.segments } : {}),
          ...(fileEntry.symbols.length > 0 ? { symbols: fileEntry.symbols } : {}),
        },
      ]),
  );

  return { files, sortedSymbols };
}
