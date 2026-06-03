import { expandCarrierList } from './carriers.js';
import type {
  RegisterContractsInstruction,
  RegisterContractsUnit,
  ValueRelation,
} from './types.js';
import { instructionHead } from './instruction-head.js';

export const FLAG_UNIT_LIST: RegisterContractsUnit[] = [
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
];
export const TRACKED_UNITS: RegisterContractsUnit[] = [
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
  ...FLAG_UNIT_LIST,
];
export const GENERAL_REGISTER_UNITS = new Set<RegisterContractsUnit>([
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
]);
export const CONTRACT_FLAG_UNITS = new Set<RegisterContractsUnit>(['carry', 'zero']);
export const STACK_POINTER_UNITS = new Set<RegisterContractsUnit>(['SPH', 'SPL']);
export const REGISTER_PAIRS: RegisterContractsUnit[][] = [
  ['B', 'C'],
  ['D', 'E'],
  ['H', 'L'],
];

export type Token =
  | { origin: RegisterContractsUnit }
  | { origin: 'produced' }
  | { origin: 'unknown' };

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function isTrackedUnit(unit: RegisterContractsUnit): boolean {
  return TRACKED_UNITS.includes(unit);
}

export function getRegisterUnits(name: string): RegisterContractsUnit[] | undefined {
  return expandCarrierList([name]);
}

export function readToken(
  tokens: Map<RegisterContractsUnit, Token>,
  unit: RegisterContractsUnit,
): Token {
  return tokens.get(unit) ?? { origin: 'unknown' };
}

export function semanticReadOrigins(
  tokens: Map<RegisterContractsUnit, Token>,
  units: RegisterContractsUnit[],
): RegisterContractsUnit[] {
  const origins: RegisterContractsUnit[] = [];
  for (const unit of units) {
    if (!isTrackedUnit(unit)) {
      origins.push(unit);
      continue;
    }
    const token = readToken(tokens, unit);
    if (token.origin !== 'unknown' && token.origin !== 'produced') origins.push(token.origin);
  }
  return origins;
}

export function markProducedReadsConsumed(
  tokens: Map<RegisterContractsUnit, Token>,
  consumedProduced: Set<RegisterContractsUnit>,
  reads: RegisterContractsUnit[],
  writes: ReadonlySet<RegisterContractsUnit>,
  item?: RegisterContractsInstruction,
): void {
  for (const unit of reads) {
    if (!isTrackedUnit(unit) || writes.has(unit)) continue;
    if (item !== undefined && instructionHead(item) === 'cp' && unit === 'A') continue;
    if (readToken(tokens, unit).origin === 'produced') consumedProduced.add(unit);
  }
}

export function tokenPreservesUnit(token: Token | undefined, unit: RegisterContractsUnit): boolean {
  return token?.origin === unit;
}

export function withImpliedFlagUnits(units: RegisterContractsUnit[]): RegisterContractsUnit[] {
  return unique(units);
}

export function contractOutRelation(
  contractIn: RegisterContractsUnit[],
  contractOut: RegisterContractsUnit[],
): ValueRelation | undefined {
  if (contractOut.length === 0) return undefined;
  return {
    out: contractOut,
    from: contractIn.length === contractOut.length ? contractIn : [],
  };
}
