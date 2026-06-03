import type {
  RegisterContractsUnit,
  RoutineContract,
  RoutineSummary,
  ValueRelation,
} from './types.js';
import {
  FLAG_UNIT_LIST,
  contractOutRelation,
  unique,
  withImpliedFlagUnits,
} from './summary-state.js';

function relationKey(relation: ValueRelation): string {
  return `${relation.out.join(',')}<- ${relation.from.join(',')}`;
}

function addContractRelation(out: ValueRelation[], relation: ValueRelation): void {
  if (relation.out.length === 0) return;
  const key = relationKey(relation);
  if (!out.some((existing) => relationKey(existing) === key)) out.push(relation);
}

export function applyRoutineContract(
  summary: RoutineSummary,
  contract: RoutineContract,
): RoutineSummary {
  const contractIn = withImpliedFlagUnits(contract.in);
  const contractOut = withImpliedFlagUnits(contract.out);
  const contractClobbers = withImpliedFlagUnits(contract.clobbers);
  const contractPreserves = withImpliedFlagUnits(contract.preserves);
  const outputSet = new Set(contractOut);
  const preservedSet = new Set(contractPreserves);

  const inferredWrites = withImpliedFlagUnits(summary.mayWrite);
  const baseMayWrite = contract.complete
    ? inferredWrites.filter((unit) => FLAG_UNIT_LIST.includes(unit))
    : inferredWrites;
  const mayWrite = baseMayWrite.filter((unit) => !outputSet.has(unit) && !preservedSet.has(unit));
  appendContractClobbers(mayWrite, contractClobbers, outputSet, preservedSet);

  const mayWriteSet = new Set(withImpliedFlagUnits(mayWrite));
  const preserved = unique([...summary.preserved, ...contractPreserves]).filter(
    (unit) => !outputSet.has(unit) && !mayWriteSet.has(unit),
  );

  const valueRelations = [...summary.valueRelations];
  const relation = contractOutRelation(contractIn, contractOut);
  if (relation) addContractRelation(valueRelations, relation);

  return {
    ...summary,
    mayRead: unique(contractIn),
    mayWrite,
    preserved,
    valueRelations,
  };
}

function appendContractClobbers(
  mayWrite: RegisterContractsUnit[],
  contractClobbers: readonly RegisterContractsUnit[],
  outputSet: ReadonlySet<RegisterContractsUnit>,
  preservedSet: ReadonlySet<RegisterContractsUnit>,
): void {
  for (const unit of contractClobbers) {
    if (!outputSet.has(unit) && !preservedSet.has(unit) && !mayWrite.includes(unit)) {
      mayWrite.push(unit);
    }
  }
}
