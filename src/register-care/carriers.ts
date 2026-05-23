import type { RegisterCareUnit } from './types.js';

const FLAG_UNITS: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

const SINGLE_UNITS = new Set<RegisterCareUnit>([
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

const PAIRS: Readonly<Record<string, RegisterCareUnit[]>> = {
  AF: ['A', ...FLAG_UNITS],
  BC: ['B', 'C'],
  DE: ['D', 'E'],
  HL: ['H', 'L'],
  IX: ['IXH', 'IXL'],
  IY: ['IYH', 'IYL'],
  SP: ['SPH', 'SPL'],
};

const FLAG_ALIASES: Readonly<Record<string, RegisterCareUnit>> = {
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

export function normalizeCarrierName(raw: string): RegisterCareUnit | undefined {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  const flag = FLAG_ALIASES[upper];
  if (flag !== undefined) return flag;
  if (SINGLE_UNITS.has(upper as RegisterCareUnit)) return upper as RegisterCareUnit;
  return undefined;
}

export function expandCarrier(raw: string): RegisterCareUnit[] | undefined {
  const upper = raw.trim().toUpperCase();
  if (upper === 'F') return FLAG_UNITS;
  const pair = PAIRS[upper];
  if (pair !== undefined) return pair;
  const single = normalizeCarrierName(raw);
  return single !== undefined ? [single] : undefined;
}

export function expandCarrierList(raw: readonly string[]): RegisterCareUnit[] | undefined {
  const out: RegisterCareUnit[] = [];
  const seen = new Set<RegisterCareUnit>();
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
