import type { Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../moduleLoader.js';
import { buildRegisterCareProgramModel } from './programModel.js';
import { renderRegisterCareInterface, renderRegisterCareReport } from './report.js';
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
  const summaries = programModel.routines.map(inferRoutineSummary);
  const reportModel: RegisterCareReportModel = {
    entryFile: loaded.program.entryFile,
    mode: options.mode,
    summaries,
    conflicts: [],
    unknownCalls: [],
  };

  return {
    diagnostics: [],
    ...(options.emitReport ? { reportText: renderRegisterCareReport(reportModel) } : {}),
    ...(options.emitInterface ? { interfaceText: renderRegisterCareInterface(summaries) } : {}),
  };
}
