import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseImmExprFromText } from './parseImm.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { parseAssignmentInstruction } from './parseAssignmentInstruction.js';
import { parseAsmOperand } from './parseOperands.js';
import { parseStepInstruction } from './parseStepInstruction.js';

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

export function parseAsmInstruction(
  filePath: string,
  text: string,
  instrSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmInstructionNode | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.includes(':=')) {
    return parseAssignmentInstruction(filePath, trimmed, instrSpan, diagnostics);
  }
  const firstSpace = trimmed.search(/\s/);
  const head = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
  const headLower = head.toLowerCase();
  const rest = firstSpace === -1 ? '' : trimmed.slice(firstSpace).trim();

  if (headLower === 'step') {
    return parseStepInstruction(filePath, headLower, rest, instrSpan, diagnostics);
  }

  if (headLower === 'move') {
    diag(diagnostics, filePath, `"move" has been removed; use ":=".`, {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
    return undefined;
  }

  const operands: AsmOperandNode[] = [];
  if (rest.length > 0) {
    const parseInOutOperand = (operandText: string): AsmOperandNode | undefined => {
      const t = operandText.trim();
      if (t.startsWith('(') && t.endsWith(')')) {
        const inner = t.slice(1, -1).trim();
        if (/^c$/i.test(inner)) return { kind: 'PortC', span: instrSpan };
        const expr = parseImmExprFromText(filePath, inner, instrSpan, diagnostics);
        if (expr) return { kind: 'PortImm8', span: instrSpan, expr };
      }
      return parseAsmOperand(filePath, t, instrSpan, diagnostics);
    };

    const parts = splitTopLevelCommaSeparated(rest);
    for (const part of parts) {
      const opNode =
        headLower === 'in' || headLower === 'out'
          ? parseInOutOperand(part)
          : parseAsmOperand(filePath, part, instrSpan, diagnostics);
      if (opNode) operands.push(opNode);
    }
  }

  if (operands.some((op) => op.kind === 'Ea' && op.explicitAddressOf)) {
    diag(diagnostics, filePath, `"@<path>" is only supported with ":=" in this phase.`, {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
  }

  return { kind: 'AsmInstruction', span: instrSpan, head: headLower, operands };
}
