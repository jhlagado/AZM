import type { RegisterCareUnit } from './types.js';

const SINGLE_UNITS = new Set<RegisterCareUnit>([
  'A',
  'B',
  'C',
  'D',
  'E',
  'H',
  'L',
  'F',
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
  'negative',
]);

const PAIRS: Readonly<Record<string, RegisterCareUnit[]>> = {
  AF: ['A', 'F'],
  BC: ['B', 'C'],
  DE: ['D', 'E'],
  HL: ['H', 'L'],
  IX: ['IXH', 'IXL'],
  IY: ['IYH', 'IYL'],
  SP: ['SPH', 'SPL'],
};

const FLAG_ALIASES: Readonly<Record<string, RegisterCareUnit>> = {
  CARRY: 'carry',
  C: 'carry',
  ZERO: 'zero',
  Z: 'zero',
  SIGN: 'sign',
  S: 'sign',
  PARITY: 'parity',
  PV: 'parity',
  'P/V': 'parity',
  HALFCARRY: 'halfCarry',
  HFLAG: 'halfCarry',
  NEGATIVE: 'negative',
  N: 'negative',
};

export function normalizeCarrierName(raw: string): RegisterCareUnit | undefined {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  const flag = FLAG_ALIASES[upper];
  if (flag) return flag;
  if (SINGLE_UNITS.has(upper as RegisterCareUnit)) return upper as RegisterCareUnit;
  return undefined;
}

export function expandCarrier(raw: string): RegisterCareUnit[] | undefined {
  const upper = raw.trim().toUpperCase();
  const pair = PAIRS[upper];
  if (pair) return pair;
  const single = normalizeCarrierName(raw);
  return single ? [single] : undefined;
}

export function expandCarrierList(raw: string[]): RegisterCareUnit[] {
  const out: RegisterCareUnit[] = [];
  const seen = new Set<RegisterCareUnit>();
  for (const item of raw) {
    const expanded = expandCarrier(item);
    if (!expanded) continue;
    for (const unit of expanded) {
      if (seen.has(unit)) continue;
      seen.add(unit);
      out.push(unit);
    }
  }
  return out;
}
