import { instructionHead } from './instruction-head.js';
import { regName } from './operand-register-name.js';
import { instructionOperand, instructionOperandCount } from './instruction-operands.js';
import { getRegisterUnits, readToken, unique, type Token } from './summary-state.js';
import type { RegisterContractsInstruction, RegisterContractsUnit } from './types.js';

export function applyPureTokenTransfer(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  item: RegisterContractsInstruction,
): RegisterContractsUnit[] {
  const head = instructionHead(item).toLowerCase();
  if (head === 'ld') return applyLdTokenTransfer(tokens, consumedProduced, item);
  if (head === 'ex') return applyExTokenTransfer(tokens, item);
  return [];
}

function applyLdTokenTransfer(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  item: RegisterContractsInstruction,
): RegisterContractsUnit[] {
  if (instructionOperandCount(item.instruction) !== 2) return [];

  const dstUnits = operandRegisterUnits(item, 0);
  if (!dstUnits) return [];

  const srcUnits = operandRegisterUnits(item, 1);
  if (srcUnits && srcUnits.length === dstUnits.length) {
    copyTokenUnits(tokens, consumedProduced, dstUnits, srcUnits);
  } else {
    markUnitsProduced(tokens, consumedProduced, dstUnits);
  }
  return dstUnits;
}

function applyExTokenTransfer(
  tokens: Map<RegisterContractsUnit, Token>,
  item: RegisterContractsInstruction,
): RegisterContractsUnit[] {
  if (instructionOperandCount(item.instruction) !== 2) return [];

  const leftUnits = operandRegisterUnits(item, 0);
  const rightUnits = operandRegisterUnits(item, 1);
  if (!leftUnits || !rightUnits || leftUnits.length !== rightUnits.length) return [];

  swapTokenUnits(tokens, leftUnits, rightUnits);
  return unique([...leftUnits, ...rightUnits]);
}

function operandRegisterUnits(
  item: RegisterContractsInstruction,
  operandIndex: number,
): RegisterContractsUnit[] | undefined {
  const name = regName(instructionOperand(item.instruction, operandIndex));
  return name ? getRegisterUnits(name) : undefined;
}

function copyTokenUnits(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  dstUnits: readonly RegisterContractsUnit[],
  srcUnits: readonly RegisterContractsUnit[],
): void {
  dstUnits.forEach((unit, index) => {
    const sourceUnit = srcUnits[index]!;
    const sourceToken = readToken(tokens, sourceUnit);
    tokens.set(unit, sourceToken);
    if (sourceToken.origin === 'produced') consumedProduced.add(sourceUnit);
    consumedProduced.delete(unit);
  });
}

function markUnitsProduced(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  units: readonly RegisterContractsUnit[],
): void {
  for (const unit of units) {
    tokens.set(unit, { origin: 'produced' });
    consumedProduced.delete(unit);
  }
}

function swapTokenUnits(
  tokens: Map<RegisterContractsUnit, Token>,
  leftUnits: readonly RegisterContractsUnit[],
  rightUnits: readonly RegisterContractsUnit[],
): void {
  const leftTokens = leftUnits.map((unit) => readToken(tokens, unit));
  const rightTokens = rightUnits.map((unit) => readToken(tokens, unit));
  leftUnits.forEach((unit, index) => {
    tokens.set(unit, rightTokens[index] ?? { origin: 'unknown' });
  });
  rightUnits.forEach((unit, index) => {
    tokens.set(unit, leftTokens[index] ?? { origin: 'unknown' });
  });
}
