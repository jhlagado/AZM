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
  RegisterCareReportModel,
  RegisterCareUnknownBoundary,
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
    message: `Register-care cannot prove CALL ${call.target}; add a routine body or @extern contract.`,
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

export function analyzeRegisterCare(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
  const profile = getRegisterCareProfile(options.profile);
  const programModel = buildRegisterCareProgramModel(loaded.program);
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const contracts = buildRoutineContracts(smartComments);
  const summaries = programModel.routines.map((routine) => {
    const inferred = inferRoutineSummary(routine);
    const contract = contracts.get(routine.name);
    return contract ? applyRoutineContract(inferred, contract) : inferred;
  });
  const routineNames = new Set(summaries.map((summary) => summary.name));
  for (const contract of contracts.values()) {
    if (!routineNames.has(contract.name)) {
      summaries.push(applyRoutineContract(emptyRoutineSummary(contract.name), contract));
    }
  }
  const profileSummaries = profile ? Array.from(profile.rst.values()) : [];
  const boundarySummaryMap = new Map(
    [...profileSummaries, ...summaries].map((summary) => [summary.name, summary]),
  );
  const unknownBoundaries = programModel.directCalls
    .filter((call) => !boundarySummaryMap.has(call.target))
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
