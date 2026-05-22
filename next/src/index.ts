export { compileNext } from './core/compile.js';
export type { CompileNextOptions, CompileNextResult } from './core/compile.js';
export { compileNextArtifacts } from './core/compile-artifacts.js';
export type {
  CompileNextArtifactOptions,
  CompileNextArtifactsResult,
  NextArtifact,
} from './core/compile-artifacts.js';
export { formatNextDiagnostic } from './diagnostics/format.js';
export { analyzeProgram, analyzeProgramNext, loadProgram, loadProgramNext } from './tooling/api.js';
export {
  analyzeRegisterCareForTools,
  type AnalyzeRegisterCareForToolsOptions,
  type AnalyzeRegisterCareForToolsResult,
  type RegisterCareCandidateDiagnostic,
  type RegisterCareCodeAction,
} from './register-care/tooling.js';
export { compile, defaultFormatWriters, writeHex } from './api-compile.js';
export type {
  AddressRange,
  Artifact,
  CompileNextDependencies,
  CompileNextFunctionOptions,
  EmittedByteMap,
  FormatWriters,
  CompileNextResult as CompileNextProgramResult,
} from './api-compile.js';
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
export type {
  D8mArtifact,
  D8mGenerator,
  D8mJson,
  D8mFileEntry,
  D8mFileSymbol,
  D8mSegment,
  D8mSymbol,
  SymbolEntry,
  WriteD8mOptions,
} from './outputs/types.js';
