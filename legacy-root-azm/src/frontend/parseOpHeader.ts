import type { SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { diagInvalidHeaderLine, formatIdentifierToken } from './parseTopLevelCommon.js';

type ParsedOpHeader<TParam> = {
  name: string;
  params: TParam[];
  trailing: string;
};

type ParseOpHeaderOptions<TParam> = {
  header: string;
  stmtText: string;
  stmtSpan: SourceSpan;
  lineNo: number;
  diagnostics: Diagnostic[];
  sourcePath: string;
  expectedHeader: string;
  isReservedTopLevelName: (name: string) => boolean;
  parseParams: (paramsText: string) => TParam[] | undefined;
};

export function parseOpHeader<TParam>(
  options: ParseOpHeaderOptions<TParam>,
): ParsedOpHeader<TParam> | undefined {
  const {
    header,
    stmtText,
    stmtSpan: _stmtSpan,
    lineNo,
    diagnostics,
    sourcePath,
    expectedHeader,
    isReservedTopLevelName,
    parseParams,
  } = options;

  const openParen = header.indexOf('(');
  const closeParen = header.lastIndexOf(')');
  if (openParen < 0 || closeParen < openParen) {
    diagInvalidHeaderLine(diagnostics, sourcePath, 'op header', stmtText, expectedHeader, lineNo);
    return undefined;
  }

  const name = header.slice(0, openParen).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      sourcePath,
      `Invalid op name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(diagnostics, sourcePath, `Invalid op name "${name}": collides with a top-level keyword.`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }

  const paramsText = header.slice(openParen + 1, closeParen);
  const params = parseParams(paramsText);
  if (!params) return undefined;

  return {
    name,
    params,
    trailing: header.slice(closeParen + 1).trimStart(),
  };
}
