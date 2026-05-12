import type { ExternFuncNode, ParamNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { parseImmExprFromText } from './parseImm.js';
import {
  diagInvalidHeaderLine,
  formatIdentifierToken,
  parseReturnRegsFromText,
} from './parseModuleCommon.js';
import type { ParseParamsContext } from './parseParams.js';

type ParseExternFuncContext = {
  diagnostics: Diagnostic[];
  modulePath: string;
  parseParamsFromText: (
    filePath: string,
    paramsText: string,
    paramsSpan: SourceSpan,
    diagnostics: Diagnostic[],
    ctx: ParseParamsContext,
  ) => ParamNode[] | undefined;
} & ParseParamsContext;

export function parseExternFuncFromTail(
  tail: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  ctx: ParseExternFuncContext,
): ExternFuncNode | undefined {
  const { diagnostics, modulePath, isReservedTopLevelName, parseParamsFromText } = ctx;
  const header = tail;
  const openParen = header.indexOf('(');
  const closeParen = header.lastIndexOf(')');
  if (openParen < 0 || closeParen < openParen) {
    diagInvalidHeaderLine(
      diagnostics,
      modulePath,
      'extern func declaration',
      `func ${header}`,
      '<name>(...)[ : <retRegs> ] at <imm16>',
      lineNo,
    );
    return undefined;
  }

  const name = header.slice(0, openParen).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid extern func name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid extern func name "${name}": collides with a top-level keyword.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }

  const afterClose = header.slice(closeParen + 1).trimStart();
  const atIdx = afterClose.toLowerCase().lastIndexOf(' at ');
  if (atIdx < 0) {
    diagInvalidHeaderLine(
      diagnostics,
      modulePath,
      'extern func declaration',
      `func ${header}`,
      '<name>(...)[ : <retRegs> ] at <imm16>',
      lineNo,
    );
    return undefined;
  }

  const retTextRaw = afterClose.slice(0, atIdx).trim();
  const atText = afterClose.slice(atIdx + 4).trim();

  let returnRegs: string[] | undefined;
  if (retTextRaw.length === 0) {
    returnRegs = [];
  } else {
    if (!retTextRaw.startsWith(':')) {
      diagInvalidHeaderLine(
        diagnostics,
        modulePath,
        'extern func declaration',
        `func ${header}`,
        '<name>(...)[ : <retRegs> ] at <imm16>',
        lineNo,
      );
      return undefined;
    }
    const regText = retTextRaw.slice(1).trim();
    const parsed = parseReturnRegsFromText(regText, stmtSpan, lineNo, diagnostics, modulePath);
    if (!parsed) return undefined;
    returnRegs = parsed.regs;
  }

  const paramsText = header.slice(openParen + 1, closeParen);
  const params = parseParamsFromText(modulePath, paramsText, stmtSpan, diagnostics, {
    isReservedTopLevelName,
  });
  if (!params) return undefined;

  const at = parseImmExprFromText(modulePath, atText, stmtSpan, diagnostics);
  if (!at) return undefined;

  return {
    kind: 'ExternFunc',
    span: stmtSpan,
    name,
    params,
    returnRegs,
    at,
  };
}
