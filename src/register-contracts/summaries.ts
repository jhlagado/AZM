import type { Diagnostic } from '../model/diagnostic.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsDirectCall,
  RegisterContractsRoutine,
  RoutineContract,
  RoutineSummary,
  RegisterContractsUnit,
  RegisterContractsOutputCandidate,
} from './types.js';
import { getRegisterContractsProfile } from './profiles.js';
import {
  inferRoutineSummariesToFixedPoint,
  summariesWithExternalContracts,
} from './routine-summaries.js';

function unique<T>(values: T[]): T[] {
  const out: T[] = [];
  for (const value of values) {
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

function isLocalLabel(name: string): boolean {
  return name.startsWith('.');
}

function boundaryLabels(routine: RegisterContractsRoutine): string[] {
  return routine.entryLabels.length > 0
    ? routine.entryLabels
    : routine.labels.filter((label) => !isLocalLabel(label));
}

function routineNameSet(routines: readonly RegisterContractsRoutine[]): Set<string> {
  return new Set(routines.flatMap((routine) => boundaryLabels(routine)));
}

export function buildProfileSummaries(
  profileName: AnalyzeRegisterContractsOptions['registerContractsProfile'],
): RoutineSummary[] {
  const profile = getRegisterContractsProfile(profileName);
  if (profile === undefined) {
    return [];
  }
  return [
    ...profile.rst.values(),
    ...profile.rstServices.values(),
    ...[...profile.rstDispatchers.values()].flatMap((dispatcher) => [
      ...dispatcher.services.values(),
    ]),
  ];
}

export function buildProfileSummaryLookup(
  profileName: AnalyzeRegisterContractsOptions['registerContractsProfile'],
): Map<string, RoutineSummary> {
  const profile = getRegisterContractsProfile(profileName);
  const out = new Map<string, RoutineSummary>();
  if (profile === undefined) return out;
  for (const summary of profile.rst.values()) {
    out.set(summary.name, summary);
  }
  for (const summary of profile.rstServices.values()) {
    out.set(summary.name, summary);
  }
  for (const dispatcher of profile.rstDispatchers.values()) {
    for (const summary of dispatcher.services.values()) {
      out.set(summary.name, summary);
    }
  }
  return out;
}

export function routineNames(routines: readonly RegisterContractsRoutine[]): string[] {
  return routines.flatMap((routine) => boundaryLabels(routine));
}

export function buildSummaries(
  routines: readonly RegisterContractsRoutine[],
  contractMap: Map<string, RoutineContract>,
  profileSummaries: readonly RoutineSummary[] = [],
): RoutineSummary[] {
  const names = routineNameSet(routines);
  const routineSummaries = inferRoutineSummariesToFixedPoint([...routines], contractMap, names, [
    ...profileSummaries,
  ]);
  const summaries = routineSummaries.map((item) => item.summary);
  return summariesWithExternalContracts(summaries, contractMap, names);
}

export function buildSummaryByName(
  routines: readonly RegisterContractsRoutine[],
  summaries: readonly RoutineSummary[],
  profileSummaries: readonly RoutineSummary[] = [],
): Map<string, RoutineSummary> {
  const out = new Map<string, RoutineSummary>();
  const byRoutine = new Map<string, RoutineSummary>();
  for (const summary of summaries) {
    byRoutine.set(summary.name, summary);
    out.set(summary.name, summary);
  }
  for (const summary of profileSummaries) {
    out.set(summary.name, summary);
  }
  for (const routine of routines) {
    const routineSummary = byRoutine.get(routine.name);
    if (routineSummary === undefined) continue;
    for (const alias of boundaryLabels(routine)) {
      out.set(alias, routineSummary);
    }
  }
  return out;
}

export function withAcceptedOutputs(
  summaries: readonly RoutineSummary[],
  acceptedOutputCandidates: ReadonlyMap<string, RegisterContractsUnit[]> | undefined,
): RoutineSummary[] {
  if (!acceptedOutputCandidates || acceptedOutputCandidates.size === 0) {
    return [...summaries];
  }
  return summaries.map((summary) => {
    const accepted = acceptedOutputCandidates.get(summary.name);
    if (!accepted || accepted.length === 0) {
      return summary;
    }
    const written = new Set(summary.mayWrite);
    const promoted = accepted.filter((unit) => written.has(unit));
    if (promoted.length === 0) {
      return summary;
    }
    const valueRelations = [...summary.valueRelations];
    for (const unit of promoted) {
      if (!valueRelations.some((relation) => relation.out.includes(unit))) {
        valueRelations.push({ out: [unit], from: [] });
      }
    }
    return { ...summary, valueRelations };
  });
}

export function unknownBoundaryDiagnostics(
  directBoundaries: readonly RegisterContractsDirectCall[],
  knownRoutines: ReadonlySet<string>,
  severity: Diagnostic['severity'] = 'warning',
): Diagnostic[] {
  return directBoundaries
    .filter((boundary) => !knownRoutines.has(boundary.target))
    .map((boundary) => ({
      severity,
      code: 'AZMN_REGISTER_CONTRACTS',
      message: `Register contracts cannot prove ${boundary.subject}; add a routine body or .asmi extern contract.`,
      sourceName: boundary.file,
      line: boundary.line,
      column: boundary.column,
    }));
}

export function unknownCallList(
  directBoundaries: readonly RegisterContractsDirectCall[],
  knownRoutines: ReadonlySet<string>,
): string[] {
  return unique(
    directBoundaries
      .filter((boundary) => !knownRoutines.has(boundary.target))
      .map((boundary) => boundary.target),
  ).sort();
}

export function buildOutputCandidateFixability(
  routines: readonly RegisterContractsRoutine[],
  outputCandidates: readonly RegisterContractsOutputCandidate[],
  autoFixableCandidateKeys: (
    routines: RegisterContractsRoutine[],
    outputCandidates: RegisterContractsOutputCandidate[],
  ) => ReadonlySet<string>,
): ReadonlyMap<string, boolean> {
  const autoFixable = autoFixableCandidateKeys([...routines], [...outputCandidates]);
  const out = new Map<string, boolean>();
  for (const candidate of outputCandidates) {
    out.set(
      outputCandidateKey(candidate.file, candidate.line, candidate.column),
      autoFixable.has(outputCandidateKey(candidate.file, candidate.line, candidate.column)),
    );
  }
  return out;
}

export function outputCandidateKey(file: string, line: number, column: number): string {
  return `${file}:${line}:${column}`;
}
