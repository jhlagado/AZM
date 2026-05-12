import type { SourcePosition, SourceSpan } from './ast.js';

/**
 * Source file + precomputed line-start offsets, used to convert byte offsets into line/column spans.
 */
export interface SourceFile {
  path: string;
  text: string;
  /**
   * 0-based byte offsets for the start of each line. The first entry is always 0.
   */
  lineStarts: number[];
  /**
   * Optional per-line file mapping for include-aware source locations.
   */
  lineFiles?: string[];
  /**
   * Optional per-line line number mapping for include-aware source locations.
   */
  lineBaseLines?: number[];
}

/**
 * Build a {@link SourceFile} from a path and UTF-8 source text.
 */
export function makeSourceFile(path: string, text: string): SourceFile {
  const lineStarts = [0];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      lineStarts.push(i + 1);
      continue;
    }
    // CR-only line endings (old Mac) should be treated as newlines as well.
    if (ch === '\r' && text[i + 1] !== '\n') {
      lineStarts.push(i + 1);
    }
  }
  return { path, text, lineStarts };
}

/**
 * Convert a 0-based byte offset in `file.text` into a 1-based line/column position.
 */
export function posAtOffset(file: SourceFile, offset: number): SourcePosition {
  const clamped = Math.max(0, Math.min(offset, file.text.length));
  let lo = 0;
  let hi = file.lineStarts.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const midStart = file.lineStarts[mid] ?? 0;
    if (midStart <= clamped) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const lineStart = file.lineStarts[lo] ?? 0;
  const mappedLine = file.lineBaseLines?.[lo] ?? lo + 1;
  return { line: mappedLine, column: clamped - lineStart + 1, offset: clamped };
}

/**
 * Construct a {@link SourceSpan} for a half-open offset range `[startOffset, endOffset]`.
 */
export function span(file: SourceFile, startOffset: number, endOffset: number): SourceSpan {
  const resolveLineIndex = (off: number): number => {
    const clamped = Math.max(0, Math.min(off, file.text.length));
    let lo = 0;
    let hi = file.lineStarts.length - 1;
    while (lo < hi) {
      const mid = Math.floor((lo + hi + 1) / 2);
      const midStart = file.lineStarts[mid] ?? 0;
      if (midStart <= clamped) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  };

  const startIndex = resolveLineIndex(startOffset);
  return {
    file: file.lineFiles?.[startIndex] ?? file.path,
    start: posAtOffset(file, startOffset),
    end: posAtOffset(file, endOffset),
  };
}
