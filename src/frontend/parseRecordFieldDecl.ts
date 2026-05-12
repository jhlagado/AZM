import type { RecordFieldNode } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { diagIfInferredArrayLengthNotAllowed, parseTypeExprFromText } from './parseImm.js';
import {
  diagInvalidBlockLine,
  formatIdentifierToken,
  looksLikeKeywordBodyDeclLine,
  topLevelStartKeyword,
} from './parseModuleCommon.js';
import { stripLineComment as stripComment } from './parseParserShared.js';

export type RecordFieldLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

export type RecordFieldValidationContext = {
  file: SourceFile;
  diagnostics: Diagnostic[];
  modulePath: string;
  isReservedTopLevelName: (name: string) => boolean;
};

export type RecordFieldBlockContext = RecordFieldValidationContext & {
  lineCount: number;
  getRawLine: (lineIndex: number) => RecordFieldLine;
};

type ParsedRecordFields = {
  fields: RecordFieldNode[];
  nextIndex: number;
  terminated: boolean;
  endOffset: number;
  interruptedByKeyword?: string;
  interruptedByLine?: number;
  interruptedByFilePath?: string;
};

export type ParsedFieldBlock = {
  fields: RecordFieldNode[];
  nextIndex: number;
  endOffset: number;
};

export function parseRecordFieldDecl(
  kindName: string,
  fieldText: string,
  line: RecordFieldLine,
  fieldNamesLower: Set<string>,
  ctx: RecordFieldValidationContext,
  /** When set, a bare field type equal to this name (recursive record/union) is rejected in favor of `@Name`. */
  declaringTypeName?: string,
): RecordFieldNode | undefined {
  const { file, diagnostics, modulePath, isReservedTopLevelName } = ctx;
  const { startOffset, endOffset, lineNo, filePath } = line;
  const match = /^([^:]+)\s*:\s*(.+)$/.exec(fieldText);
  if (!match) {
    diagInvalidBlockLine(
      diagnostics,
      filePath,
      `${kindName} field declaration`,
      fieldText,
      '<name>: <type>',
      lineNo,
    );
    return undefined;
  }

  const fieldName = match[1]!.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(fieldName)) {
    diag(
      diagnostics,
      filePath,
      `Invalid ${kindName} field name ${formatIdentifierToken(fieldName)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (isReservedTopLevelName(fieldName)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid ${kindName} field name "${fieldName}": collides with a top-level keyword.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }

  const fieldNameLower = fieldName.toLowerCase();
  if (fieldNamesLower.has(fieldNameLower)) {
    diag(diagnostics, filePath, `Duplicate ${kindName} field name "${fieldName}".`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }

  const typeText = match[2]!.trim();
  const fieldSpan = span(file, startOffset, endOffset);
  const typeExpr = parseTypeExprFromText(typeText, fieldSpan, {
    allowInferredArrayLength: false,
  });
  if (!typeExpr) {
    if (
      diagIfInferredArrayLengthNotAllowed(diagnostics, filePath, typeText, {
        line: lineNo,
        column: 1,
      })
    ) {
      return undefined;
    }
    diagInvalidBlockLine(
      diagnostics,
      filePath,
      `${kindName} field declaration`,
      fieldText,
      '<name>: <type>',
      lineNo,
    );
    return undefined;
  }

  if (
    declaringTypeName !== undefined &&
    typeExpr.kind === 'TypeName' &&
    typeExpr.name.toLowerCase() === declaringTypeName.toLowerCase()
  ) {
    diag(
      diagnostics,
      filePath,
      `Self-referential field type "${typeExpr.name}" requires a typed pointer; use @${typeExpr.name}.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }

  fieldNamesLower.add(fieldNameLower);
  return {
    kind: 'RecordField',
    span: fieldSpan,
    name: fieldName,
    typeExpr,
  };
}

function parseRecordFields(
  fieldKind: string,
  allowFuncKeywordStart: boolean,
  startIndex: number,
  ctx: RecordFieldBlockContext,
  declarationName: string,
): ParsedRecordFields {
  const { file, lineCount, diagnostics, modulePath, getRawLine, isReservedTopLevelName } = ctx;
  const fields: RecordFieldNode[] = [];
  const fieldNamesLower = new Set<string>();
  let terminated = false;
  let interruptedByKeyword: string | undefined;
  let interruptedByLine: number | undefined;
  let interruptedByFilePath: string | undefined;
  let endOffset = file.text.length;
  let index = startIndex;

  while (index < lineCount) {
    const fieldLine = getRawLine(index);
    const { endOffset: lineEndOffset, lineNo, filePath } = fieldLine;
    const fieldText = stripComment(fieldLine.raw).trim();
    const fieldTextLower = fieldText.toLowerCase();
    if (fieldText.length === 0) {
      index++;
      continue;
    }
    if (fieldTextLower === 'end') {
      terminated = true;
      endOffset = lineEndOffset;
      index++;
      break;
    }
    const topKeyword = topLevelStartKeyword(fieldText);
    if (topKeyword !== undefined) {
      if (allowFuncKeywordStart && topKeyword === 'func') {
        // func field forms are allowed inside unions in current parser behavior.
      } else {
        if (looksLikeKeywordBodyDeclLine(fieldText)) {
          diagInvalidBlockLine(
            diagnostics,
            filePath,
            `${fieldKind} field declaration`,
            fieldText,
            '<name>: <type>',
            lineNo,
          );
          index++;
          continue;
        }
        interruptedByKeyword = topKeyword;
        interruptedByLine = lineNo;
        interruptedByFilePath = filePath;
        break;
      }
    }

    const field = parseRecordFieldDecl(
      fieldKind,
      fieldText,
      fieldLine,
      fieldNamesLower,
      {
        file,
        diagnostics,
        modulePath,
        isReservedTopLevelName,
      },
      declarationName,
    );
    if (field) fields.push(field);
    index++;
  }

  return {
    fields,
    nextIndex: index,
    terminated,
    endOffset,
    ...(interruptedByKeyword !== undefined ? { interruptedByKeyword } : {}),
    ...(interruptedByLine !== undefined ? { interruptedByLine } : {}),
    ...(interruptedByFilePath !== undefined ? { interruptedByFilePath } : {}),
  };
}

export function parseRecordFieldBlock(params: {
  declarationKind: 'type' | 'union';
  declarationName: string;
  fieldKind: 'record' | 'union';
  allowFuncKeywordStart: boolean;
  declarationLineNo: number;
  startIndex: number;
  ctx: RecordFieldBlockContext;
}): ParsedFieldBlock {
  const {
    declarationKind,
    declarationName,
    fieldKind,
    allowFuncKeywordStart,
    declarationLineNo,
    startIndex,
    ctx,
  } = params;
  const { file, diagnostics, modulePath } = ctx;
  const parsed = parseRecordFields(fieldKind, allowFuncKeywordStart, startIndex, ctx, declarationName);

  if (!parsed.terminated) {
    if (
      parsed.interruptedByKeyword !== undefined &&
      parsed.interruptedByLine !== undefined &&
      parsed.interruptedByFilePath !== undefined
    ) {
      diag(
        diagnostics,
        parsed.interruptedByFilePath,
        `Unterminated ${declarationKind} "${declarationName}": expected "end" before "${parsed.interruptedByKeyword}"`,
        { line: parsed.interruptedByLine, column: 1 },
      );
    } else {
      diag(
        diagnostics,
        modulePath,
        `Unterminated ${declarationKind} "${declarationName}": missing "end"`,
        { line: declarationLineNo, column: 1 },
      );
    }
  }

  if (parsed.fields.length === 0) {
    const declarationLabel = declarationKind === 'type' ? 'Type' : 'Union';
    diag(
      diagnostics,
      modulePath,
      `${declarationLabel} "${declarationName}" must contain at least one field`,
      { line: declarationLineNo, column: 1 },
    );
  }

  return {
    fields: parsed.fields,
    nextIndex: parsed.nextIndex,
    endOffset: parsed.terminated ? parsed.endOffset : file.text.length,
  };
}
