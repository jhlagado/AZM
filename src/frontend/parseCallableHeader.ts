import type { SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { diagInvalidHeaderLine, formatIdentifierToken } from './parseModuleCommon.js';

export type ParsedCallableHeader<TParam> = {
  name: string;
  params: TParam[];
  trailing: string;
};

type ParseCallableHeaderOptions<TParam> = {
  kind: 'func' | 'op';
  header: string;
  stmtText: string;
  stmtSpan: SourceSpan;
  lineNo: number;
  diagnostics: Diagnostic[];
  modulePath: string;
  expectedHeader: string;
  isReservedTopLevelName: (name: string) => boolean;
  parseParams: (paramsText: string) => TParam[] | undefined;
};

export function parseCallableHeader<TParam>(
  options: ParseCallableHeaderOptions<TParam>,
): ParsedCallableHeader<TParam> | undefined {
  const {
    kind,
    header,
    stmtText,
    stmtSpan: _stmtSpan,
    lineNo,
    diagnostics,
    modulePath,
    expectedHeader,
    isReservedTopLevelName,
    parseParams,
  } = options;

  const openParen = header.indexOf('(');
  const closeParen = header.lastIndexOf(')');
  if (openParen < 0 || closeParen < openParen) {
    diagInvalidHeaderLine(diagnostics, modulePath, `${kind} header`, stmtText, expectedHeader, lineNo);
    return undefined;
  }

  const name = header.slice(0, openParen).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid ${kind} name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid ${kind} name "${name}": collides with a top-level keyword.`,
      {
        line: lineNo,
        column: 1,
      },
    );
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
