import type { VarBlockNode, VarDeclNode } from './ast.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import {
  TOP_LEVEL_KEYWORDS,
  diagInvalidBlockLine,
  isTopLevelStart,
  looksLikeKeywordBodyDeclLine,
  parseVarDeclLine,
} from './parseModuleCommon.js';
import { stripLineComment as stripComment } from './parseParserShared.js';

type RawLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

type ParseGlobalsContext = {
  file: SourceFile;
  lineCount: number;
  diagnostics: Diagnostic[];
  modulePath: string;
  getRawLine: (lineIndex: number) => RawLine;
  isReservedTopLevelName: (name: string) => boolean;
};

type ParsedGlobalsBlock = {
  varBlock: VarBlockNode;
  nextIndex: number;
};

export function parseGlobalsBlock(
  storageHeader: 'var' | 'globals',
  startIndex: number,
  lineNo: number,
  ctx: ParseGlobalsContext,
): ParsedGlobalsBlock {
  const { file, lineCount, diagnostics, modulePath, getRawLine, isReservedTopLevelName } = ctx;
  if (storageHeader === 'var') {
    diag(diagnostics, modulePath, `Legacy "var ... end" storage blocks are removed; use direct declarations inside named data sections.`, {
      line: lineNo,
      column: 1,
    });
  } else {
    diag(
      diagnostics,
      modulePath,
      'Legacy "globals ... end" storage blocks are removed; use direct declarations inside named data sections.',
      { line: lineNo, column: 1 },
    );
  }

  const blockDeclKind = 'globals declaration';
  const blockHeaderExpected = 'globals';
  const blockStart = getRawLine(startIndex).startOffset;
  let index = startIndex + 1;
  const decls: VarDeclNode[] = [];
  const declNamesLower = new Set<string>();

  while (index < lineCount) {
    const {
      raw: rawDecl,
      startOffset: so,
      endOffset: eo,
      lineNo: declLineNo,
      filePath: declFilePath,
    } = getRawLine(index);
    const t = stripComment(rawDecl).trim();
    if (t.length === 0) {
      index++;
      continue;
    }
    if (isTopLevelStart(t)) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*[:=]\s*(.+)$/.exec(t);
      if (m && TOP_LEVEL_KEYWORDS.has(m[1]!.toLowerCase())) {
        diag(
          diagnostics,
          declFilePath,
          `Invalid globals declaration name "${m[1]!}": collides with a top-level keyword.`,
          { line: declLineNo, column: 1 },
        );
        index++;
        continue;
      }
      if (looksLikeKeywordBodyDeclLine(t)) {
        diagInvalidBlockLine(
          diagnostics,
          declFilePath,
          blockDeclKind,
          t,
          '<name>: <type>',
          declLineNo,
        );
        index++;
        continue;
      }
      break;
    }
    const declSpan = span(file, so, eo);
    const parsed = parseVarDeclLine(t, declSpan, declLineNo, 'globals', {
      diagnostics,
      modulePath: declFilePath,
      isReservedTopLevelName,
    });
    if (!parsed) {
      if (/^globals\b/i.test(t)) {
        diagInvalidBlockLine(
          diagnostics,
          declFilePath,
          blockDeclKind,
          t,
          blockHeaderExpected,
          declLineNo,
        );
      }
      index++;
      continue;
    }
    const nameLower = parsed.name.toLowerCase();
    if (declNamesLower.has(nameLower)) {
      diag(diagnostics, declFilePath, `Duplicate globals declaration name "${parsed.name}".`, {
        line: declLineNo,
        column: 1,
      });
      index++;
      continue;
    }
    if (nameLower === 'globals') {
      diag(
        diagnostics,
        declFilePath,
        `Invalid globals declaration name "${parsed.name}": collides with a top-level keyword.`,
        {
          line: declLineNo,
          column: 1,
        },
      );
      index++;
      continue;
    }
    declNamesLower.add(nameLower);
    decls.push(parsed);
    index++;
  }

  const blockEnd =
    index < lineCount ? (getRawLine(index).startOffset ?? blockStart) : file.text.length;
  return {
    varBlock: {
      kind: 'VarBlock',
      span: span(file, blockStart, blockEnd),
      scope: 'module',
      decls,
    },
    nextIndex: index,
  };
}
