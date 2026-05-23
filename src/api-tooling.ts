export { analyzeProgram, analyzeProgramNext, loadProgram, loadProgramNext } from './tooling/api.js';
export {
  analyzeRegisterCareForTools,
  type AnalyzeRegisterCareForToolsOptions,
  type AnalyzeRegisterCareForToolsResult,
  type RegisterCareCandidateDiagnostic,
  type RegisterCareCodeAction,
} from './register-care/tooling.js';
export type {
  AnalyzeProgramNextResult,
  AnalyzeProgramResult,
  LoadedProgram,
  LoadedProgramNext,
  LoadProgramOptions,
  LoadProgramNextOptions,
  LoadProgramResult,
  LoadProgramNextResult,
} from './tooling/api.js';
