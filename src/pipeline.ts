import type { Diagnostic } from './diagnosticTypes.js';
import type { Artifact, FormatWriters } from './formats/types.js';
import type { RegisterCareMode } from './registerCare/types.js';

export type CaseStyleMode = 'off' | 'upper' | 'lower' | 'consistent';

/**
 * Options that influence compilation behavior and which artifacts are produced.
 *
 * PR1 implementation note: most options are accepted but only a subset is currently honored.
 */
export interface CompilerOptions {
  /**
   * Additional include/search directories used for textual includes and input assets.
   *
   * These directories are consulted after checking paths relative to the
   * importing source file.
   */
  includeDirs?: string[];
  /** Primary output path used to derive sibling artifacts (future). */
  outputPath?: string;
  /** Primary output type (future). */
  outputType?: 'hex' | 'bin';
  /** Emit flat binary (`.bin`). */
  emitBin?: boolean;
  /** Emit Intel HEX (`.hex`). */
  emitHex?: boolean;
  /** Emit D8 Debug Map (`.d8.json`). */
  emitD8m?: boolean;
  /** Emit listing (`.lst`). */
  emitListing?: boolean;
  /** Emit ASM80-compatible lowered source (`.asm`). */
  emitAsm80?: boolean;
  /** Optional case-style lint mode for asm keywords/register tokens. */
  caseStyle?: CaseStyleMode;
  /** Require a `main` entry label for runnable builds. */
  requireMain?: boolean;
  /** Default code base address. */
  defaultCodeBase?: number;
  /** JSON directive alias files. Later files extend or override earlier aliases. */
  directiveAliasFiles?: string[];
  /** Register-care analysis mode. */
  registerCare?: RegisterCareMode;
  /** Emit a register-care audit report artifact. */
  emitRegisterReport?: boolean;
  /** Emit an inferred register-care interface artifact. */
  emitRegisterInterface?: boolean;
  /** Rewrite source files with inferred register-care contract blocks. */
  emitRegisterAnnotations?: boolean;
  /** Apply conservative register-care source fixes. Implies source annotations. */
  fixRegisterContracts?: boolean;
  /**
   * Promote selected caller-use output candidates while rewriting register-care
   * source annotations. Entries use `ROUTINE:carriers`, for example `MxMask:A`.
   */
  acceptRegisterOutputCandidates?: string[];
  /** Register-care analysis profile. */
  registerCareProfile?: 'mon3';
  /** AZMI interface files that provide register-care contracts for external/library routines. */
  registerCareInterfaces?: string[];
}

/**
 * Result of a compilation run: diagnostics plus any produced artifacts.
 */
export interface CompileResult {
  diagnostics: Diagnostic[];
  artifacts: Artifact[];
}

/**
 * Dependency injection surface for the compiler pipeline.
 *
 * Callers provide concrete format writers so the core pipeline can be pure/in-memory.
 */
export interface PipelineDeps {
  formats: FormatWriters;
}

/**
 * Top-level compile function signature used by the pipeline contract.
 */
export type CompileFn = (
  entryFile: string,
  options: CompilerOptions,
  deps: PipelineDeps,
) => Promise<CompileResult>;
