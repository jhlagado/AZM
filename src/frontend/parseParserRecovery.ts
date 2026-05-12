import type { Diagnostic } from '../diagnosticTypes.js';
import {
  consumeKeywordPrefix,
  diagInvalidHeaderLine,
  malformedTopLevelHeaderExpectations,
  topLevelStartKeyword,
  unsupportedExportTargetKind,
} from './parseModuleCommon.js';
import { parseDiag as diag } from './parseDiagnostics.js';

export function parseExportModifier(args: {
  text: string;
  lineNo: number;
  allowAsmSpecialCase: boolean;
  filePath: string;
  diagnostics: Diagnostic[];
}): { rest: string; exported: boolean } | undefined {
  const { text, lineNo, allowAsmSpecialCase, filePath, diagnostics } = args;
  const exportTail = consumeKeywordPrefix(text, 'export');
  if (exportTail === undefined) return { rest: text, exported: false };

  const rest = exportTail;
  if (rest.length === 0) {
    diag(diagnostics, filePath, `Invalid export statement`, { line: lineNo, column: 1 });
    return undefined;
  }

  const allowed =
    consumeKeywordPrefix(rest, 'const') !== undefined ||
    consumeKeywordPrefix(rest, 'type') !== undefined ||
    consumeKeywordPrefix(rest, 'union') !== undefined ||
    consumeKeywordPrefix(rest, 'enum') !== undefined ||
    consumeKeywordPrefix(rest, 'func') !== undefined ||
    consumeKeywordPrefix(rest, 'op') !== undefined;
  if (allowed) return { rest, exported: true };

  if (allowAsmSpecialCase) {
    const exportAsmTail = consumeKeywordPrefix(rest, 'asm');
    if (exportAsmTail !== undefined) {
      diag(
        diagnostics,
        filePath,
        `"asm" is not a top-level construct (function and op bodies are implicit instruction streams)`,
        {
          line: lineNo,
          column: 1,
        },
      );
      return undefined;
    }
  }

  const targetKeyword = topLevelStartKeyword(rest);
  if (targetKeyword !== undefined) {
    const targetKind = unsupportedExportTargetKind[targetKeyword];
    if (targetKind !== undefined) {
      diag(diagnostics, filePath, `export not supported on ${targetKind}`, {
        line: lineNo,
        column: 1,
      });
    } else {
      diag(
        diagnostics,
        filePath,
        `export is only permitted on const/type/union/enum/func/op declarations`,
        {
          line: lineNo,
          column: 1,
        },
      );
    }
  } else {
    diag(
      diagnostics,
      filePath,
      `export is only permitted on const/type/union/enum/func/op declarations`,
      {
        line: lineNo,
        column: 1,
      },
    );
  }
  return undefined;
}

export function recoverUnsupportedParserLine(args: {
  index: number;
  scope: 'module' | 'section';
  text: string;
  rest: string;
  hasExportPrefix: boolean;
  lineNo: number;
  filePath: string;
  diagnostics: Diagnostic[];
}): { nextIndex: number } {
  const { index, scope, text, rest, hasExportPrefix, lineNo, filePath, diagnostics } = args;
  const asmTail = consumeKeywordPrefix(text, 'asm');
  const asmAfterExportTail = hasExportPrefix ? consumeKeywordPrefix(rest, 'asm') : undefined;
  if (asmTail !== undefined || asmAfterExportTail !== undefined) {
    diag(
      diagnostics,
      filePath,
      `"asm" is not a top-level construct (function and op bodies are implicit instruction streams)`,
      {
        line: lineNo,
        column: 1,
      },
    );
    return { nextIndex: index + 1 };
  }

  if (scope === 'module') {
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

  diag(diagnostics, filePath, `Unsupported section-contained construct: ${text}`, {
    line: lineNo,
    column: 1,
  });
  return { nextIndex: index + 1 };
}
