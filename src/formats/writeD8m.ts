import { isAbsolute, relative, resolve } from 'node:path';

import type {
  D8mArtifact,
  D8mJson,
  EmittedByteMap,
  EmittedSourceSegment,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';
import { getWrittenRange, getWrittenSegments } from './range.js';

function normalizeD8mPath(file: string, rootDir?: string): string {
  const withSlashes = file.replace(/\\/g, '/');
  if (!rootDir) return withSlashes;
  const absFile = resolve(file);
  const absRoot = resolve(rootDir);
  const rel = relative(absRoot, absFile);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    return absFile.replace(/\\/g, '/');
  }
  return rel.replace(/\\/g, '/');
}

type D8mSegment = {
  start: number;
  end: number;
  lstLine: number;
  /** 1-based `.zax` source line when known; omitted for synthetic / unknown-line segments. */
  line?: number;
  kind: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
};

type D8mSerializedSymbol =
  | {
      name: string;
      kind: 'constant';
      value: number;
      address?: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
    }
  | {
      name: string;
      kind: 'label' | 'data' | 'var' | 'unknown';
      address: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
      size?: number;
    };

type D8mFileSymbol =
  | {
      name: string;
      kind: 'constant';
      value: number;
      address?: number;
      line?: number;
      scope?: 'global' | 'local';
    }
  | {
      name: string;
      kind: 'label' | 'data' | 'var' | 'unknown';
      address: number;
      line?: number;
      scope?: 'global' | 'local';
      size?: number;
    };

type SymbolAddressRange = {
  start: number;
  end: number;
};

function toSerializedSymbol(symbol: SymbolEntry): D8mSerializedSymbol {
  if (symbol.kind === 'constant') {
    return {
      name: symbol.name,
      kind: 'constant',
      value: symbol.value,
      ...(symbol.address !== undefined ? { address: symbol.address } : {}),
      ...(symbol.file !== undefined ? { file: symbol.file } : {}),
      ...(symbol.line !== undefined ? { line: symbol.line } : {}),
      ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
    };
  }
  return {
    name: symbol.name,
    kind: symbol.kind,
    address: symbol.address,
    ...(symbol.file !== undefined ? { file: symbol.file } : {}),
    ...(symbol.line !== undefined ? { line: symbol.line } : {}),
    ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
    ...(symbol.size !== undefined ? { size: symbol.size } : {}),
  };
}

function compareSerializedSymbols(a: D8mSerializedSymbol, b: D8mSerializedSymbol): number {
  const aClass = a.kind === 'constant' ? 1 : 0;
  const bClass = b.kind === 'constant' ? 1 : 0;
  if (aClass !== bClass) return aClass - bClass;

  const aAddress = a.kind === 'constant' ? (a.address ?? a.value & 0xffff) : a.address;
  const bAddress = b.kind === 'constant' ? (b.address ?? b.value & 0xffff) : b.address;
  if (aAddress !== bAddress) return aAddress - bAddress;

  const nameCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  if (nameCmp !== 0) return nameCmp;

  const kindCmp = a.kind.localeCompare(b.kind);
  if (kindCmp !== 0) return kindCmp;

  const fileCmp = (a.file ?? '').localeCompare(b.file ?? '');
  if (fileCmp !== 0) return fileCmp;

  const lineCmp = (a.line ?? 0) - (b.line ?? 0);
  if (lineCmp !== 0) return lineCmp;

  if (a.kind === 'constant' && b.kind === 'constant') {
    return a.value - b.value;
  }

  const aSize = (a as { size?: number }).size ?? 0;
  const bSize = (b as { size?: number }).size ?? 0;
  return aSize - bSize;
}

function compareFileSymbols(a: D8mFileSymbol, b: D8mFileSymbol): number {
  const withFile = (symbol: D8mFileSymbol): D8mSerializedSymbol => ({
    ...symbol,
  });

  return compareSerializedSymbols(withFile(a), withFile(b));
}

function compareD8mSegments(a: D8mSegment, b: D8mSegment): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return a.end - b.end;
  if (a.lstLine !== b.lstLine) return a.lstLine - b.lstLine;
  const aLine = a.line ?? 0;
  const bLine = b.line ?? 0;
  if (aLine !== bLine) return aLine - bLine;
  const kindCmp = a.kind.localeCompare(b.kind);
  if (kindCmp !== 0) return kindCmp;
  return a.confidence.localeCompare(b.confidence);
}

function rangesOverlap(a: SymbolAddressRange, b: SymbolAddressRange): boolean {
  return a.start < b.end && b.start < a.end;
}

function hasOverlappingSourceSegment(
  sourceSegmentsByFile: ReadonlyMap<string, EmittedSourceSegment[]>,
  file: string,
  range: SymbolAddressRange,
): boolean {
  return (sourceSegmentsByFile.get(file) ?? []).some((segment) =>
    rangesOverlap({ start: segment.start, end: segment.end }, range),
  );
}

/**
 * Create a minimal D8 Debug Map (D8M) v1 JSON artifact.
 *
 * Implementation note:
 * - Emits baseline contiguous written segments plus optional source-attributed per-file segments
 *   when provided by lowering.
 */
export function writeD8m(
  map: EmittedByteMap,
  symbols: SymbolEntry[],
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

  const normalizedSymbols = symbols.map((s) => ({
    ...s,
    ...(s.file !== undefined ? { file: normalizeD8mPath(s.file, opts?.rootDir) } : {}),
  }));
  const normalizedSourceSegments: EmittedSourceSegment[] = (map.sourceSegments ?? [])
    .filter((segment) => segment.end > segment.start)
    .map((segment) => ({
      ...segment,
      file: normalizeD8mPath(segment.file, opts?.rootDir),
    }));
  const fileSet = new Set(
    normalizedSymbols
      .map((s) => s.file)
      .filter((f): f is string => typeof f === 'string' && f.length > 0),
  );
  for (const segment of normalizedSourceSegments) {
    if (segment.file.length > 0) fileSet.add(segment.file);
  }
  const fileList = Array.from(fileSet).sort((a, b) => a.localeCompare(b));

  const serializedSymbols: D8mSerializedSymbol[] = normalizedSymbols
    .map(toSerializedSymbol)
    .sort(compareSerializedSymbols);

  const fileEntries = new Map<
    string,
    {
      symbols: D8mFileSymbol[];
      segments: D8mSegment[];
    }
  >();
  const ensureFileEntry = (path: string) => {
    let entry = fileEntries.get(path);
    if (!entry) {
      entry = { symbols: [], segments: [] };
      fileEntries.set(path, entry);
    }
    return entry;
  };

  for (const symbol of serializedSymbols) {
    const key = symbol.file ?? '';
    const entry = ensureFileEntry(key);
    const { file: _file, ...withoutFile } = symbol;
    entry.symbols.push(withoutFile);
  }
  for (const segment of normalizedSourceSegments) {
    ensureFileEntry(segment.file).segments.push({
      start: segment.start,
      end: segment.end,
      lstLine: segment.line,
      line: segment.line,
      kind: segment.kind,
      confidence: segment.confidence,
    });
  }
  const sourceSegmentsByFile = new Map<string, EmittedSourceSegment[]>();
  for (const segment of normalizedSourceSegments) {
    const entries = sourceSegmentsByFile.get(segment.file);
    if (entries) {
      entries.push(segment);
    } else {
      sourceSegmentsByFile.set(segment.file, [segment]);
    }
  }

  const symbolRangesByFile = new Map<string, SymbolAddressRange[]>();
  for (const symbol of serializedSymbols) {
    if (symbol.kind === 'constant' || symbol.file === undefined) continue;
    const spanSize = symbol.size !== undefined && symbol.size > 0 ? symbol.size : 1;
    const range: SymbolAddressRange = {
      start: symbol.address,
      end: Math.min(0x10000, symbol.address + spanSize),
    };
    const currentRanges = symbolRangesByFile.get(symbol.file);
    if (currentRanges) {
      currentRanges.push(range);
    } else {
      symbolRangesByFile.set(symbol.file, [range]);
    }
  }

  for (const ranges of symbolRangesByFile.values()) {
    ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  }

  for (const segment of segments) {
    const segmentRange: SymbolAddressRange = { start: segment.start, end: segment.end };
    const fileKeys = Array.from(symbolRangesByFile.entries())
      .filter(([, ranges]) => ranges.some((range) => rangesOverlap(range, segmentRange)))
      .map(([path]) => path)
      .sort((a, b) => a.localeCompare(b));
    const targets = fileKeys.length > 0 ? fileKeys : [fileList[0] ?? ''];
    for (const target of targets) {
      if (hasOverlappingSourceSegment(sourceSegmentsByFile, target, segmentRange)) continue;
      ensureFileEntry(target).segments.push({
        start: segment.start,
        end: segment.end,
        // Synthetic file-attribution segments have no exact source line; use a valid fallback.
        lstLine: 1,
        kind: 'unknown',
        confidence: 'low',
      });
    }
  }

  for (const entry of fileEntries.values()) {
    entry.symbols.sort(compareFileSymbols);
    entry.segments.sort(compareD8mSegments);
  }

  const files = Object.fromEntries(
    Array.from(fileEntries.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, entry]) => [
        path,
        {
          ...(entry.segments.length > 0 ? { segments: entry.segments } : {}),
          ...(entry.symbols.length > 0 ? { symbols: entry.symbols } : {}),
        },
      ]),
  );

  const json: D8mJson = {
    format: 'd8-debug-map',
    version: 1,
    arch: 'z80',
    addressWidth: 16,
    endianness: 'little',
    files,
    segments,
    ...(fileList.length > 0 ? { fileList } : {}),
    symbols: serializedSymbols,
    ...(opts?.entrySymbol !== undefined || opts?.entryAddress !== undefined
      ? {
          generator: {
            tool: 'zax',
            ...(opts.entrySymbol !== undefined ? { entrySymbol: opts.entrySymbol } : {}),
            ...(opts.entryAddress !== undefined
              ? { entryAddress: opts.entryAddress & 0xffff }
              : {}),
          },
        }
      : {}),
  };

  return { kind: 'd8m', json };
}
