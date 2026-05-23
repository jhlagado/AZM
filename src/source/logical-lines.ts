import type { SourceFile } from './source-file.js';

export interface LogicalLine {
  readonly sourceName: string;
  readonly line: number;
  readonly text: string;
}

export function scanLogicalLines(source: SourceFile): LogicalLine[] {
  const normalized = source.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.endsWith('\n')
    ? normalized.slice(0, -1).split('\n')
    : normalized.split('\n');

  return rawLines.map((text, index) => ({
    sourceName: source.name,
    line: index + 1,
    text,
  }));
}
