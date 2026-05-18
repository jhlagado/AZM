import type { Diagnostic } from '../diagnosticTypes.js';
import type { LoadedProgram } from '../moduleLoader.js';
import { analyzeRegisterCare, type AnalyzeRegisterCareOptions } from './analyze.js';
import { azmDocList } from './report.js';
import type { RegisterCareOutputCandidate, RegisterCareUnit } from './types.js';

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
  codeAction: RegisterCareCodeAction;
}

export interface AnalyzeRegisterCareForToolsOptions
  extends Omit<AnalyzeRegisterCareOptions, 'emitReport' | 'emitInterface' | 'emitAnnotations'> {
  emitReport?: boolean;
  emitInterface?: boolean;
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
  return `; expects out ${azmDocList(carriers)}\n`;
}

export function codeActionForOutputCandidate(
  candidate: RegisterCareOutputCandidate,
): RegisterCareCodeAction {
  return {
    title: `Confirm ${candidate.routine} output ${azmDocList(candidate.carriers)}`,
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
  const codeAction = codeActionForOutputCandidate(candidate);
  return {
    kind: 'register-care-output-candidate',
    severity: 'info',
    file: candidate.file,
    line: candidate.line,
    column: candidate.column,
    routine: candidate.routine,
    carriers: candidate.carriers,
    autoFixable: candidate.autoFixable === true,
    message: candidate.message,
    codeAction,
  };
}

export function analyzeRegisterCareForTools(
  loaded: LoadedProgram,
  options: AnalyzeRegisterCareForToolsOptions,
): AnalyzeRegisterCareForToolsResult {
  const result = analyzeRegisterCare(loaded, {
    ...options,
    emitReport: options.emitReport === true,
    emitInterface: options.emitInterface === true,
    emitAnnotations: false,
  });
  const outputCandidates = result.outputCandidates ?? [];
  const candidateDiagnostics = outputCandidates.map(diagnosticForOutputCandidate);

  return {
    diagnostics: result.diagnostics,
    outputCandidates,
    candidateDiagnostics,
    codeActions: candidateDiagnostics.map((diagnostic) => diagnostic.codeAction),
    ...(result.reportText !== undefined ? { reportText: result.reportText } : {}),
    ...(result.interfaceText !== undefined ? { interfaceText: result.interfaceText } : {}),
  };
}
