import type { SourceSpan, TypeDeclNode, UnionDeclNode } from './ast.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import {
  diagInvalidHeaderLine,
  formatIdentifierToken,
} from './parseTopLevelCommon.js';
import { parseRecordFieldBlock, type RecordFieldLine } from './parseRecordFieldDecl.js';

type RawLine = RecordFieldLine;

type ParseTypeContext = {
  file: SourceFile;
  lineCount: number;
  diagnostics: Diagnostic[];
  sourcePath: string;
  getRawLine: (lineIndex: number) => RawLine;
  isReservedTopLevelName: (name: string) => boolean;
};

type ParsedTypeDecl = {
  node: TypeDeclNode;
  nextIndex: number;
};

type ParsedUnionDecl = {
  node: UnionDeclNode;
  nextIndex: number;
};

function parseLayoutDeclName(
  declarationKind: 'type' | 'union',
  name: string,
  stmtText: string,
  lineNo: number,
  ctx: ParseTypeContext,
): string | undefined {
  const { diagnostics, sourcePath, isReservedTopLevelName } = ctx;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    if (name.length > 0) {
      diag(
        diagnostics,
        sourcePath,
        `Invalid ${declarationKind} name ${formatIdentifierToken(name)}: expected <identifier>.`,
        { line: lineNo, column: 1 },
      );
    } else {
      diagInvalidHeaderLine(
        diagnostics,
        sourcePath,
        `${declarationKind} declaration`,
        stmtText,
        '<name>',
        lineNo,
      );
    }
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      sourcePath,
      `Invalid ${declarationKind} name "${name}": collides with a top-level keyword.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  return name;
}

export function parseTypeDecl(
  typeTail: string,
  stmtText: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  startIndex: number,
  ctx: ParseTypeContext,
): ParsedTypeDecl | undefined {
  const { file, diagnostics, sourcePath } = ctx;
  const afterType = typeTail.trim();
  const parts = afterType.split(/\s+/, 2);
  const name = parseLayoutDeclName('type', parts[0] ?? '', stmtText, lineNo, ctx);
  if (!name) return undefined;
  const tail = afterType.slice(name.length).trimStart();

  if (tail.length > 0) {
    diagInvalidHeaderLine(
      diagnostics,
      sourcePath,
      'type declaration',
      stmtText,
      '<name>',
      lineNo,
    );
    return undefined;
  }

  const record = parseRecordFieldBlock({
    declarationKind: 'type',
    declarationName: name,
    fieldKind: 'record',
    declarationLineNo: lineNo,
    startIndex: startIndex + 1,
    ctx,
  });

  const typeEnd = record.endOffset;
  const typeSpan = span(file, stmtSpan.start.offset, typeEnd);
  return {
    node: {
      kind: 'TypeDecl',
      span: typeSpan,
      name,
      typeExpr: { kind: 'RecordType', span: typeSpan, fields: record.fields },
    },
    nextIndex: record.nextIndex,
  };
}

export function parseUnionDecl(
  unionTail: string,
  stmtText: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  startIndex: number,
  ctx: ParseTypeContext,
): ParsedUnionDecl | undefined {
  const { file } = ctx;
  const name = parseLayoutDeclName('union', unionTail.trim(), stmtText, lineNo, ctx);
  if (!name) return undefined;

  const record = parseRecordFieldBlock({
    declarationKind: 'union',
    declarationName: name,
    fieldKind: 'union',
    declarationLineNo: lineNo,
    startIndex: startIndex + 1,
    ctx,
  });

  const unionEnd = record.endOffset;
  return {
    node: {
      kind: 'UnionDecl',
      span: span(file, stmtSpan.start.offset, unionEnd),
      name,
      fields: record.fields,
    },
    nextIndex: record.nextIndex,
  };
}
