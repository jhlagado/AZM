import type {
  AlignDirectiveNode,
  BinDeclNode,
  ConstDeclNode,
  HexDeclNode,
  ImportNode,
  SourceSpan,
} from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { parseImmExprFromText } from './parseImm.js';
import { LEGACY_SECTION_DIRECTIVE_KINDS, NAMED_SECTION_KINDS } from './grammarData.js';
import { diagInvalidHeaderLine, formatIdentifierToken } from './parseModuleCommon.js';

type SimpleTopLevelContext = {
  diagnostics: Diagnostic[];
  modulePath: string;
  lineNo: number;
  text: string;
  span: SourceSpan;
  isReservedTopLevelName: (name: string) => boolean;
};

export function parseImportDecl(
  importTail: string,
  ctx: SimpleTopLevelContext,
): ImportNode | undefined {
  const { diagnostics, modulePath, lineNo, text, span } = ctx;
  const spec = importTail.trim();
  if (spec.startsWith('"') && spec.endsWith('"') && spec.length >= 2) {
    return {
      kind: 'Import',
      span,
      specifier: spec.slice(1, -1),
      form: 'path',
    };
  }
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(spec)) {
    return {
      kind: 'Import',
      span,
      specifier: spec,
      form: 'moduleId',
    };
  }
  diagInvalidHeaderLine(
    diagnostics,
    modulePath,
    'import statement',
    text,
    '"<path>.zax" or <moduleId>',
    lineNo,
  );
  return undefined;
}

export function parseSectionDirectiveDecl(
  rest: string,
  sectionTail: string | undefined,
  ctx: SimpleTopLevelContext,
): void {
  const { diagnostics, modulePath, lineNo, text, span: _span } = ctx;
  const decl = rest === 'section' ? '' : (sectionTail ?? '');
  const legacyTail = /^(.*?)\s+at\s+(.+)$/.exec(decl);
  const sectionToken = (legacyTail?.[1] ?? decl).trim().toLowerCase();
  const atText = legacyTail?.[2]?.trim();
  if (!LEGACY_SECTION_DIRECTIVE_KINDS.has(sectionToken) || (legacyTail && !atText)) {
    diagInvalidHeaderLine(
      diagnostics,
      modulePath,
      'section directive',
      text,
      '<code|data|var> [at <imm16>]',
      lineNo,
    );
    return undefined;
  }

  const section = sectionToken as 'code' | 'data' | 'var';
  diag(
    diagnostics,
    modulePath,
    `Legacy active-counter section directive "section ${section}${atText ? ' at ...' : ''}" is removed; use a named section like "section ${section === 'var' ? 'data' : section} <name>${atText ? ' at ...' : ''}" instead.`,
    { line: lineNo, column: 1 },
  );
  return undefined;
}
export function parseAlignDirectiveDecl(
  rest: string,
  alignTail: string | undefined,
  ctx: SimpleTopLevelContext,
): AlignDirectiveNode | undefined {
  const { diagnostics, modulePath, lineNo, text, span } = ctx;
  const exprText = rest === 'align' ? '' : (alignTail ?? '');
  if (exprText.length === 0) {
    diagInvalidHeaderLine(diagnostics, modulePath, 'align directive', text, '<imm16>', lineNo);
    return undefined;
  }
  const value = parseImmExprFromText(modulePath, exprText, span, diagnostics);
  if (!value) return undefined;
  return { kind: 'Align', span, value };
}

export function parseConstDecl(
  constTail: string,
  exported: boolean,
  ctx: SimpleTopLevelContext,
): ConstDeclNode | undefined {
  const { diagnostics, modulePath, lineNo, text, span, isReservedTopLevelName } = ctx;
  const eq = constTail.indexOf('=');
  if (eq < 0) {
    diagInvalidHeaderLine(
      diagnostics,
      modulePath,
      'const declaration',
      text,
      '<name> = <imm>',
      lineNo,
    );
    return undefined;
  }

  const name = constTail.slice(0, eq).trim();
  const rhs = constTail.slice(eq + 1).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid const name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid const name "${name}": collides with a top-level keyword.`,
      {
        line: lineNo,
        column: 1,
      },
    );
    return undefined;
  }
  if (rhs.length === 0) {
    diag(diagnostics, modulePath, `Invalid const declaration: missing initializer`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }

  const expr = parseImmExprFromText(modulePath, rhs, span, diagnostics);
  if (!expr) return undefined;

  return {
    kind: 'ConstDecl',
    span,
    name,
    exported,
    value: expr,
  };
}

export function parseBinDecl(binTail: string, ctx: SimpleTopLevelContext): BinDeclNode | undefined {
  const { diagnostics, modulePath, lineNo, text, span, isReservedTopLevelName } = ctx;
  const m = /^(\S+)\s+in\s+(\S+)\s+from\s+(.+)$/.exec(binTail.trim());
  if (!m) {
    diagInvalidHeaderLine(
      diagnostics,
      modulePath,
      'bin declaration',
      text,
      '<name> in <code|data> from "<path>"',
      lineNo,
    );
    return undefined;
  }
  const name = m[1]!;
  const sectionText = m[2]!.toLowerCase();
  const pathText = m[3]!.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid bin name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (sectionText === 'var') {
    diag(diagnostics, modulePath, `bin declarations cannot target section "var"`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }
  if (!NAMED_SECTION_KINDS.has(sectionText)) {
    diag(diagnostics, modulePath, `Invalid bin section "${m[2]!}": expected "code" or "data".`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid bin name "${name}": collides with a top-level keyword.`,
      {
        line: lineNo,
        column: 1,
      },
    );
    return undefined;
  }
  if (!(pathText.startsWith('"') && pathText.endsWith('"') && pathText.length >= 2)) {
    diag(diagnostics, modulePath, `Invalid bin declaration: expected quoted source path`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }
  return {
    kind: 'BinDecl',
    span,
    name,
    section: sectionText as BinDeclNode['section'],
    fromPath: pathText.slice(1, -1),
  };
}

export function parseHexDecl(hexTail: string, ctx: SimpleTopLevelContext): HexDeclNode | undefined {
  const { diagnostics, modulePath, lineNo, text, span, isReservedTopLevelName } = ctx;
  const m = /^(\S+)\s+from\s+(.+)$/.exec(hexTail.trim());
  if (!m) {
    diagInvalidHeaderLine(
      diagnostics,
      modulePath,
      'hex declaration',
      text,
      '<name> from "<path>"',
      lineNo,
    );
    return undefined;
  }
  const name = m[1]!;
  const pathText = m[2]!.trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid hex name ${formatIdentifierToken(name)}: expected <identifier>.`,
      { line: lineNo, column: 1 },
    );
    return undefined;
  }
  if (isReservedTopLevelName(name)) {
    diag(
      diagnostics,
      modulePath,
      `Invalid hex name "${name}": collides with a top-level keyword.`,
      {
        line: lineNo,
        column: 1,
      },
    );
    return undefined;
  }
  if (!(pathText.startsWith('"') && pathText.endsWith('"') && pathText.length >= 2)) {
    diag(diagnostics, modulePath, `Invalid hex declaration: expected quoted source path`, {
      line: lineNo,
      column: 1,
    });
    return undefined;
  }
  return {
    kind: 'HexDecl',
    span,
    name,
    fromPath: pathText.slice(1, -1),
  };
}
