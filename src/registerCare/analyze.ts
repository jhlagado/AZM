import type { Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../moduleLoader.js';
import type { RegisterCareMode } from './types.js';

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
  const mode = options.mode;
  const reportText = options.emitReport
    ? [
        'AZM Register-Care Report',
        `Entry: ${loaded.program.entryFile}`,
        `Mode: ${mode}`,
        '',
        'No routine summaries were inferred in this implementation slice.',
        '',
      ].join('\n')
    : undefined;
  return { diagnostics: [], ...(reportText ? { reportText } : {}) };
}
