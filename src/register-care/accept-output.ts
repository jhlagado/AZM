import { expandCarrierList } from './carriers.js';
import type { RegisterCareUnit } from './types.js';

function appendUniqueUnits(target: RegisterCareUnit[], units: RegisterCareUnit[]): void {
  for (const unit of units) {
    if (!target.includes(unit)) target.push(unit);
  }
}

export function parseAcceptedOutputCandidates(
  items: readonly string[] = [],
): Map<string, RegisterCareUnit[]> {
  const out = new Map<string, RegisterCareUnit[]>();

  for (const item of items) {
    const splitIndex = item.indexOf(':');
    if (splitIndex <= 0 || splitIndex === item.length - 1) {
      throw new Error(`Invalid --accept-out value "${item}" (expected ROUTINE:carriers)`);
    }

    const name = item.slice(0, splitIndex).trim();
    if (!name) {
      throw new Error(`Invalid --accept-out value "${item}" (missing routine name)`);
    }

    const carriers = item
      .slice(splitIndex + 1)
      .split(',')
      .map((candidate) => candidate.trim());
    if (carriers.length === 0 || carriers.some((candidate) => candidate.length === 0)) {
      throw new Error(`Invalid --accept-out value "${item}" (missing carriers)`);
    }

    const units = expandCarrierList(carriers);
    if (!units) {
      throw new Error(`Invalid --accept-out value "${item}" (unknown carrier)`);
    }

    const existing = out.get(name) ?? [];
    appendUniqueUnits(existing, units);
    out.set(name, existing);
  }

  return out;
}
