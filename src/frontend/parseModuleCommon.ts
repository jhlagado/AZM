import type { SourceSpan, VarDeclInitializerNode, VarDeclNode } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import {
  diagIfInferredArrayLengthNotAllowed,
  parseImmExprFromText,
  parseTypeExprFromText,
} from './parseImm.js';
import { parseEaExprFromText } from './parseOperands.js';
import { LEGACY_RETURN_KEYWORDS, RETURN_REGISTERS, TOP_LEVEL_KEYWORDS } from './grammarData.js';

export { TOP_LEVEL_KEYWORDS } from './grammarData.js';

export const malformedTopLevelHeaderExpectations: ReadonlyArray<{
  keyword: string;
  kind: string;
  expected: string;
}> = [
  { keyword: 'import', kind: 'import statement', expected: '"<path>.zax" or <moduleId>' },
  { keyword: 'type', kind: 'type declaration', expected: '<name> [<typeExpr>]' },
  { keyword: 'union', kind: 'union declaration', expected: '<name>' },
  { keyword: 'globals', kind: 'globals declaration', expected: 'globals' },
  { keyword: 'var', kind: 'globals declaration', expected: 'globals' },
  { keyword: 'func', kind: 'func header', expected: '<name>(...)[ : <retRegs> ]' },
  { keyword: 'op', kind: 'op header', expected: '<name>(...)' },
  {
    keyword: 'extern',
    kind: 'extern declaration',
    expected: '[<baseName>] or func <name>(...)[ : <retRegs> ] at <imm16>',
  },
  { keyword: 'enum', kind: 'enum declaration', expected: '<name> <member>[, ...]' },
  { keyword: 'section', kind: 'section directive', expected: '<code|data|var> [at <imm16>]' },
  { keyword: 'align', kind: 'align directive', expected: '<imm16>' },
  { keyword: 'const', kind: 'const declaration', expected: '<name> = <imm>' },
  { keyword: 'bin', kind: 'bin declaration', expected: '<name> in <code|data> from "<path>"' },
  { keyword: 'hex', kind: 'hex declaration', expected: '<name> from "<path>"' },
  { keyword: 'data', kind: 'data declaration', expected: 'data' },
];

export const unsupportedExportTargetKind: Readonly<Partial<Record<string, string>>> = {
  import: 'import statements',
  type: 'type declarations',
  union: 'union declarations',
  globals: 'globals declarations',
  var: 'legacy "var" declarations (use "globals")',
  extern: 'extern declarations',
  enum: 'enum declarations',
  section: 'section directives',
  align: 'align directives',
  bin: 'bin declarations',
  hex: 'hex declarations',
  data: 'data declarations',
};

export function consumeKeywordPrefix(input: string, keyword: string): string | undefined {
  const match = new RegExp(`^${keyword}(?:\\s+(.*))?$`, 'i').exec(input);
  if (!match) return undefined;
  return (match[1] ?? '').trimStart();
}

export function topLevelStartKeyword(t: string): string | undefined {
  const exportTail = consumeKeywordPrefix(t, 'export');
  const w = exportTail !== undefined ? exportTail : t;
  const keyword = (w.split(/\s/, 1)[0] ?? '').toLowerCase();
  return TOP_LEVEL_KEYWORDS.has(keyword) ? keyword : undefined;
}

export function isTopLevelStart(t: string): boolean {
  return topLevelStartKeyword(t) !== undefined;
}

export function consumeTopKeyword(input: string, keyword: string): string | undefined {
  return consumeKeywordPrefix(input, keyword);
}

export function looksLikeKeywordBodyDeclLine(lineText: string): boolean {
  const t = lineText.trim();
  let depth = 0;
  let colon = -1;
  for (let index = 0; index < t.length; index++) {
    const ch = t[index];
    if (ch === '(') depth++;
    else if (ch === ')' && depth > 0) depth--;
    else if (ch === ':' && depth === 0) {
      colon = index;
      break;
    }
  }
  if (colon <= 0) return false;
  const beforeColon = t.slice(0, colon).trim();
  if (/^func\s+[A-Za-z_][A-Za-z0-9_]*\s*\([^)]*\)\s*$/i.test(beforeColon)) return false;
  return /^[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z_][A-Za-z0-9_]*(\s*\([^)]*\))?\s*$/.test(beforeColon);
}

function quoteDiagLineText(text: string): string {
  const trimmed = text.trim();
  const preview = trimmed.length > 96 ? `${trimmed.slice(0, 93)}...` : trimmed;
  return preview.replace(/"/g, '\\"');
}

export function diagInvalidBlockLine(
  diagnostics: Diagnostic[],
  modulePath: string,
  kind: string,
  lineText: string,
  expected: string,
  line: number,
): void {
  const q = quoteDiagLineText(lineText);
  diag(diagnostics, modulePath, `Invalid ${kind} line "${q}": expected ${expected}`, {
    line,
    column: 1,
  });
}

export function diagInvalidHeaderLine(
  diagnostics: Diagnostic[],
  modulePath: string,
  kind: string,
  lineText: string,
  expected: string,
  line: number,
): void {
  const q = quoteDiagLineText(lineText);
  diag(diagnostics, modulePath, `Invalid ${kind} line "${q}": expected ${expected}`, {
    line,
    column: 1,
  });
}

export function formatIdentifierToken(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.length === 0) return '<empty>';
  return `"${trimmed.replace(/"/g, '\\"')}"`;
}

export function parseReturnRegsFromText(
  text: string,
  stmtSpan: SourceSpan,
  lineNo: number,
  diagnostics: Diagnostic[],
  modulePath: string,
): { regs: string[] } | undefined {
  const body = text.trim();
  const tokens = body
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return { regs: [] };

  const seen = new Set<string>();
  for (const t of tokens) {
    const upper = t.toUpperCase();
    if (LEGACY_RETURN_KEYWORDS.has(upper)) {
      diag(
        diagnostics,
        modulePath,
        `Legacy return keyword "${t}" is not supported; declare explicit registers (e.g., omit ":" for no returns, or use HL/DE/BC/AF list).`,
        { line: lineNo, column: 1 },
      );
      return undefined;
    }
    if (!RETURN_REGISTERS.has(upper)) {
      diag(diagnostics, modulePath, `Invalid return register "${t}": expected HL, DE, BC, or AF.`, {
        line: lineNo,
        column: 1,
      });
      return undefined;
    }
    if (seen.has(upper)) {
      diag(diagnostics, modulePath, `Duplicate return register "${t}".`, {
        line: lineNo,
        column: 1,
      });
      return undefined;
    }
    seen.add(upper);
  }
  return { regs: [...seen] };
}

type ParseVarDeclLineContext = {
  diagnostics: Diagnostic[];
  modulePath: string;
  isReservedTopLevelName: (name: string) => boolean;
};

export function parseVarDeclLine(
  lineText: string,
  declSpan: SourceSpan,
  lineNo: number,
  scope: 'globals' | 'var',
  ctx: ParseVarDeclLineContext,
): VarDeclNode | undefined {
  const { diagnostics, modulePath, isReservedTopLevelName: _isReservedTopLevelName } = ctx;
  const declKind = scope === 'globals' ? 'globals declaration' : 'var declaration';
  const raw = lineText.trim();
  const valueOrAliasExpected = '<name>: <type>';

  const aliasMatch = /^([^:=]+?)\s*=\s*(.+)$/.exec(raw);
  if (aliasMatch && !aliasMatch[1]!.includes(':')) {
    const name = aliasMatch[1]!.trim();
    const rhsText = aliasMatch[2]!.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      diag(
        diagnostics,
        modulePath,
        `Invalid ${scope} declaration name ${formatIdentifierToken(name)}: expected <identifier>.`,
        { line: lineNo, column: 1 },
      );
      return undefined;
    }
    if (TOP_LEVEL_KEYWORDS.has(name.toLowerCase())) {
      diag(
        diagnostics,
        modulePath,
        `Invalid ${scope} declaration name "${name}": collides with a top-level keyword.`,
        { line: lineNo, column: 1 },
      );
      return undefined;
    }
    if (scope === 'var' && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(rhsText)) {
      diag(
        diagnostics,
        modulePath,
        `Function-local alias "${name}" must target a direct module-scope storage name.`,
        { line: lineNo, column: 1 },
      );
      return undefined;
    }
    const rhsEa = parseEaExprFromText(modulePath, rhsText, declSpan, diagnostics);
    if (!rhsEa) {
      diag(
        diagnostics,
        modulePath,
        `Incompatible inferred alias binding for "${name}": expected address expression on right-hand side.`,
        { line: lineNo, column: 1 },
      );
      return undefined;
    }
    const initializer: VarDeclInitializerNode = {
      kind: 'VarInitAlias',
      span: declSpan,
      expr: rhsEa,
    };
    return { kind: 'VarDecl', form: 'alias', span: declSpan, name, initializer };
  }

  const typedMatch = /^([^:]+)\s*:\s*(.+)$/.exec(raw);
  if (!typedMatch) {
    diagInvalidBlockLine(diagnostics, modulePath, declKind, raw, valueOrAliasExpected, lineNo);
    return undefined;
  }

  const name = typedMatch[1]!.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid ${scope} declaration name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (TOP_LEVEL_KEYWORDS.has(name.toLowerCase())) {
    diag(
      diagnostics,
      modulePath,
      `Invalid ${scope} declaration name "${name}": collides with a top-level keyword.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }

  const typeAndInitText = typedMatch[2]!.trim();
  const eqIdx = typeAndInitText.indexOf('=');
  const typeText = (eqIdx >= 0 ? typeAndInitText.slice(0, eqIdx) : typeAndInitText).trim();
  const initText = (eqIdx >= 0 ? typeAndInitText.slice(eqIdx + 1) : '').trim();
  const typeExpr = parseTypeExprFromText(typeText, declSpan, {
    allowInferredArrayLength: false,
  });
  if (!typeExpr) {
    if (
      diagIfInferredArrayLengthNotAllowed(diagnostics, modulePath, typeText, {
        line: lineNo,
        column: 1,
      })
    ) {
      return undefined;
    }
    diagInvalidBlockLine(diagnostics, modulePath, declKind, raw, valueOrAliasExpected, lineNo);
    return undefined;
  }

  if (eqIdx < 0) {
    return { kind: 'VarDecl', form: 'typed', span: declSpan, name, typeExpr };
  }

  const valueExpr = parseImmExprFromText(modulePath, initText, declSpan, diagnostics, false);
  if (!valueExpr) {
    const aliasLike = parseEaExprFromText(modulePath, initText, declSpan, diagnostics);
    if (aliasLike) {
      if (scope === 'globals') {
        diag(
          diagnostics,
          modulePath,
          `Unsupported typed alias form for "${name}": use "${name} = ${initText}" for alias initialization.`,
          { line: lineNo, column: 1 },
        );
      } else {
        diag(
          diagnostics,
          modulePath,
          `Invalid local constant initializer for "${name}": expected compile-time immediate expression.`,
          { line: lineNo, column: 1 },
        );
      }
      return undefined;
    }
    diagInvalidBlockLine(diagnostics, modulePath, declKind, raw, valueOrAliasExpected, lineNo);
    return undefined;
  }

  const initializer: VarDeclInitializerNode = {
    kind: 'VarInitValue',
    span: declSpan,
    expr: valueExpr,
  };
  return { kind: 'VarDecl', form: 'typed', span: declSpan, name, typeExpr, initializer };
}
