import { getZ80InstructionEffect } from '../z80/effects.js';
import type {
  RegisterCareRoutine,
  RegisterCareUnit,
  RoutineSummary,
  ValueRelation,
} from './types.js';

const TRACKED_UNITS: RegisterCareUnit[] = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'F'];
const STACK_POINTER_UNITS = new Set<RegisterCareUnit>(['SPH', 'SPL']);
const FLAG_UNITS = new Set<RegisterCareUnit>([
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
  'negative',
]);
const REGISTER_PAIRS: RegisterCareUnit[][] = [
  ['A', 'F'],
  ['B', 'C'],
  ['D', 'E'],
  ['H', 'L'],
];

type Token = { origin: RegisterCareUnit } | { origin: 'unknown' };

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function isTrackedUnit(unit: RegisterCareUnit): boolean {
  return TRACKED_UNITS.includes(unit);
}

function readToken(tokens: Map<RegisterCareUnit, Token>, unit: RegisterCareUnit): Token {
  return tokens.get(unit) ?? { origin: 'unknown' };
}

function writesFlagRegister(unit: RegisterCareUnit): boolean {
  return FLAG_UNITS.has(unit);
}

function tokenPreservesUnit(token: Token | undefined, unit: RegisterCareUnit): boolean {
  return token?.origin === unit;
}

function relationKey(relation: ValueRelation): string {
  return `${relation.out.join(',')}<- ${relation.from.join(',')}`;
}

function addRelation(out: ValueRelation[], relation: ValueRelation): void {
  if (relation.out.length === 0 || relation.from.length === 0) return;
  const key = relationKey(relation);
  if (!out.some((existing) => relationKey(existing) === key)) out.push(relation);
}

function pairRelation(
  tokens: Map<RegisterCareUnit, Token>,
  out: RegisterCareUnit[],
): ValueRelation | undefined {
  const from: RegisterCareUnit[] = [];
  for (const unit of out) {
    const token = tokens.get(unit);
    if (!token || token.origin === 'unknown') return undefined;
    from.push(token.origin);
  }
  if (out.every((unit, idx) => unit === from[idx])) return undefined;
  return { out, from };
}

export function inferRoutineSummary(routine: RegisterCareRoutine): RoutineSummary {
  const tokens = new Map<RegisterCareUnit, Token>();
  for (const unit of TRACKED_UNITS) tokens.set(unit, { origin: unit });

  const stack: Token[][] = [];
  const mayRead: RegisterCareUnit[] = [];
  const directMayWrite: RegisterCareUnit[] = [];
  let stackBalanced = true;
  let hasUnknownStackEffect = false;

  for (const item of routine.instructions) {
    const effect = getZ80InstructionEffect(item.instruction);
    mayRead.push(...effect.reads);

    if (effect.stack.kind === 'push') {
      stack.push(effect.stack.units.map((unit) => readToken(tokens, unit)));
    } else if (effect.stack.kind === 'pop') {
      const popped = stack.pop();
      if (!popped) {
        stackBalanced = false;
        for (const unit of effect.stack.units) tokens.set(unit, { origin: 'unknown' });
      } else {
        effect.stack.units.forEach((unit, idx) => {
          tokens.set(unit, popped[idx] ?? { origin: 'unknown' });
        });
      }
    } else if (effect.stack.kind === 'exchangeTop') {
      hasUnknownStackEffect = true;
      for (const unit of effect.stack.units) tokens.set(unit, { origin: 'unknown' });
    } else if (effect.stack.kind === 'unknown') {
      hasUnknownStackEffect = true;
    }

    for (const unit of effect.writes) {
      if (STACK_POINTER_UNITS.has(unit)) continue;
      if (effect.stack.kind === 'pop' && effect.stack.units.includes(unit)) continue;

      if (isTrackedUnit(unit)) {
        tokens.set(unit, { origin: 'unknown' });
      } else {
        directMayWrite.push(unit);
      }

      if (writesFlagRegister(unit)) tokens.set('F', { origin: 'unknown' });
    }
  }

  if (stack.length !== 0) stackBalanced = false;

  const mayWrite: RegisterCareUnit[] = [...directMayWrite];
  const preserved: RegisterCareUnit[] = [];
  const valueRelations: ValueRelation[] = [];
  for (const unit of TRACKED_UNITS) {
    const current = tokens.get(unit);
    if (tokenPreservesUnit(current, unit)) {
      preserved.push(unit);
      continue;
    }

    mayWrite.push(unit);
    if (current && current.origin !== 'unknown') {
      addRelation(valueRelations, { out: [unit], from: [current.origin] });
    }
  }

  for (const pair of REGISTER_PAIRS) {
    const relation = pairRelation(tokens, pair);
    if (relation) addRelation(valueRelations, relation);
  }

  return {
    name: routine.name,
    mayRead: unique(mayRead),
    mayWrite: unique(mayWrite),
    preserved: unique(preserved),
    valueRelations,
    stackBalanced,
    hasUnknownStackEffect,
  };
}
