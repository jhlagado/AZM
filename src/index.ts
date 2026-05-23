export { compileSource, compileNext } from './core/compile.js';
export type {
  CompileOptions,
  CompileSourceResult,
  CompileNextOptions,
  CompileNextResult,
} from './core/compile.js';
export { compileArtifacts, compileNextArtifacts } from './core/compile-artifacts.js';
export type {
  CompileArtifactOptions,
  CompileArtifactsResult,
  SourceArtifact,
  CompileNextArtifactOptions,
  CompileNextArtifactsResult,
  NextArtifact,
} from './core/compile-artifacts.js';
export { formatDiagnostic, formatNextDiagnostic } from './diagnostics/format.js';
export { analyzeProgram, loadProgram, analyzeProgramNext, loadProgramNext } from './tooling/api.js';
export { DiagnosticIds } from './model/diagnostic.js';
export type { DiagnosticId, DiagnosticSeverity, Diagnostic } from './model/diagnostic.js';
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
  CompileDependencies,
  CompileFunctionOptions,
  CompileResult,
  CompileNextDependencies,
  CompileNextFunctionOptions,
  EmittedByteMap,
  FormatWriters,
  CompileNextResult as CompileNextProgramResult,
} from './api-compile.js';
export type {
  AnalyzeProgramOptions,
  AnalyzeProgramResult,
  LoadProgramOptions,
  LoadProgramResult,
  LoadedProgram,
  AnalyzeProgramNextOptions,
  AnalyzeProgramNextResult,
  LoadProgramNextOptions,
  LoadProgramNextResult,
  LoadedProgramNext,
} from './tooling/api.js';
export type { CaseStyleMode } from './tooling/case-style.js';
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
