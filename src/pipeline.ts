import type { Diagnostic } from './diagnosticTypes.js';
import type { SourceMode } from './frontend/sourceMode.js';
import type { Artifact, FormatWriters } from './formats/types.js';

export type CaseStyleMode = 'off' | 'upper' | 'lower' | 'consistent';
export type OpStackPolicyMode = 'off' | 'warn' | 'error';

/**
 * Options that influence compilation behavior and which artifacts are produced.
 *
 * PR1 implementation note: most options are accepted but only a subset is currently honored.
 */
export interface CompilerOptions {
  /**
   * Additional include/search directories used for module resolution.
   *
   * These directories are consulted when resolving `import` statements after checking paths relative to the
   * importing module.
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
  /** Optional op stack-policy static risk mode (`off` by default). */
  opStackPolicy?: OpStackPolicyMode;
  /** Emit warnings when raw `call` targets a typed callable symbol. */
  rawTypedCallWarnings?: boolean;
  /** Require a callable `main` entry symbol for runnable builds. */
  requireMain?: boolean;
  /** Default code section base address when no `section code at` is provided. */
  defaultCodeBase?: number;
  /** Source syntax mode. When omitted, inferred from the entry file extension. */
  sourceMode?: SourceMode;
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
