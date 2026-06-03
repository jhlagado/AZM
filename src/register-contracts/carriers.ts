import type { RegisterContractsUnit } from './types.js';

const FLAG_UNITS: RegisterContractsUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

const SINGLE_UNITS = new Set<RegisterContractsUnit>([
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
]);

const PAIRS: Readonly<Record<string, RegisterContractsUnit[]>> = {
  AF: ['A', ...FLAG_UNITS],
  BC: ['B', 'C'],
  DE: ['D', 'E'],
  HL: ['H', 'L'],
  IX: ['IXH', 'IXL'],
  IY: ['IYH', 'IYL'],
  SP: ['SPH', 'SPL'],
};

const FLAG_ALIASES: Readonly<Record<string, RegisterContractsUnit>> = {
  CARRY: 'carry',
  ZERO: 'zero',
  Z: 'zero',
  SIGN: 'sign',
  S: 'sign',
  PARITY: 'parity',
  PV: 'parity',
  'P/V': 'parity',
  HALFCARRY: 'halfCarry',
  HFLAG: 'halfCarry',
};

function normalizeCarrierName(raw: string): RegisterContractsUnit | undefined {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  const flag = FLAG_ALIASES[upper];
  if (flag !== undefined) return flag;
  if (SINGLE_UNITS.has(upper as RegisterContractsUnit)) return upper as RegisterContractsUnit;
  return undefined;
}

function expandCarrier(raw: string): RegisterContractsUnit[] | undefined {
  const upper = raw.trim().toUpperCase();
  if (upper === 'F') return FLAG_UNITS;
  const pair = PAIRS[upper];
  if (pair !== undefined) return pair;
  const single = normalizeCarrierName(raw);
  return single !== undefined ? [single] : undefined;
}

export function expandCarrierList(raw: readonly string[]): RegisterContractsUnit[] | undefined {
  const out: RegisterContractsUnit[] = [];
  const seen = new Set<RegisterContractsUnit>();
  for (const item of raw) {
    const expanded = expandCarrier(item);
    if (expanded === undefined) return undefined;
    for (const unit of expanded) {
      if (seen.has(unit)) continue;
      seen.add(unit);
      out.push(unit);
    }
  }
  return out;
}
