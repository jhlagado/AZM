import type { AsmInstructionNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseImmExprFromText } from './parseImm.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { ALL_REGISTER_NAMES } from './grammarData.js';
import { isAssignmentStoragePath } from './parseAssignmentInstruction.js';
import { canonicalRegisterToken, parseEaExprFromText } from './parseOperands.js';

function splitTopLevelCommaSeparated(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '(') {
      parenDepth++;
      current += ch;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(parenDepth - 1, 0);
      current += ch;
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      current += ch;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(bracketDepth - 1, 0);
      current += ch;
      continue;
    }
    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }

  parts.push(current.trim());
  return parts.filter((part) => part.length > 0);
}

function parseStepTargetOperand(
  filePath: string,
  operandText: string,
  instrSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmInstructionNode['operands'][number] | undefined {
  const text = operandText.trim();
  const canonicalRegister = canonicalRegisterToken(text);
  if (ALL_REGISTER_NAMES.has(canonicalRegister)) {
    diag(diagnostics, filePath, '"step" only accepts typed path operands in this slice', {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
    return undefined;
  }
  if (text.startsWith('(') && text.endsWith(')')) {
    diag(diagnostics, filePath, '"step" does not accept indirect memory operands', {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
    return undefined;
  }
  if (text.startsWith('@')) {
    diag(diagnostics, filePath, '"step" does not accept address-of operands', {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
    return undefined;
  }

  const ea = parseEaExprFromText(filePath, text, instrSpan, diagnostics);
  if (!ea) {
    diag(diagnostics, filePath, `Invalid "step" operand "${text}"`, {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
    return undefined;
  }
  if (!isAssignmentStoragePath(ea)) {
    diag(
      diagnostics,
      filePath,
      '"step" requires a typed storage path, not an affine address expression',
      {
        line: instrSpan.start.line,
        column: instrSpan.start.column,
      },
    );
    return undefined;
  }

  return { kind: 'Ea', span: instrSpan, expr: ea };
}

export function parseStepInstruction(
  filePath: string,
  head: 'step',
  operandText: string,
  instrSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmInstructionNode | undefined {
  const text = operandText.trim();
  const parts = splitTopLevelCommaSeparated(text);

  if (parts.length < 1 || parts.length > 2) {
    diag(diagnostics, filePath, '"step" expects a typed path operand and optional amount', {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
    return undefined;
  }

  const target = parseStepTargetOperand(filePath, parts[0] ?? '', instrSpan, diagnostics);
  if (!target) return undefined;

  if (parts.length === 1) {
    return {
      kind: 'AsmInstruction',
      span: instrSpan,
      head,
      operands: [target],
    };
  }

  const amountExpr = parseImmExprFromText(filePath, parts[1]!, instrSpan, diagnostics);
  if (!amountExpr) return undefined;

  return {
    kind: 'AsmInstruction',
    span: instrSpan,
    head,
    operands: [target, { kind: 'Imm', span: instrSpan, expr: amountExpr }],
  };
}