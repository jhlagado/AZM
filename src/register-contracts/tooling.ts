import type { Diagnostic } from '../model/diagnostic.js';
import type { LoadedProgram } from '../tooling/api.js';
import { analyzeRegisterContracts } from './analyze.js';
import { contractCarrierList } from './report.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsFinding,
  RegisterContractsOutputCandidate,
  RegisterContractsUnit,
} from './types.js';

export interface RegisterContractsTextEdit {
  file: string;
  line: number;
  column: number;
  text: string;
}

/** @deprecated Use RegisterContractsTextEdit. */
export type RegisterCareTextEdit = RegisterContractsTextEdit;

export interface RegisterContractsCodeAction {
  title: string;
  kind: 'quickfix';
  edit: RegisterContractsTextEdit;
}

/** @deprecated Use RegisterContractsCodeAction. */
export type RegisterCareCodeAction = RegisterContractsCodeAction;

export interface RegisterContractsCandidateDiagnostic {
  kind: 'register-contracts-output-candidate';
  severity: 'info';
  file: string;
  line: number;
  column: number;
  routine: string;
  carriers: RegisterContractsUnit[];
  autoFixable: boolean;
  message: string;
  codeAction?: RegisterContractsCodeAction;
}

/** @deprecated Use RegisterContractsCandidateDiagnostic. */
export type RegisterCareCandidateDiagnostic = RegisterContractsCandidateDiagnostic;

export interface AnalyzeRegisterContractsForToolsOptions extends Omit<
  AnalyzeRegisterContractsOptions,
  'emitReport' | 'emitInterface' | 'emitAnnotations' | 'fixRegisterContracts'
> {
  emitReport?: boolean;
  emitInterface?: boolean;
  /** Back-compat alias for registerContractsProfile used by some tooling integrations. */
  profile?: AnalyzeRegisterContractsOptions['registerContractsProfile'];
  /** @deprecated Use registerContractsProfile. */
  registerCareProfile?: AnalyzeRegisterContractsOptions['registerContractsProfile'];
}

/** @deprecated Use AnalyzeRegisterContractsForToolsOptions. */
export type AnalyzeRegisterCareForToolsOptions = AnalyzeRegisterContractsForToolsOptions;

export interface AnalyzeRegisterContractsForToolsResult {
  diagnostics: Diagnostic[];
  findings: RegisterContractsFinding[];
  outputCandidates: RegisterContractsOutputCandidate[];
  candidateDiagnostics: RegisterContractsCandidateDiagnostic[];
  codeActions: RegisterContractsCodeAction[];
  reportText?: string;
  interfaceText?: string;
}

/** @deprecated Use AnalyzeRegisterContractsForToolsResult. */
export type AnalyzeRegisterCareForToolsResult = AnalyzeRegisterContractsForToolsResult;

function expectOutText(carriers: RegisterContractsUnit[]): string {
  return `; expects out ${contractCarrierList(carriers)}\n`;
}

export function codeActionForOutputCandidate(
  candidate: RegisterContractsOutputCandidate,
): RegisterContractsCodeAction {
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
  candidate: RegisterContractsOutputCandidate,
): RegisterContractsCandidateDiagnostic {
  const codeAction =
    candidate.autoFixable === true ? codeActionForOutputCandidate(candidate) : undefined;
  const diagnostic: RegisterContractsCandidateDiagnostic = {
    kind: 'register-contracts-output-candidate',
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

export function analyzeRegisterContractsForTools(
  loaded: LoadedProgram,
  options: AnalyzeRegisterContractsForToolsOptions,
): AnalyzeRegisterContractsForToolsResult {
  const profile =
    options.registerContractsProfile ?? options.registerCareProfile ?? options.profile;
  const baseResultOptions = {
    ...options,
    emitReport: options.emitReport === true,
    emitInterface: options.emitInterface === true,
    emitAnnotations: false,
    fixRegisterContracts: false,
  };
  const result = analyzeRegisterContracts(
    loaded,
    profile === undefined
      ? baseResultOptions
      : { ...baseResultOptions, registerContractsProfile: profile },
  );
  const outputCandidates = result.outputCandidates ?? [];
  const findings = result.findings ?? [];
  const candidateDiagnostics = outputCandidates.map(diagnosticForOutputCandidate);
  const codeActions = outputCandidates
    .filter((candidate) => candidate.autoFixable === true)
    .map(codeActionForOutputCandidate);

  return {
    diagnostics: result.diagnostics,
    findings,
    outputCandidates,
    candidateDiagnostics,
    codeActions,
    ...(result.reportText !== undefined ? { reportText: result.reportText } : {}),
    ...(result.interfaceText !== undefined ? { interfaceText: result.interfaceText } : {}),
  };
}

/** @deprecated Use analyzeRegisterContractsForTools. */
export const analyzeRegisterCareForTools = analyzeRegisterContractsForTools;
