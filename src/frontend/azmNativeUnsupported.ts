import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import { topLevelStartKeyword } from './parseModuleCommon.js';
import { stripLineComment as stripComment } from './parseParserShared.js';

export type RawLineReader = (lineIndex: number) => { raw: string };

export function azmNativeUnsupportedDiagnostic(
  diagnostics: Diagnostic[],
  filePath: string,
  lineNo: number,
  message: string,
): void {
  diagnostics.push({
    id: DiagnosticIds.AzmDeprecatedZaxConstruct,
    severity: 'error',
    message,
    file: filePath,
    line: lineNo,
    column: 1,
  });
}

export function consumeThroughBlockEnd(
  startIndex: number,
  lineCount: number,
  getRawLine: RawLineReader,
): number {
  let index = startIndex + 1;
  while (index < lineCount) {
    const text = stripComment(getRawLine(index).raw).trim();
    if (text.length === 0) {
      index++;
      continue;
    }
    if (text.toLowerCase() === 'end') return index + 1;
    if (topLevelStartKeyword(text) !== undefined) return index;
    index++;
  }
  return index;
}
