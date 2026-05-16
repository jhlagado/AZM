import type { Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../moduleLoader.js';
import { diagnosticsForRegisterCareConflicts, findRegisterCareConflicts } from './liveness.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
import { parseSmartComments } from './smartComments.js';
import { inferRoutineSummary } from './summary.js';
import type { RegisterCareMode, RegisterCareReportModel } from './types.js';

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

export function analyzeRegisterCare(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareOptions,
): AnalyzeRegisterCareResult {
  const programModel = buildRegisterCareProgramModel(loaded.program);
  const smartComments = parseSmartComments(loaded.sourceLineComments);
  const summaries = programModel.routines.map(inferRoutineSummary);
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
