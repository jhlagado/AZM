export { analyzeProgram, analyzeProgramNext, loadProgram, loadProgramNext } from './tooling/api.js';
export {
  analyzeRegisterCareForTools,
  codeActionForOutputCandidate,
  diagnosticForOutputCandidate,
  type AnalyzeRegisterCareForToolsOptions,
  type AnalyzeRegisterCareForToolsResult,
  type RegisterCareCandidateDiagnostic,
  type RegisterCareCodeAction,
  type RegisterCareTextEdit,
} from './register-care/tooling.js';
export { DiagnosticIds } from './diagnosticTypes.js';
export type {
  AnalyzeProgramNextResult,
  AnalyzeProgramNextOptions,
  AnalyzeProgramResult,
  AnalyzeProgramOptions,
  LoadedProgram,
  LoadedProgramNext,
  LoadProgramOptions,
  LoadProgramNextOptions,
  LoadProgramResult,
  LoadProgramNextResult,
} from './tooling/api.js';
export type { CaseStyleMode } from './tooling/case-style.js';
export type { Diagnostic, DiagnosticId, DiagnosticSeverity } from './diagnosticTypes.js';
export type {
  BaseNode,
  ProgramNode,
  SourceFileNode,
  SourceItemNode,
  SourcePosition,
  SourceSpan,
} from '../legacy-root-azm/src/frontend/ast.js';
export type { CompileEnv } from '../legacy-root-azm/src/semantics/env.js';
export type {
  RegisterCareMode,
  RegisterCareOutputCandidate,
  RegisterCareUnit,
} from './register-care/types.js';
