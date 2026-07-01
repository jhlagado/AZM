import type {
  RegisterContractsRoutine,
  RegisterContractsServiceRangeContract,
  RoutineContract,
  RoutineSummary,
} from './types.js';
import { applyRoutineContract, inferRoutineSummary } from './summary.js';

function emptyRoutineSummary(name: string): RoutineSummary {
  return {
    name,
    mayRead: [],
    mayWrite: [],
    preserved: [],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
}

function isLocalLabel(name: string): boolean {
  return name.startsWith('.');
}

function nonLocalLabels(labels: string[]): string[] {
  return labels.filter((label) => !isLocalLabel(label));
}

function boundaryLabels(routine: RegisterContractsRoutine): string[] {
  return routine.entryLabels.length > 0 ? routine.entryLabels : nonLocalLabels(routine.labels);
}

function contractForRoutine(
  routine: RegisterContractsRoutine,
  contracts: Map<string, RoutineContract>,
): RoutineContract | undefined {
  return boundaryLabels(routine)
    .map((label) => contracts.get(label))
    .find((contract) => contract !== undefined);
}

export function summariesWithExternalContracts(
  summaries: RoutineSummary[],
  contracts: Map<string, RoutineContract>,
  routineNameSet: Set<string>,
): RoutineSummary[] {
  const out = [...summaries];
  for (const contract of contracts.values()) {
    if (!routineNameSet.has(contract.name)) {
      out.push(applyRoutineContract(emptyRoutineSummary(contract.name), contract));
    }
  }
  return out;
}

function buildBoundarySummaryMap(
  summaries: RoutineSummary[],
  routineSummaries: Array<{ routine: RegisterContractsRoutine; summary: RoutineSummary }>,
  profileSummaries: RoutineSummary[],
): Map<string, RoutineSummary> {
  const boundarySummaryMap = new Map(profileSummaries.map((summary) => [summary.name, summary]));
  for (const summary of summaries) {
    boundarySummaryMap.set(summary.name, summary);
  }
  for (const { routine, summary } of routineSummaries) {
    for (const label of boundaryLabels(routine)) {
      boundarySummaryMap.set(label, summary);
    }
  }
  return boundarySummaryMap;
}

function buildOptimisticInternalBoundarySummaryMap(
  routines: readonly RegisterContractsRoutine[],
): Map<string, RoutineSummary> {
  const out = new Map<string, RoutineSummary>();
  for (const routine of routines) {
    const summary = emptyRoutineSummary(routine.name);
    for (const label of boundaryLabels(routine)) {
      out.set(label, summary);
    }
  }
  return out;
}

function summarizeRoutines(
  routines: RegisterContractsRoutine[],
  contracts: Map<string, RoutineContract>,
  boundarySummaryMap: ReadonlyMap<string, RoutineSummary> = new Map(),
  serviceRanges: readonly RegisterContractsServiceRangeContract[] = [],
): Array<{ routine: RegisterContractsRoutine; summary: RoutineSummary }> {
  return routines.map((routine) => {
    const inferred = inferRoutineSummary(routine, boundarySummaryMap, serviceRanges);
    const contract = contractForRoutine(routine, contracts);
    return { routine, summary: contract ? applyRoutineContract(inferred, contract) : inferred };
  });
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function summaryFingerprint(summary: RoutineSummary): string {
  const relations = summary.valueRelations
    .map((relation) => `${relation.out.join(',')}<-${relation.from.join(',')}`)
    .sort();
  return JSON.stringify({
    name: summary.name,
    mayRead: sortedUnique(summary.mayRead),
    mayWrite: sortedUnique(summary.mayWrite),
    preserved: sortedUnique(summary.preserved),
    relations,
    stackBalanced: summary.stackBalanced,
    hasUnknownStackEffect: summary.hasUnknownStackEffect,
  });
}

function routineSummariesFingerprint(
  routineSummaries: Array<{ routine: RegisterContractsRoutine; summary: RoutineSummary }>,
): string {
  return routineSummaries.map((item) => summaryFingerprint(item.summary)).join('\n');
}

export function inferRoutineSummariesToFixedPoint(
  routines: RegisterContractsRoutine[],
  contracts: Map<string, RoutineContract>,
  routineNameSet: Set<string>,
  profileSummaries: RoutineSummary[],
  serviceRanges: readonly RegisterContractsServiceRangeContract[] = [],
): Array<{ routine: RegisterContractsRoutine; summary: RoutineSummary }> {
  let routineSummaries = summarizeRoutines(
    routines,
    contracts,
    buildOptimisticInternalBoundarySummaryMap(routines),
    serviceRanges,
  );
  const maxPasses = Math.max(2, routines.length + 2);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const summaries = summariesWithExternalContracts(
      routineSummaries.map((item) => item.summary),
      contracts,
      routineNameSet,
    );
    const boundarySummaryMap = buildBoundarySummaryMap(
      summaries,
      routineSummaries,
      profileSummaries,
    );
    const nextRoutineSummaries = summarizeRoutines(
      routines,
      contracts,
      boundarySummaryMap,
      serviceRanges,
    );
    if (
      routineSummariesFingerprint(nextRoutineSummaries) ===
      routineSummariesFingerprint(routineSummaries)
    ) {
      return nextRoutineSummaries;
    }
    routineSummaries = nextRoutineSummaries;
  }

  return routineSummaries;
}
