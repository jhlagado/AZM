import type { Diagnostic } from '../diagnosticTypes.js';
import {
  diagInvalidHeaderLine,
  malformedTopLevelHeaderExpectations,
} from './parseModuleCommon.js';
import { parseDiag as diag } from './parseDiagnostics.js';

export function recoverUnsupportedParserLine(args: {
  index: number;
  scope: 'module';
  text: string;
  rest: string;
  lineNo: number;
  filePath: string;
  diagnostics: Diagnostic[];
}): { nextIndex: number } {
  const { index, text, rest, lineNo, filePath, diagnostics } = args;

  const hasTopKeyword = (kw: string): boolean => new RegExp(`^${kw}\\b`, 'i').test(rest);
  for (const expectation of malformedTopLevelHeaderExpectations) {
    if (hasTopKeyword(expectation.keyword)) {
      diagInvalidHeaderLine(
        diagnostics,
        filePath,
        expectation.kind,
        text,
        expectation.expected,
        lineNo,
      );
      return { nextIndex: index + 1 };
    }
  }

  diag(diagnostics, filePath, `Unsupported top-level construct: ${text}`, {
    line: lineNo,
    column: 1,
  });
  return { nextIndex: index + 1 };
}
