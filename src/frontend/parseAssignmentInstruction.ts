import type { AsmInstructionNode, AsmOperandNode, EaExprNode, SourceSpan } from './ast.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import { parseImmExprFromText } from './parseImm.js';
import { parseDiag as diag } from './parseDiagnostics.js';
import { ALL_REGISTER_NAMES, ASSIGNMENT_REGISTER_NAMES } from './grammarData.js';
import { canonicalRegisterToken, parseEaExprFromText } from './parseOperands.js';

export function parseAssignmentInstruction(
  filePath: string,
  text: string,
  instrSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmInstructionNode | undefined {
  const assignIndex = text.indexOf(':=');
  const leftText = assignIndex === -1 ? '' : text.slice(0, assignIndex).trim();
  const rightText = assignIndex === -1 ? '' : text.slice(assignIndex + 2).trim();
  if (
    assignIndex === -1 ||
    leftText.length === 0 ||
    rightText.length === 0 ||
    rightText.includes(':=')
  ) {
    diag(diagnostics, filePath, `":=" expects exactly one target and one source operand`, {
      line: instrSpan.start.line,
      column: instrSpan.start.column,
    });
    return undefined;
  }

  const target = parseAssignmentTarget(filePath, leftText, instrSpan, diagnostics);
  const source = parseAssignmentSource(filePath, rightText, instrSpan, diagnostics);
  if (!target || !source) return undefined;

  if (target.kind === 'Ea') {
    if (source.kind !== 'Reg' && source.kind !== 'Ea') {
      diag(
        diagnostics,
        filePath,
        `":=" storage targets require an assignment-register or path source`,
        {
          line: instrSpan.start.line,
          column: instrSpan.start.column,
        },
      );
      return undefined;
    }
    if (
      source.kind === 'Ea' &&
      !source.explicitAddressOf &&
      !isAssignmentStoragePath(source.expr)
    ) {
      diag(
        diagnostics,
        filePath,
        `":=" storage source must be a storage path, not an affine address expression`,
        {
          line: instrSpan.start.line,
          column: instrSpan.start.column,
        },
      );
      return undefined;
    }
    return { kind: 'AsmInstruction', span: instrSpan, head: ':=', operands: [target, source] };
  }

  if (source.kind === 'Ea' || source.kind === 'Imm' || source.kind === 'Reg') {
    return { kind: 'AsmInstruction', span: instrSpan, head: ':=', operands: [target, source] };
  }

  diag(diagnostics, filePath, `Invalid ":=" source operand "${rightText}"`, {
    line: instrSpan.start.line,
    column: instrSpan.start.column,
  });
  return undefined;
}

function parseAssignmentTarget(
  filePath: string,
  operandText: string,
  operandSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmOperandNode | undefined {
  const t = operandText.trim();
  if (t.length === 0) return undefined;

  const canonicalRegister = canonicalRegisterToken(t);
  if (ASSIGNMENT_REGISTER_NAMES.has(canonicalRegister)) {
    return { kind: 'Reg', span: operandSpan, name: canonicalRegister };
  }
  if (ALL_REGISTER_NAMES.has(canonicalRegister)) {
    diag(
      diagnostics,
      filePath,
      `":=" only supports assignment-register destinations in this slice`,
      {
        line: operandSpan.start.line,
        column: operandSpan.start.column,
      },
    );
    return undefined;
  }
  if (t.startsWith('(') && t.endsWith(')')) {
    diag(diagnostics, filePath, `":=" does not accept indirect memory operands`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
    return undefined;
  }
  if (t.startsWith('@')) {
    diag(diagnostics, filePath, `":=" does not accept address-of operands in this slice`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
    return undefined;
  }

  const ea = parseEaExprFromText(filePath, t, operandSpan, diagnostics);
  if (ea) {
    if (!isAssignmentStoragePath(ea)) {
      diag(
        diagnostics,
        filePath,
        `":=" target must be a storage path, not an affine address expression`,
        {
          line: operandSpan.start.line,
          column: operandSpan.start.column,
        },
      );
      return undefined;
    }
    return { kind: 'Ea', span: operandSpan, expr: ea };
  }

  diag(diagnostics, filePath, `Invalid ":=" target operand "${t}"`, {
    line: operandSpan.start.line,
    column: operandSpan.start.column,
  });
  return undefined;
}

function parseAssignmentSource(
  filePath: string,
  operandText: string,
  operandSpan: SourceSpan,
  diagnostics: Diagnostic[],
): AsmOperandNode | undefined {
  const t = operandText.trim();
  if (t.length === 0) return undefined;

  if (t.startsWith('@')) {
    if (t.startsWith('@@') || t.startsWith('@(')) {
      diag(diagnostics, filePath, `":=" does not accept nested or grouped address-of forms`, {
        line: operandSpan.start.line,
        column: operandSpan.start.column,
      });
      return undefined;
    }
    const eaText = t.slice(1).trim();
    const ea = parseEaExprFromText(filePath, eaText, operandSpan, diagnostics);
    if (ea) {
      if (!isAssignmentStoragePath(ea)) {
        diag(diagnostics, filePath, `":=" address-of form must be "@<path>" with a storage path.`, {
          line: operandSpan.start.line,
          column: operandSpan.start.column,
        });
        return undefined;
      }
      return { kind: 'Ea', span: operandSpan, expr: ea, explicitAddressOf: true };
    }
    diag(diagnostics, filePath, `":=" address-of form must be "@<path>" with a storage path.`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
    return undefined;
  }

  const canonicalRegister = canonicalRegisterToken(t);
  if (ASSIGNMENT_REGISTER_NAMES.has(canonicalRegister)) {
    return { kind: 'Reg', span: operandSpan, name: canonicalRegister };
  }
  if (ALL_REGISTER_NAMES.has(canonicalRegister)) {
    diag(diagnostics, filePath, `":=" only supports assignment-register sources in this slice`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
    return undefined;
  }
  if (t.startsWith('(') && t.endsWith(')')) {
    diag(diagnostics, filePath, `":=" does not accept indirect memory operands`, {
      line: operandSpan.start.line,
      column: operandSpan.start.column,
    });
    return undefined;
  }

  const ea = parseEaExprFromText(filePath, t, operandSpan, diagnostics);
  if (ea) return { kind: 'Ea', span: operandSpan, expr: ea };

  const expr = parseAssignmentImmediateExpr(filePath, t, operandSpan, diagnostics);
  if (expr) return { kind: 'Imm', span: operandSpan, expr };

  diag(diagnostics, filePath, `Invalid ":=" source operand "${t}"`, {
    line: operandSpan.start.line,
    column: operandSpan.start.column,
  });
  return undefined;
}

function parseAssignmentImmediateExpr(
  filePath: string,
  operandText: string,
  operandSpan: SourceSpan,
  diagnostics: Diagnostic[],
) {
  const t = operandText.trim();
  if (/^[A-Za-z_][A-Za-z0-9_]*(?:\s*[+-].*)?$/.test(t)) return undefined;
  return parseImmExprFromText(filePath, t, operandSpan, diagnostics, false);
}

export function isAssignmentStoragePath(ea: EaExprNode): boolean {
  switch (ea.kind) {
    case 'EaName':
      return true;
    case 'EaImm':
      return false;
    case 'EaReinterpret':
      return isAssignmentStoragePath(ea.base);
    case 'EaField':
      return isAssignmentStoragePath(ea.base);
    case 'EaIndex':
      return isAssignmentStoragePath(ea.base);
    case 'EaAdd':
    case 'EaSub':
      return false;
  }
}
