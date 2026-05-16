import type { Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../moduleLoader.js';
import { diagnosticsForRegisterCareConflicts, findRegisterCareConflicts } from './liveness.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
import { buildRoutineContracts, parseSmartComments } from './smartComments.js';
import { applyRoutineContract, inferRoutineSummary } from './summary.js';
import type { RegisterCareMode, RegisterCareReportModel, RoutineSummary } from './types.js';

export interface AnalyzeRegisterCareOptions {
  mode: RegisterCareMode;
  emitReport: boolean;
  emitInterface: boolean;
  profile?: 'mon3';
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

export function analyzeRegisterCare(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
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
  const summaryMap = new Map(summaries.map((summary) => [summary.name, summary]));
  const conflicts = programModel.routines.flatMap((routine) =>
    findRegisterCareConflicts(routine, summaryMap, smartComments),
  );
  const diagnostics =
    options.mode === 'warn' || options.mode === 'strict'
      ? diagnosticsForRegisterCareConflicts(conflicts, 'warning')
      : options.mode === 'error'
        ? diagnosticsForRegisterCareConflicts(conflicts, 'error')
        : [];
  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries,
    conflicts,
    unknownCalls: [],
  };

  return {
    diagnostics,
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
  };
}
