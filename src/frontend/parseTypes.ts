import type { SourceSpan, TypeDeclNode, UnionDeclNode } from './ast.js';
import type { SourceFile } from './source.js';
import { span } from './source.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { diagIfInferredArrayLengthNotAllowed, parseTypeExprFromText } from './parseImm.js';
import {
  diagInvalidHeaderLine,
  formatIdentifierToken,
} from './parseModuleCommon.js';
import { parseRecordFieldBlock, type RecordFieldLine } from './parseRecordFieldDecl.js';

type RawLine = RecordFieldLine;

type ParseTypeContext = {
  file: SourceFile;
  lineCount: number;
  diagnostics: Diagnostic[];
  modulePath: string;
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

export function parseTypeDecl(
  typeTail: string,
  stmtText: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  startIndex: number,
  ctx: ParseTypeContext,
  exported = false,
): ParsedTypeDecl | undefined {
  const { file, diagnostics, modulePath, isReservedTopLevelName } = ctx;
  const afterType = typeTail.trim();
  const parts = afterType.split(/\s+/, 2);
  const name = parts[0] ?? '';
  const tail = afterType.slice(name.length).trimStart();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    if (name.length > 0) {
      diag(
        diagnostics,
        modulePath,
        `Invalid type name ${formatIdentifierToken(name)}: expected <identifier>.`,
        { line: lineNo, column: 1 },
      );
    } else {
      diagInvalidHeaderLine(
        diagnostics,
        modulePath,
        'type declaration',
        stmtText,
        '<name> [<typeExpr>]',
        lineNo,
      );
    }
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid type name "${name}": collides with a top-level keyword.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }

  if (tail.length > 0) {
    const typeExpr = parseTypeExprFromText(tail, stmtSpan, { allowInferredArrayLength: false });
    if (!typeExpr) {
      if (
        diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, tail, {
          line: lineNo,
          column: 1,
        })
      ) {
        return undefined;
      }
      diagInvalidHeaderLine(
        diagnostics,
        modulePath,
        'type declaration',
        stmtText,
        '<name> [<typeExpr>]',
        lineNo,
      );
      return undefined;
    }
    return {
      node: { kind: 'TypeDecl', span: stmtSpan, name, exported, typeExpr },
      nextIndex: startIndex + 1,
    };
  }

  const record = parseRecordFieldBlock({
    declarationKind: 'type',
    declarationName: name,
    fieldKind: 'record',
    allowFuncKeywordStart: false,
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
      exported,
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
  exported = false,
): ParsedUnionDecl | undefined {
  const { file, diagnostics, modulePath, isReservedTopLevelName } = ctx;
  const name = unionTail.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    if (name.length > 0) {
      diag(
        diagnostics,
        modulePath,
        `Invalid union name ${formatIdentifierToken(name)}: expected <identifier>.`,
        { line: lineNo, column: 1 },
      );
    } else {
      diagInvalidHeaderLine(
        diagnostics,
        modulePath,
        'union declaration',
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
      modulePath,
      `Invalid union name "${name}": collides with a top-level keyword.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }

  const record = parseRecordFieldBlock({
    declarationKind: 'union',
    declarationName: name,
    fieldKind: 'union',
    allowFuncKeywordStart: true,
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
      exported,
      fields: record.fields,
    },
    nextIndex: record.nextIndex,
  };
}
