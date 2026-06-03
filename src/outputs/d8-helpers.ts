import { isAbsolute, normalize, relative, resolve } from 'node:path';

import type {
  D8mFileSymbol,
  D8mSegment,
  D8mSymbol,
  EmittedSourceSegment,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';

function toHexFilePath(path: string, rootDir?: string): string {
  const normalized = normalize(path).replace(/\\/g, '/');
  if (!rootDir) {
    return normalized;
  }

  const root = normalize(resolve(rootDir)).replace(/\\/g, '/');
  const resolvedPath = normalize(resolve(path)).replace(/\\/g, '/');
  const rel = relative(root, resolvedPath).replace(/\\/g, '/');
  if (rel.startsWith('..') || rel === '' || isAbsolute(rel)) {
    return resolvedPath;
  }
  return rel;
}

export function toD8mSymbol(symbol: SymbolEntry, rootDir?: string): D8mSymbol {
  if (symbol.kind === 'constant') {
    return {
      name: symbol.name,
      kind: symbol.kind,
      value: symbol.value,
      ...(symbol.file !== undefined ? { file: toHexFilePath(symbol.file, rootDir) } : {}),
      ...(symbol.line !== undefined ? { line: symbol.line } : {}),
      ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
    } as D8mSymbol;
  }

  return {
    name: symbol.name,
    kind: symbol.kind,
    address: symbol.address,
    ...(symbol.file !== undefined ? { file: toHexFilePath(symbol.file, rootDir) } : {}),
    ...(symbol.line !== undefined ? { line: symbol.line } : {}),
    ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
    ...(symbol.size !== undefined ? { size: symbol.size } : {}),
  } as D8mSymbol;
}

export function compareSymbol(a: D8mSymbol, b: D8mSymbol): number {
  return firstNonZero([
    symbolClass(a) - symbolClass(b),
    symbolAddress(a) - symbolAddress(b),
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
    a.kind.localeCompare(b.kind),
    (a.file ?? '').localeCompare(b.file ?? ''),
    (a.line ?? 0) - (b.line ?? 0),
    symbolTieBreaker(a, b),
  ]);
}

function firstNonZero(values: readonly number[]): number {
  return values.find((value) => value !== 0) ?? 0;
}

function symbolClass(symbol: D8mSymbol): number {
  return symbol.kind === 'constant' ? 1 : 0;
}

function symbolAddress(symbol: D8mSymbol): number {
  return symbol.kind === 'constant'
    ? (symbol.value ?? 0) & 0xffff
    : (symbol.address ?? 0) & 0xffff;
}

function symbolTieBreaker(a: D8mSymbol, b: D8mSymbol): number {
  if (a.kind === 'constant' && b.kind === 'constant') {
    return (a.value ?? 0) - (b.value ?? 0);
  }
  return ((a as { size?: number }).size ?? 0) - ((b as { size?: number }).size ?? 0);
}

export function compareFileSymbol(a: D8mFileSymbol, b: D8mFileSymbol): number {
  return compareSymbol(a as D8mSymbol, b as D8mSymbol);
}

export function compareSegment(a: D8mSegment, b: D8mSegment): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return a.end - b.end;
  if (a.lstLine !== b.lstLine) return a.lstLine - b.lstLine;
  const lineCmp = (a.line ?? 0) - (b.line ?? 0);
  if (lineCmp !== 0) return lineCmp;
  const kindCmp = a.kind.localeCompare(b.kind);
  if (kindCmp !== 0) return kindCmp;
  return a.confidence.localeCompare(b.confidence);
}

export function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

export function normalizeInputs(
  inputs: NonNullable<WriteD8mOptions['inputs']>,
  rootDir?: string,
): { entry?: string; hex?: string; bin?: string } | undefined {
  const out: { entry?: string; hex?: string; bin?: string } = {};
  for (const [key, value] of Object.entries(inputs) as Array<
    ['entry' | 'hex' | 'bin', string]
  >) {
    if (value !== undefined && value.length > 0) {
      out[key] = toHexFilePath(value, rootDir);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function normalizeSourceSegments(
  sourceSegments: readonly EmittedSourceSegment[],
  writtenSegments: readonly { readonly start: number; readonly end: number }[],
  rootDir?: string,
): EmittedSourceSegment[] {
  return coalesceSourceSegments(
    sourceSegments.flatMap((segment) =>
      clipSourceSegmentToWrittenSegments(segment, writtenSegments).map((clipped) => ({
        ...clipped,
        file: toHexFilePath(clipped.file, rootDir),
      })),
    ),
  );
}

function clipSourceSegmentToWrittenSegments(
  segment: EmittedSourceSegment,
  writtenSegments: readonly { readonly start: number; readonly end: number }[],
): EmittedSourceSegment[] {
  const clipped: EmittedSourceSegment[] = [];
  for (const writtenSegment of writtenSegments) {
    const start = Math.max(segment.start, writtenSegment.start);
    const end = Math.min(segment.end, writtenSegment.end);
    if (end > start) {
      clipped.push({ ...segment, start, end });
    }
  }
  return clipped;
}

function coalesceSourceSegments(segments: readonly EmittedSourceSegment[]): EmittedSourceSegment[] {
  const sorted = [...segments].sort(
    (a, b) =>
      a.file.localeCompare(b.file) ||
      a.line - b.line ||
      a.column - b.column ||
      a.kind.localeCompare(b.kind) ||
      a.confidence.localeCompare(b.confidence) ||
      a.start - b.start ||
      a.end - b.end,
  );
  const coalesced: EmittedSourceSegment[] = [];
  for (const segment of sorted) {
    const previous = coalesced[coalesced.length - 1];
    if (
      previous &&
      previous.file === segment.file &&
      previous.line === segment.line &&
      previous.column === segment.column &&
      previous.kind === segment.kind &&
      previous.confidence === segment.confidence &&
      previous.end === segment.start
    ) {
      coalesced[coalesced.length - 1] = { ...previous, end: segment.end };
    } else {
      coalesced.push(segment);
    }
  }
  return coalesced;
}
