import type { Expression } from '../model/expression.js';
import type { InstructionEffect, RegisterContractsUnit } from '../register-contracts/types.js';
import type { Z80Condition, Z80Operand, Z80RelativeCondition } from './instruction.js';

export const FLAG_WRITES: RegisterContractsUnit[] = ['sign', 'zero', 'halfCarry', 'parity', 'carry'];
export const INC_DEC_FLAG_WRITES: RegisterContractsUnit[] = ['sign', 'zero', 'halfCarry', 'parity'];
export const ROTATE_SHIFT_FLAG_WRITES: RegisterContractsUnit[] = [
  'sign',
  'zero',
  'halfCarry',
  'parity',
  'carry',
];
export const BIT_FLAG_WRITES: RegisterContractsUnit[] = ['sign', 'zero', 'halfCarry', 'parity'];
export const STACK_POINTER_UNITS: RegisterContractsUnit[] = ['SPH', 'SPL'];

const UNKNOWN_UNITS: RegisterContractsUnit[] = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'IXH',
  'IXL',
  'IYH',
  'IYL',
  'SPH',
  'SPL',
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
];

export function baseEffect(): InstructionEffect {
  return {
    reads: [],
    writes: [],
    stack: { kind: 'none' },
    control: { kind: 'fallthrough' },
  };
}

export function unknownEffect(): InstructionEffect {
  return {
    reads: UNKNOWN_UNITS,
    writes: UNKNOWN_UNITS,
    stack: { kind: 'unknown' },
    control: { kind: 'unknown' },
  };
}

export function concatUnique(...groups: RegisterContractsUnit[][]): RegisterContractsUnit[] {
  const out: RegisterContractsUnit[] = [];
  for (const group of groups) {
    appendUnique(out, group);
  }
  return out;
}

export function reg8Units(raw: string): RegisterContractsUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'a') return ['A'];
  if (reg === 'b') return ['B'];
  if (reg === 'c') return ['C'];
  if (reg === 'd') return ['D'];
  if (reg === 'e') return ['E'];
  if (reg === 'h') return ['H'];
  if (reg === 'l') return ['L'];
  return [];
}

export function reg16Units(raw: string): RegisterContractsUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'bc') return ['B', 'C'];
  if (reg === 'de') return ['D', 'E'];
  if (reg === 'hl') return ['H', 'L'];
  if (reg === 'sp') return ['SPH', 'SPL'];
  if (reg === 'ix') return ['IXH', 'IXL'];
  if (reg === 'iy') return ['IYH', 'IYL'];
  if (reg === 'af') return ['A', ...FLAG_WRITES];
  return [];
}

export function regHalfUnits(raw: string): RegisterContractsUnit[] {
  const reg = raw.toLowerCase();
  if (reg === 'ixh') return ['IXH'];
  if (reg === 'ixl') return ['IXL'];
  if (reg === 'iyh') return ['IYH'];
  if (reg === 'iyl') return ['IYL'];
  return [];
}

export function expressionSymbol(expression: Expression): string | undefined {
  return expression.kind === 'symbol' ? expression.name : undefined;
}

export function operandReads(op: Z80Operand): RegisterContractsUnit[] | undefined {
  switch (op.kind) {
    case 'reg8':
      return reg8Units(op.register);
    case 'reg16':
    case 'reg-index16':
      return reg16Units(op.register);
    case 'reg-half-index':
      return regHalfUnits(op.register);
    case 'special8':
      return [];
    case 'reg-indirect':
      return reg16Units(op.register);
    case 'indexed':
      return reg16Units(op.register);
    case 'mem-abs':
    case 'imm':
      return [];
    default:
      return undefined;
  }
}

export function operandWrites(op: Z80Operand): RegisterContractsUnit[] | undefined {
  switch (op.kind) {
    case 'reg8':
      return reg8Units(op.register);
    case 'reg16':
      return reg16Units(op.register);
    case 'reg-index16':
      return reg16Units(op.register);
    case 'reg-half-index':
      return regHalfUnits(op.register);
    default:
      return undefined;
  }
}

export function conditionFlagRead(
  condition: Z80Condition | Z80RelativeCondition,
): RegisterContractsUnit[] {
  switch (condition) {
    case 'z':
    case 'nz':
      return ['zero'];
    case 'c':
    case 'nc':
      return ['carry'];
    case 'm':
    case 'p':
      return ['sign'];
    case 'pe':
    case 'po':
      return ['parity'];
    default:
      return [];
  }
}

function appendUnique(out: RegisterContractsUnit[], units: RegisterContractsUnit[]): void {
  for (const unit of units) {
    if (!out.includes(unit)) out.push(unit);
  }
}
