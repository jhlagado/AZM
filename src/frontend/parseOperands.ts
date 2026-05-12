import type {
  AsmOperandNode,
  EaExprNode,
  EaIndexNode,
  SourceSpan,
} from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { DiagnosticIds } from '../diagnosticTypes.js';
import {
  immLiteral,
  parseImmExprFromText,
  parseNumberLiteral,
  parseTypeExprFromText,
} from './parseImm.js';
import { parseDiag as diag, parseDiagAtWithId } from './parseDiagnostics.js';
import {
  ALL_REGISTER_NAMES,
  INDEX_MEM_BASE_REGISTERS,
  INDEX_REG16_NAMES,
  INDEX_REG8_NAMES,
  TYPED_REINTERPRET_BASE_REGISTERS,
} from './grammarData.js';

function parseBalancedContent(
  text: string,
  open: '[' | '(',
  close: ']' | ')',
): { inside: string; rest: string } | undefined {
  if (!text.startsWith(open)) return undefined;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === open) {
      depth++;
      continue;
    }
    if (ch !== close) continue;
    depth--;
    if (depth === 0) {
      return {
        inside: text.slice(1, i),
        rest: text.slice(i + 1),
      };
    }
    if (depth < 0) return undefined;
  }
  return undefined;
}

function parseBalancedBracketContent(text: string): { inside: string; rest: string } | undefined {
  return parseBalancedContent(text, '[', ']');
}

function parseBalancedParenContent(text: string): { inside: string; rest: string } | undefined {
  return parseBalancedContent(text, '(', ')');
}

export function canonicalRegisterToken(token: string): string {
  if (/^af'$/i.test(token)) return "AF'";
  return token.toUpperCase();
}

type ParsedEaSegments = {
  expr: EaExprNode;
  rest: string;
  sawSegment: boolean;
};

function parseEaSegments(
  filePath: string,
  expr: EaExprNode,
  initialRest: string,
  exprSpan: SourceSpan,
  diagnostics: Diagnostic[],
): ParsedEaSegments | undefined {
  let rest = initialRest.trimStart();
  let sawSegment = false;

  while (rest.length > 0) {
    if (rest.startsWith('.')) {
      const m = /^\.([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
      if (!m) return undefined;
      expr = { kind: 'EaField', span: exprSpan, base: expr, field: m[1]! };
      rest = rest.slice(m[0].length).trimStart();
      sawSegment = true;
      continue;
    }
    if (rest.startsWith('[')) {
      const bracket = parseBalancedBracketContent(rest);
      if (!bracket) return undefined;
      const index = parseEaIndexFromText(filePath, bracket.inside, exprSpan, diagnostics);
      if (!index) return undefined;
      expr = { kind: 'EaIndex', span: exprSpan, base: expr, index };
      rest = bracket.rest.trimStart();
      sawSegment = true;
      continue;
    }
    break;
  }

  return { expr, rest, sawSegment };
}

function parseTypedReinterpretBaseAtom(
  text: string,
  exprSpan: SourceSpan,
): { base: EaExprNode; rest: string } | undefined {
  const tokenMatch = /^([A-Za-z_][A-Za-z0-9_']*)/.exec(text);
  if (!tokenMatch) return undefined;

  const token = tokenMatch[1]!;
  const canonical = canonicalRegisterToken(token);
  if (TYPED_REINTERPRET_BASE_REGISTERS.has(canonical)) {
    return {
      base: { kind: 'EaName', span: exprSpan, name: canonical },
      rest: text.slice(token.length).trimStart(),
    };
  }

  if (ALL_REGISTER_NAMES.has(canonical)) return undefined;
  return {
    base: { kind: 'EaName', span: exprSpan, name: token },
    rest: text.slice(token.length).trimStart(),
  };
}

function parseTypedReinterpretBase(
  filePath: string,
  text: string,
  exprSpan: SourceSpan,
  diagnostics: Diagnostic[],
): { base: EaExprNode; rest: string } | undefined {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('(')) {
    return parseTypedReinterpretBaseAtom(trimmed, exprSpan);
  }

  const grouped = parseBalancedParenContent(trimmed);
  if (!grouped) return undefined;
  const inner = grouped.inside.trim();
  const atom = parseTypedReinterpretBaseAtom(inner, exprSpan);
  if (!atom) return undefined;
  const opMatch = /^([+-])\s*(.+)$/.exec(atom.rest);
  if (!opMatch) return undefined;
  const offset = parseImmExprFromText(filePath, opMatch[2]!, exprSpan, diagnostics, false);
  if (!offset) return undefined;

  return {
    base:
      opMatch[1] === '+'
        ? { kind: 'EaAdd', span: exprSpan, base: atom.base, offset }
        : { kind: 'EaSub', span: exprSpan, base: atom.base, offset },
    rest: grouped.rest.trimStart(),
  };
}

function parseTypedReinterpretHead(
  filePath: string,
  text: string,
  exprSpan: SourceSpan,
  diagnostics: Diagnostic[],
): { expr: EaExprNode; rest: string } | undefined {
  if (!text.startsWith('<')) return undefined;
  const closeIndex = text.indexOf('>');
  if (closeIndex <= 1) return undefined;

  const typeText = text.slice(1, closeIndex).trim();
  const typeExpr = parseTypeExprFromText(typeText, exprSpan, {
    allowInferredArrayLength: false,
  });
  if (!typeExpr) return undefined;

  const parsedBase = parseTypedReinterpretBase(
    filePath,
    text.slice(closeIndex + 1),
    exprSpan,
    diagnostics,
  );
  if (!parsedBase) return undefined;

  const segments = parseEaSegments(
    filePath,
    { kind: 'EaReinterpret', span: exprSpan, typeExpr, base: parsedBase.base },
    parsedBase.rest,
    exprSpan,
    diagnostics,
  );
  if (!segments || !segments.sawSegment) return undefined;
  return { expr: segments.expr, rest: segments.rest };
}

export function parseEaIndexFromText(
  filePath: string,
  indexText: string,
  indexSpan: SourceSpan,
  diagnostics: Diagnostic[],
): EaIndexNode | undefined {
  const t = indexText.trim();
  if (t.startsWith('(') && t.endsWith(')')) {
    const inner = t.slice(1, -1).trim();
    const innerCanonical = canonicalRegisterToken(inner);
    if (innerCanonical === 'HL') return { kind: 'IndexMemHL', span: indexSpan };

    const ixiy = /^([A-Za-z_][A-Za-z0-9_']*)(?:\s*([+-])\s*(.+))?$/i.exec(inner);
    if (ixiy) {
      const baseToken = canonicalRegisterToken(ixiy[1]!);
      if (INDEX_MEM_BASE_REGISTERS.has(baseToken)) {
        const base = baseToken as 'IX' | 'IY';
        const dispText = ixiy[2] ? `${ixiy[2]}${ixiy[3]?.trim() ?? ''}` : '';
        const disp =
          dispText.length > 0
            ? parseImmExprFromText(filePath, dispText, indexSpan, diagnostics, false)
            : undefined;
        if (dispText.length > 0 && !disp) {
          diag(diagnostics, filePath, `Invalid index expression: ${t}`, {
            line: indexSpan.start.line,
            column: indexSpan.start.column,
          });
          return undefined;
        }
        return { kind: 'IndexMemIxIy', span: indexSpan, base, ...(disp ? { disp } : {}) };
      }
    }

    if (!/[A-Za-z_]/.test(inner)) {
      const grouped = parseImmExprFromText(filePath, inner, indexSpan, diagnostics, false);
      if (grouped) {
        parseDiagAtWithId(
          diagnostics,
          indexSpan.file,
          DiagnosticIds.IndexParenRedundant,
          'warning',
          `Redundant outer parentheses in constant index expression "${t}".`,
          { line: indexSpan.start.line, column: indexSpan.start.column },
        );
      }
    }
  }

  const reg = canonicalRegisterToken(t);
  if (INDEX_REG16_NAMES.has(reg)) return { kind: 'IndexReg16', span: indexSpan, reg };
  if (INDEX_REG8_NAMES.has(reg)) return { kind: 'IndexReg8', span: indexSpan, reg };

  const imm = parseImmExprFromText(filePath, t, indexSpan, diagnostics, false);
  if (imm) return { kind: 'IndexImm', span: indexSpan, value: imm };

  const ea = parseEaExprFromText(filePath, t, indexSpan, diagnostics);
  if (ea) return { kind: 'IndexEa', span: indexSpan, expr: ea };

  diag(diagnostics, filePath, `Invalid index expression: ${t}`, {
    line: indexSpan.start.line,
    column: indexSpan.start.column,
  });
  return undefined;
}

export function parseEaExprFromText(
  filePath: string,
  exprText: string,
  exprSpan: SourceSpan,
  diagnostics: Diagnostic[],
): EaExprNode | undefined {
  let rest = exprText.trim();
  let expr: EaExprNode;

  const reinterpret = parseTypedReinterpretHead(filePath, rest, exprSpan, diagnostics);
  if (reinterpret) {
    expr = reinterpret.expr;
    rest = reinterpret.rest;
  } else {
    const baseMatch = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(rest);
    if (!baseMatch) return undefined;
    expr = { kind: 'EaName', span: exprSpan, name: baseMatch[1]! };
    rest = rest.slice(baseMatch[0].length).trimStart();

    const segments = parseEaSegments(filePath, expr, rest, exprSpan, diagnostics);
    if (!segments) return undefined;
    expr = segments.expr;
    rest = segments.rest;
  }

  if (rest.length > 0) {
    const m = /^([+-])\s*(.+)$/.exec(rest);
    if (!m) return undefined;
    const off = parseImmExprFromText(filePath, m[2]!, exprSpan, diagnostics);
    if (!off) return undefined;
    expr =
      m[1] === '+'
        ? { kind: 'EaAdd', span: exprSpan, base: expr, offset: off }
        : { kind: 'EaSub', span: exprSpan, base: expr, offset: off };
    rest = '';
  }

  return rest.length === 0 ? expr : undefined;
}

export function parseAsmOperand(
  filePath: string,
  operandText: string,
  operandSpan: SourceSpan,
  diagnostics: Diagnostic[],
  emitDiagnostics = true,
): AsmOperandNode | undefined {
  const t = operandText.trim();
  if (t.length === 0) return undefined;

  if (t.startsWith('@')) {
    const placeText = t.slice(1).trim();
    if (placeText.length === 0) {
      diag(diagnostics, filePath, `Invalid address-of target "${t}": expected @<place>.`, {
        line: operandSpan.start.line,
        column: operandSpan.start.column,
      });
      return undefined;
    }
    const ea = parseEaExprFromText(filePath, placeText, operandSpan, diagnostics);
    if (ea) return { kind: 'Ea', span: operandSpan, expr: ea, explicitAddressOf: true };
    diag(diagnostics, filePath, `Invalid address-of target "${t}": expected @<place>.`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
    return undefined;
  }

  const canonicalRegister = canonicalRegisterToken(t);
  if (ALL_REGISTER_NAMES.has(canonicalRegister)) {
    return { kind: 'Reg', span: operandSpan, name: canonicalRegister };
  }

  const n = parseNumberLiteral(t);
  if (n !== undefined) {
    return { kind: 'Imm', span: operandSpan, expr: immLiteral(filePath, operandSpan, n) };
  }

  if (t.startsWith('(') && t.endsWith(')')) {
    const inner = t.slice(1, -1).trim();
    // Classic Z80 register-indirect memory `(hl)` / `(bc)` / `(de)` — not `EaName` for a symbol
    // spelled "hl" (see #1356). Aligns with `parseEaIndexFromText` treating `(hl)` as `IndexMemHL`.
    const classicMemIndirect = /^(hl|bc|de)$/i.exec(inner);
    if (classicMemIndirect) {
      const name = canonicalRegisterToken(classicMemIndirect[1]!);
      return {
        kind: 'Mem',
        span: operandSpan,
        expr: { kind: 'EaName', span: operandSpan, name },
      };
    }
    const ea = parseEaExprFromText(filePath, inner, operandSpan, diagnostics);
    if (ea) return { kind: 'Mem', span: operandSpan, expr: ea };
    const imm = parseImmExprFromText(filePath, inner, operandSpan, diagnostics, emitDiagnostics);
    if (imm) {
      return {
        kind: 'Mem',
        span: operandSpan,
        expr: { kind: 'EaImm', span: operandSpan, expr: imm },
      };
    }
  }
  if (t.includes('.') || t.includes('[')) {
    const ea = parseEaExprFromText(filePath, t, operandSpan, diagnostics);
    if (ea) return { kind: 'Ea', span: operandSpan, expr: ea };
  }

  const expr = parseImmExprFromText(filePath, t, operandSpan, diagnostics, emitDiagnostics);
  if (expr) {
    return { kind: 'Imm', span: operandSpan, expr };
  }
  if (t.startsWith("'")) return undefined;

  if (emitDiagnostics) {
    diag(diagnostics, filePath, `Unsupported operand: ${t}`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
  }
  return undefined;
}
