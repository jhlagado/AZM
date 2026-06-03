import { splitInstructionOperands } from './operand-split.js';
import type { ParseZ80InstructionResult } from './parse-instruction.js';
import {
  isRstVector,
  parseConstantExpression,
  parseIndexHalfRegister,
  parsePortOperand,
  parseRegister8Operand,
} from './parse-operands.js';

export function parseInputInstruction(text: string): ParseZ80InstructionResult | undefined {
  const input = /^IN(?:\s+(.*))?$/i.exec(text);
  if (input) {
    const operandText = input[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length > 2) {
      return { error: 'in expects one or two operands' };
    }
    if (parts.length === 1) return parseOneOperandInput(parts[0] ?? '');
    return parseTwoOperandInput(parts[0] ?? '', parts[1] ?? '');
  }
  return undefined;
}

function parseOneOperandInput(portText: string): ParseZ80InstructionResult {
  const port = parsePortOperand(portText);
  return port?.kind === 'c'
    ? { instruction: { mnemonic: 'in', port } }
    : { error: 'in (c) is the only one-operand in form' };
}

function parseTwoOperandInput(targetText: string, portText: string): ParseZ80InstructionResult {
  const target = parseRegister8Operand(targetText);
  if (!target) {
    return parseIndexHalfRegister(targetText)
      ? { error: 'in destination must use plain reg8 B/C/D/E/H/L/A' }
      : { error: 'in expects a reg8 destination' };
  }
  const port = parsePortOperand(portText);
  if (!port) {
    return { error: 'in expects a port operand (c) or (imm8)' };
  }
  if (port.kind === 'imm' && target.register !== 'a') {
    return { error: 'in a,(n) immediate port form requires destination A' };
  }
  return { instruction: { mnemonic: 'in', target, port } };
}

export function parseOutputInstruction(text: string): ParseZ80InstructionResult | undefined {
  const output = /^OUT(?:\s+(.*))?$/i.exec(text);
  if (output) {
    const operandText = output[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 2) {
      return { error: 'out expects two operands' };
    }
    const port = parsePortOperand(parts[0] ?? '');
    if (!port) {
      return { error: 'out expects a port operand (c) or (imm8)' };
    }
    return parseOutputSource(port, parts[1] ?? '');
  }
  return undefined;
}

function parseOutputSource(
  port: NonNullable<ReturnType<typeof parsePortOperand>>,
  sourceText: string,
): ParseZ80InstructionResult {
  const source = parseRegister8Operand(sourceText);
  if (source) {
    if (port.kind === 'imm' && source.register !== 'a') {
      return { error: 'out (n),a immediate port form requires source A' };
    }
    return { instruction: { mnemonic: 'out', port, source } };
  }
  if (parseIndexHalfRegister(sourceText)) {
    return { error: 'out source must use plain reg8 B/C/D/E/H/L/A' };
  }
  return parseOutputZeroSource(port, sourceText);
}

function parseOutputZeroSource(
  port: NonNullable<ReturnType<typeof parsePortOperand>>,
  sourceText: string,
): ParseZ80InstructionResult {
  const zero = parseConstantExpression(sourceText);
  if (zero !== undefined && port.kind === 'c') {
    return zero === 0
      ? { instruction: { mnemonic: 'out', port, source: { kind: 'zero' } } }
      : { error: 'out (c), n immediate form supports n=0 only' };
  }
  return { error: 'out expects a reg8 source' };
}

export function parseInterruptModeInstruction(text: string): ParseZ80InstructionResult | undefined {
  const im = /^IM(?:\s+(.*))?$/i.exec(text);
  if (im) {
    const operandText = im[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: 'im expects one operand' };
    }
    const mode = parseConstantExpression(parts[0] ?? '');
    if (mode !== 0 && mode !== 1 && mode !== 2) {
      return { error: 'im expects 0, 1, or 2' };
    }
    return { instruction: { mnemonic: 'im', mode } };
  }
  return undefined;
}

export function parseRstInstruction(text: string): ParseZ80InstructionResult | undefined {
  const rst = /^RST(?:\s+(.*))?$/i.exec(text);
  if (rst) {
    const operandText = rst[1] ?? '';
    const parts = splitInstructionOperands(operandText);
    if (operandText.trim().length === 0 || parts.length !== 1) {
      return { error: 'rst expects one operand' };
    }
    const vector = parseConstantExpression(parts[0] ?? '');
    if (!isRstVector(vector)) {
      return { error: 'rst expects an imm8 multiple of 8 (0..56)' };
    }
    return { instruction: { mnemonic: 'rst', vector } };
  }
  return undefined;
}
