import { expectDiagnostic } from '../helpers/diagnostics/index.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, SourceSpan } from '../../src/frontend/ast.js';

export const encoderSpan: SourceSpan = {
  file: 'encoder-test.asm',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

export const encoderEnv = {
  equates: new Map<string, number>(),
  enums: new Map<string, number>(),
  types: new Map(),
};

export function instruction(
  head: string,
  operands: AsmOperandNode[],
  span = encoderSpan,
): AsmInstructionNode {
  return { kind: 'AsmInstruction', span, head, operands };
}

export function reg(name: string, span = encoderSpan): AsmOperandNode {
  return { kind: 'Reg', span, name };
}

export function imm(value: number, span = encoderSpan): AsmOperandNode {
  return { kind: 'Imm', span, expr: { kind: 'ImmLiteral', span, value } };
}

export function memName(name: string, span = encoderSpan): AsmOperandNode {
  return { kind: 'Mem', span, expr: { kind: 'EaName', span, name } };
}

export function portC(span = encoderSpan): AsmOperandNode {
  return { kind: 'PortC', span };
}

export function portImm(value: number, span = encoderSpan): AsmOperandNode {
  return { kind: 'PortImm8', span, expr: { kind: 'ImmLiteral', span, value } };
}

export function expectEncodeError(diagnostics: Diagnostic[], messageIncludes: string): void {
  expectDiagnostic(diagnostics, {
    id: DiagnosticIds.EncodeError,
    severity: 'error',
    messageIncludes,
  });
}
