import {
  CONTRACT_FLAG_UNITS,
  GENERAL_REGISTER_UNITS,
  REGISTER_PAIRS,
  TRACKED_UNITS,
  tokenPreservesUnit,
  unique,
  type Token,
} from './summary-state.js';
import type {
  RegisterContractsRoutine,
  RegisterContractsUnit,
  RoutineSummary,
  ValueRelation,
} from './types.js';

export interface RoutineInferenceStackState {
  stackBalanced: boolean;
  hasUnknownStackEffect: boolean;
}

function relationKey(relation: ValueRelation): string {
  return `${relation.out.join(',')}<- ${relation.from.join(',')}`;
}

function addRelation(out: ValueRelation[], relation: ValueRelation): void {
  if (relation.out.length === 0 || relation.from.length === 0) return;
  const key = relationKey(relation);
  if (!out.some((existing) => relationKey(existing) === key)) out.push(relation);
}

function addContractRelation(out: ValueRelation[], relation: ValueRelation): void {
  if (relation.out.length === 0) return;
  const key = relationKey(relation);
  if (!out.some((existing) => relationKey(existing) === key)) out.push(relation);
}

function pairRelation(
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
  out: RegisterContractsUnit[],
): ValueRelation | undefined {
  const from: RegisterContractsUnit[] = [];
  for (const unit of out) {
    const token = tokens.get(unit);
    if (!token || token.origin === 'unknown' || token.origin === 'produced') return undefined;
    from.push(token.origin);
  }
  if (out.every((unit, idx) => unit === from[idx])) return undefined;
  if (out.some((unit, idx) => unit === from[idx])) return undefined;
  return { out, from };
}

function producedPairRelation(
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
  consumedProduced: ReadonlySet<RegisterContractsUnit>,
  out: RegisterContractsUnit[],
): ValueRelation | undefined {
  if (out.some((unit) => tokens.get(unit)?.origin !== 'produced' || consumedProduced.has(unit))) {
    return undefined;
  }
  return { out, from: [] };
}

function addProducedPairOutputs(
  valueRelations: ValueRelation[],
  outputUnits: Set<RegisterContractsUnit>,
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
  consumedProduced: ReadonlySet<RegisterContractsUnit>,
): void {
  for (const pair of REGISTER_PAIRS) {
    const relation = producedPairRelation(tokens, consumedProduced, pair);
    if (!relation) continue;
    addContractRelation(valueRelations, relation);
    for (const unit of pair) outputUnits.add(unit);
  }
}

function singleUnitOutputRelation(
  unit: RegisterContractsUnit,
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
  consumedProduced: ReadonlySet<RegisterContractsUnit>,
  intendedProduced: ReadonlySet<RegisterContractsUnit>,
): ValueRelation | undefined {
  const current = tokens.get(unit);
  const eligibleProduced = isProducedOutput(unit, current, intendedProduced);
  const eligiblePreservedIntent = isPreservedIntentOutput(unit, current, intendedProduced);
  if (!(eligibleProduced || eligiblePreservedIntent)) return undefined;
  if (consumedProduced.has(unit)) return undefined;
  return {
    out: [unit],
    from: eligiblePreservedIntent ? [unit] : [],
  };
}

function isProducedOutput(
  unit: RegisterContractsUnit,
  token: Token | undefined,
  intendedProduced: ReadonlySet<RegisterContractsUnit>,
): boolean {
  if (token?.origin !== 'produced') return false;
  return GENERAL_REGISTER_UNITS.has(unit) || isProducedFlagOutput(unit, intendedProduced);
}

function isProducedFlagOutput(
  unit: RegisterContractsUnit,
  intendedProduced: ReadonlySet<RegisterContractsUnit>,
): boolean {
  return CONTRACT_FLAG_UNITS.has(unit) && intendedProduced.has(unit);
}

function isPreservedIntentOutput(
  unit: RegisterContractsUnit,
  token: Token | undefined,
  intendedProduced: ReadonlySet<RegisterContractsUnit>,
): boolean {
  return token?.origin === unit && GENERAL_REGISTER_UNITS.has(unit) && intendedProduced.has(unit);
}

function addSingleUnitOutputs(
  valueRelations: ValueRelation[],
  outputUnits: Set<RegisterContractsUnit>,
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
  consumedProduced: ReadonlySet<RegisterContractsUnit>,
  intendedProduced: ReadonlySet<RegisterContractsUnit>,
): void {
  for (const unit of TRACKED_UNITS) {
    if (outputUnits.has(unit)) continue;
    const relation = singleUnitOutputRelation(unit, tokens, consumedProduced, intendedProduced);
    if (!relation) continue;
    addContractRelation(valueRelations, relation);
    outputUnits.add(unit);
  }
}

function collectPreservedAndMayWrite(
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
  outputUnits: ReadonlySet<RegisterContractsUnit>,
  directMayWrite: readonly RegisterContractsUnit[],
): { preserved: RegisterContractsUnit[]; mayWrite: RegisterContractsUnit[] } {
  const preserved: RegisterContractsUnit[] = [];
  const mayWrite: RegisterContractsUnit[] = [...directMayWrite];
  for (const unit of TRACKED_UNITS) {
    const current = tokens.get(unit);
    if (tokenPreservesUnit(current, unit)) {
      preserved.push(unit);
      continue;
    }
    if (!outputUnits.has(unit)) mayWrite.push(unit);
  }
  return { preserved, mayWrite };
}

function addValueRelations(
  valueRelations: ValueRelation[],
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
): void {
  for (const pair of REGISTER_PAIRS) {
    const relation = pairRelation(tokens, pair);
    if (relation) addRelation(valueRelations, relation);
  }
}

export function buildRoutineSummary(
  routine: RegisterContractsRoutine,
  tokens: ReadonlyMap<RegisterContractsUnit, Token>,
  consumedProduced: ReadonlySet<RegisterContractsUnit>,
  intendedProduced: ReadonlySet<RegisterContractsUnit>,
  directMayWrite: readonly RegisterContractsUnit[],
  mayRead: RegisterContractsUnit[],
  stackState: RoutineInferenceStackState,
): RoutineSummary {
  const valueRelations: ValueRelation[] = [];
  const outputUnits = new Set<RegisterContractsUnit>();
  addProducedPairOutputs(valueRelations, outputUnits, tokens, consumedProduced);
  addSingleUnitOutputs(valueRelations, outputUnits, tokens, consumedProduced, intendedProduced);
  const { preserved, mayWrite } = collectPreservedAndMayWrite(tokens, outputUnits, directMayWrite);
  addValueRelations(valueRelations, tokens);
  mayRead.push(...valueRelations.flatMap((relation) => relation.from));

  return {
    name: routine.name,
    mayRead: unique(mayRead),
    mayWrite: unique(mayWrite),
    preserved: unique(preserved),
    valueRelations,
    stackBalanced: stackState.stackBalanced,
    hasUnknownStackEffect: stackState.hasUnknownStackEffect,
  };
}
