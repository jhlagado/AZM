import type { Diagnostic } from '../model/diagnostic.js';
import type { LoadedProgram } from '../tooling/api.js';
import { analyzeRegisterCare } from './analyze.js';
import { contractCarrierList } from './report.js';
import type {
  AnalyzeRegisterCareOptions,
  RegisterCareOutputCandidate,
  RegisterCareUnit,
} from './types.js';

export interface RegisterCareTextEdit {
  file: string;
  line: number;
  column: number;
  text: string;
}

export interface RegisterCareCodeAction {
  title: string;
  kind: 'quickfix';
  edit: RegisterCareTextEdit;
}

export interface RegisterCareCandidateDiagnostic {
  kind: 'register-care-output-candidate';
  severity: 'info';
  file: string;
  line: number;
  column: number;
  routine: string;
  carriers: RegisterCareUnit[];
  autoFixable: boolean;
  message: string;
  codeAction?: RegisterCareCodeAction;
}

export interface AnalyzeRegisterCareForToolsOptions extends Omit<
  AnalyzeRegisterCareOptions,
  'emitReport' | 'emitInterface' | 'emitAnnotations' | 'fixRegisterContracts'
> {
  emitReport?: boolean;
  emitInterface?: boolean;
  /** Back-compat alias for registerCareProfile used by some tooling integrations. */
  profile?: AnalyzeRegisterCareOptions['registerCareProfile'];
}

export interface AnalyzeRegisterCareForToolsResult {
  diagnostics: Diagnostic[];
  outputCandidates: RegisterCareOutputCandidate[];
  candidateDiagnostics: RegisterCareCandidateDiagnostic[];
  codeActions: RegisterCareCodeAction[];
  reportText?: string;
  interfaceText?: string;
}

function expectOutText(carriers: RegisterCareUnit[]): string {
  return `; expects out ${contractCarrierList(carriers)}\n`;
}

export function codeActionForOutputCandidate(
  candidate: RegisterCareOutputCandidate,
): RegisterCareCodeAction {
  return {
    title: `Confirm ${candidate.routine} output ${contractCarrierList(candidate.carriers)}`,
    kind: 'quickfix',
    edit: {
      file: candidate.file,
      line: candidate.line,
      column: 1,
      text: expectOutText(candidate.carriers),
    },
  };
}

export function diagnosticForOutputCandidate(
  candidate: RegisterCareOutputCandidate,
): RegisterCareCandidateDiagnostic {
  const codeAction =
    candidate.autoFixable === true ? codeActionForOutputCandidate(candidate) : undefined;
  const diagnostic: RegisterCareCandidateDiagnostic = {
    kind: 'register-care-output-candidate',
    severity: 'info',
    file: candidate.file,
    line: candidate.line,
    column: candidate.column,
    routine: candidate.routine,
    carriers: candidate.carriers,
    autoFixable: candidate.autoFixable === true,
    message: candidate.message,
  };
  if (codeAction !== undefined) {
    diagnostic.codeAction = codeAction;
  }
  return diagnostic;
}

export function analyzeRegisterCareForTools(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareForToolsOptions,
): AnalyzeRegisterCareForToolsResult {
  const profile = options.registerCareProfile ?? options.profile;
  const baseResultOptions = {
    ...options,
    emitReport: options.emitReport === true,
    emitInterface: options.emitInterface === true,
    emitAnnotations: false,
    fixRegisterContracts: false,
  };
  const result = analyzeRegisterCare(
    loaded,
    profile === undefined
      ? baseResultOptions
      : { ...baseResultOptions, registerCareProfile: profile },
  );
  const outputCandidates = result.outputCandidates ?? [];
  const candidateDiagnostics = outputCandidates.map(diagnosticForOutputCandidate);
  const codeActions = outputCandidates
    .filter((candidate) => candidate.autoFixable === true)
    .map(codeActionForOutputCandidate);

  return {
    diagnostics: result.diagnostics,
    outputCandidates,
    candidateDiagnostics,
    codeActions,
    ...(result.reportText !== undefined ? { reportText: result.reportText } : {}),
    ...(result.interfaceText !== undefined ? { interfaceText: result.interfaceText } : {}),
  };
}
