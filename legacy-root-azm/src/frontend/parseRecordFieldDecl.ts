import type { RecordFieldNode, SourceSpan, TypeExprNode } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { diagIfArrayLengthMissing, parseNumberLiteral, parseTypeExprFromText } from './parseImm.js';
import {
  diagInvalidBlockLine,
  formatIdentifierToken,
  topLevelStartKeyword,
} from './parseTopLevelCommon.js';
import { stripLineComment as stripComment } from './parseParserShared.js';

export type RecordFieldLine = {
  raw: string;
  startOffset: number;
  endOffset: number;
  lineNo: number;
  filePath: string;
};

type RecordFieldValidationContext = {
  file: SourceFile;
  diagnostics: Diagnostic[];
  sourcePath: string;
  isReservedTopLevelName: (name: string) => boolean;
};

type RecordFieldBlockContext = RecordFieldValidationContext & {
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

type ParsedFieldBlock = {
  fields: RecordFieldNode[];
  nextIndex: number;
  endOffset: number;
};

function parseRecordFieldDecl(
  kindName: string,
  fieldText: string,
  line: RecordFieldLine,
  fieldNamesLower: Set<string>,
  ctx: RecordFieldValidationContext,
  declaringTypeName?: string,
): RecordFieldNode | undefined {
  const { file, diagnostics, sourcePath, isReservedTopLevelName } = ctx;
  const { startOffset, endOffset, lineNo, filePath } = line;
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+(\.(?:field|byte|word|addr))(?:\s+(.+))?$/i.exec(
    fieldText,
  );
  if (!match) {
    diagInvalidBlockLine(
      diagnostics,
      filePath,
      `${kindName} field declaration`,
      fieldText,
      '<name> .field <size> or <name> .byte/.word/.addr',
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
      sourcePath,
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

  const fieldSpan = span(file, startOffset, endOffset);
  const typeExpr = match[2]!.startsWith('.')
    ? parseAsmFieldTypeExpr(match[2]!, match[3]?.trim(), fieldSpan)
    : parseTypeExprFromText(match[2]!.trim(), fieldSpan);
  if (!typeExpr) {
    const typeText = (match[3] ?? match[2] ?? '').trim();
    if (
      diagIfArrayLengthMissing(diagnostics, filePath, typeText, {
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
      '<name> .field <size> or <name> .byte/.word/.addr',
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
      `Self-referential field type "${typeExpr.name}" has no finite size; use .addr for a pointer field.`,
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

function scalarType(span: SourceSpan, name: 'byte' | 'word' | 'addr'): TypeExprNode {
  return { kind: 'TypeName' as const, span, name };
}

function parseAsmFieldTypeExpr(
  directive: string,
  operandText: string | undefined,
  fieldSpan: SourceSpan,
): TypeExprNode | undefined {
  switch (directive.toLowerCase()) {
    case '.byte':
      return operandText === undefined || operandText.length === 0
        ? scalarType(fieldSpan, 'byte')
        : undefined;
    case '.word':
      return operandText === undefined || operandText.length === 0
        ? scalarType(fieldSpan, 'word')
        : undefined;
    case '.addr':
      return operandText === undefined || operandText.length === 0
        ? scalarType(fieldSpan, 'addr')
        : undefined;
    case '.field': {
      if (operandText === undefined || operandText.length === 0) return undefined;
      const size = parseNumberLiteral(operandText);
      if (size === undefined) {
        return parseTypeExprFromText(operandText, fieldSpan);
      }
      if (size < 1) return undefined;
      if (size === 1) return scalarType(fieldSpan, 'byte');
      if (size === 2) return scalarType(fieldSpan, 'word');
      return {
        kind: 'ArrayType',
        span: fieldSpan,
        element: scalarType(fieldSpan, 'byte'),
        length: size,
      };
    }
    default:
      return undefined;
  }
}

function parseRecordFields(
  fieldKind: string,
  startIndex: number,
  ctx: RecordFieldBlockContext,
  declarationName: string,
  endKeyword: '.endtype' | '.endunion',
): ParsedRecordFields {
  const { file, lineCount, diagnostics, sourcePath, getRawLine, isReservedTopLevelName } = ctx;
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
    if (fieldTextLower === endKeyword) {
      terminated = true;
      endOffset = lineEndOffset;
      index++;
      break;
    }
    const topKeyword = topLevelStartKeyword(fieldText);
    if (topKeyword !== undefined) {
      interruptedByKeyword = topKeyword;
      interruptedByLine = lineNo;
      interruptedByFilePath = filePath;
      break;
    }

    const field = parseRecordFieldDecl(
      fieldKind,
      fieldText,
      fieldLine,
      fieldNamesLower,
      {
        file,
        diagnostics,
        sourcePath,
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
  declarationLineNo: number;
  startIndex: number;
  ctx: RecordFieldBlockContext;
}): ParsedFieldBlock {
  const { declarationKind, declarationName, fieldKind, declarationLineNo, startIndex, ctx } =
    params;
  const { file, diagnostics, sourcePath } = ctx;
  const endKeyword = declarationKind === 'type' ? '.endtype' : '.endunion';
  const parsed = parseRecordFields(fieldKind, startIndex, ctx, declarationName, endKeyword);

  if (!parsed.terminated) {
    if (
      parsed.interruptedByKeyword !== undefined &&
      parsed.interruptedByLine !== undefined &&
      parsed.interruptedByFilePath !== undefined
    ) {
      diag(
        diagnostics,
        parsed.interruptedByFilePath,
        `Unterminated ${declarationKind} "${declarationName}": expected "${endKeyword}" before "${parsed.interruptedByKeyword}"`,
        { line: parsed.interruptedByLine, column: 1 },
      );
    } else {
      diag(
        diagnostics,
        sourcePath,
        `Unterminated ${declarationKind} "${declarationName}": missing "${endKeyword}"`,
        { line: declarationLineNo, column: 1 },
      );
    }
  }

  if (parsed.fields.length === 0) {
    const declarationLabel = declarationKind === 'type' ? 'Type' : 'Union';
    diag(
      diagnostics,
      sourcePath,
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
