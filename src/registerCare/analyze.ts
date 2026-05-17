import { DiagnosticIds, type Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../moduleLoader.js';
import { diagnosticsForRegisterCareConflicts, findRegisterCareConflicts } from './liveness.js';
import { getRegisterCareProfile, type RegisterCareProfileName } from './profiles.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { applyRoutineContract, inferRoutineSummary } from './summary.js';
import type {
  RegisterCareDirectCall,
  RegisterCareMode,
  RegisterCareRoutine,
  RegisterCareReportModel,
  RegisterCareUnknownBoundary,
  RoutineContract,
  RoutineSummary,
} from './types.js';

export interface AnalyzeRegisterCareOptions {
  mode: RegisterCareMode;
  emitReport: boolean;
  emitInterface: boolean;
  profile?: RegisterCareProfileName;
}

export interface AnalyzeRegisterCareResult {
  diagnostics: Diagnostic[];
  reportText?: string;
  interfaceText?: string;
}

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

function unknownBoundaryForCall(call: RegisterCareDirectCall): RegisterCareUnknownBoundary {
  return {
    ...call,
    message: `Register-care cannot prove ${call.subject}; add a routine body or @extern contract.`,
  };
}

function uniqueSortedTargets(boundaries: RegisterCareUnknownBoundary[]): string[] {
  return Array.from(new Set(boundaries.map((boundary) => boundary.target))).sort();
}

function diagnosticsForUnknownBoundaries(boundaries: RegisterCareUnknownBoundary[]): Diagnostic[] {
  return boundaries.map((boundary) => ({
    id: DiagnosticIds.RegisterCareUnknownBoundary,
    severity: 'warning',
    message: boundary.message,
    file: boundary.file,
    line: boundary.line,
    column: boundary.column,
  }));
}

function isLocalLabel(name: string): boolean {
  return name.startsWith('.');
}

function nonLocalLabels(labels: string[]): string[] {
  return labels.filter((label) => !isLocalLabel(label));
}

function contractForRoutine(
  routineLabels: string[],
  contracts: Map<string, RoutineContract>,
): RoutineContract | undefined {
  return nonLocalLabels(routineLabels)
    .map((label) => contracts.get(label))
    .find((contract) => contract !== undefined);
}

function summariesWithExternalContracts(
  summaries: RoutineSummary[],
  contracts: Map<string, RoutineContract>,
  routineNames: Set<string>,
): RoutineSummary[] {
  const out = [...summaries];
  for (const contract of contracts.values()) {
    if (!routineNames.has(contract.name)) {
      out.push(applyRoutineContract(emptyRoutineSummary(contract.name), contract));
    }
  }
  return out;
}

function buildBoundarySummaryMap(
  summaries: RoutineSummary[],
  routineSummaries: Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }>,
  profileSummaries: RoutineSummary[],
): Map<string, RoutineSummary> {
  const boundarySummaryMap = new Map(profileSummaries.map((summary) => [summary.name, summary]));
  for (const summary of summaries) {
    boundarySummaryMap.set(summary.name, summary);
  }
  for (const { routine, summary } of routineSummaries) {
    for (const label of nonLocalLabels(routine.labels)) {
      boundarySummaryMap.set(label, summary);
    }
  }
  return boundarySummaryMap;
}

function summarizeRoutines(
  routines: RegisterCareRoutine[],
  contracts: Map<string, RoutineContract>,
  boundarySummaryMap: ReadonlyMap<string, RoutineSummary> = new Map(),
): Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }> {
  return routines.map((routine) => {
    const inferred = inferRoutineSummary(routine, boundarySummaryMap);
    const contract = contractForRoutine(routine.labels, contracts);
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
  routineSummaries: Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }>,
): string {
  return routineSummaries.map((item) => summaryFingerprint(item.summary)).join('\n');
}

function inferRoutineSummariesToFixedPoint(
  routines: RegisterCareRoutine[],
  contracts: Map<string, RoutineContract>,
  routineNames: Set<string>,
  profileSummaries: RoutineSummary[],
): Array<{ routine: RegisterCareRoutine; summary: RoutineSummary }> {
  let routineSummaries = summarizeRoutines(routines, contracts);
  const maxPasses = Math.max(2, routines.length + 2);

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const summaries = summariesWithExternalContracts(
      routineSummaries.map((item) => item.summary),
      contracts,
      routineNames,
    );
    const boundarySummaryMap = buildBoundarySummaryMap(
      summaries,
      routineSummaries,
      profileSummaries,
    );
    const nextRoutineSummaries = summarizeRoutines(routines, contracts, boundarySummaryMap);
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

export function analyzeRegisterCare(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
  const profile = getRegisterCareProfile(options.profile);
  const programModel = buildRegisterCareProgramModel(loaded.program);
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const contracts = buildRoutineContracts(smartComments, programModel.routines, loaded.sourceTexts);
  const routineNames = new Set(
    programModel.routines.flatMap((routine) => nonLocalLabels(routine.labels)),
  );
  const profileSummaries = profile
    ? [...Array.from(profile.rst.values()), ...Array.from(profile.rstServices.values())]
    : [];
  const routineSummaries = inferRoutineSummariesToFixedPoint(
    programModel.routines,
    contracts,
    routineNames,
    profileSummaries,
  );
  const summaries = routineSummaries.map((item) => item.summary);
  summaries.push(...summariesWithExternalContracts([], contracts, routineNames));
  const boundarySummaryMap = buildBoundarySummaryMap(summaries, routineSummaries, profileSummaries);
  const unknownBoundaries = programModel.directBoundaries
    .filter((boundary) => !boundarySummaryMap.has(boundary.target))
    .map(unknownBoundaryForCall);
  const conflicts = programModel.routines.flatMap((routine) =>
    findRegisterCareConflicts(routine, boundarySummaryMap, smartComments),
  );
  const conflictDiagnostics =
    options.mode === 'warn' || options.mode === 'strict'
      ? diagnosticsForRegisterCareConflicts(conflicts, 'warning')
      : options.mode === 'error'
        ? diagnosticsForRegisterCareConflicts(conflicts, 'error')
        : [];
  const diagnostics =
    options.mode === 'strict'
      ? [...conflictDiagnostics, ...diagnosticsForUnknownBoundaries(unknownBoundaries)]
      : conflictDiagnostics;
  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    ...(profile ? { profile: profile.name } : {}),
    summaries,
    conflicts,
    unknownCalls: uniqueSortedTargets(unknownBoundaries),
  };

  return {
    diagnostics,
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
  };
}
