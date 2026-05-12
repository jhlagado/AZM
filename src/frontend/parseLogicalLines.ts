import type { Diagnostic } from '../diagnosticTypes.js';

import { parseDiag as diag } from './parseDiagnostics.js';
import type { SourceFile } from './source.js';

export type LogicalLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

export function buildLogicalLines(
  file: SourceFile,
  modulePath: string,
  diagnostics: Diagnostic[],
): LogicalLine[] {
  const logicalLines: LogicalLine[] = [];

  for (let i = 0; i < file.lineStarts.length; i++) {
    const startOffset = file.lineStarts[i] ?? 0;
    const nextStart = file.lineStarts[i + 1] ?? file.text.length;
    let rawWithEol = file.text.slice(startOffset, nextStart);
    if (rawWithEol.endsWith('\n')) rawWithEol = rawWithEol.slice(0, -1);
    if (rawWithEol.endsWith('\r')) rawWithEol = rawWithEol.slice(0, -1);

    const raw = rawWithEol;
    const lineNo = file.lineBaseLines?.[i] ?? i + 1;
    const filePath = file.lineFiles?.[i] ?? modulePath;
    let segmentStart = 0;
    let inChar = false;
    let inString = false;
    let escaped = false;

    for (let j = 0; j < raw.length; j++) {
      const ch = raw[j]!;

      if (inChar || inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (inChar && ch === "'") {
          inChar = false;
          continue;
        }
        if (inString && ch === '"') {
          inString = false;
          continue;
        }
        continue;
      }

      if (ch === ';') {
        break;
      }

      if (ch === "'") {
        inChar = true;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === '\\') {
        const rest = raw.slice(j + 1);
        const hasWhitespace = rest.length > 0 && /[ \t]/.test(rest[0]!);
        if (!hasWhitespace && rest.length > 0) continue;

        const nonSpaceIndex = rest.search(/[^\s]/);
        const nextToken = nonSpaceIndex >= 0 ? rest[nonSpaceIndex] : '';
        if (nonSpaceIndex === -1 || nextToken === ';') {
          diag(diagnostics, filePath, 'Trailing backslash must be followed by another statement.', {
            line: lineNo,
            column: j + 1,
          });
          continue;
        }
        const segment = raw.slice(segmentStart, j);
        logicalLines.push({
          raw: segment,
          startOffset: startOffset + segmentStart,
          endOffset: startOffset + j,
          lineNo,
          filePath,
        });
        segmentStart = j + 1;
      }
    }

    logicalLines.push({
      raw: raw.slice(segmentStart),
      startOffset: startOffset + segmentStart,
      endOffset: startOffset + raw.length,
      lineNo,
      filePath,
    });
  }

  return logicalLines;
}

export function getLogicalLine(
  logicalLines: LogicalLine[],
  lineIndex: number,
  modulePath: string,
): LogicalLine {
  return (
    logicalLines[lineIndex] ?? {
      raw: '',
      startOffset: 0,
      endOffset: 0,
      lineNo: 1,
      filePath: modulePath,
    }
  );
}