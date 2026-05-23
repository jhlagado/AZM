import type { Diagnostic } from '../model/diagnostic.js';
import { compileSource, type CompileOptions } from './compile.js';

export type CompileArtifactOptions = CompileOptions & {
  readonly emitBin?: boolean;
  readonly emitHex?: boolean;
};

/** @deprecated Use {@link CompileArtifactOptions}. */
export type CompileNextArtifactOptions = CompileArtifactOptions;

export type SourceArtifact =
  | {
      readonly kind: 'bin';
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: 'hex';
      readonly text: string;
    };

/** @deprecated Use {@link SourceArtifact}. */
export type NextArtifact = SourceArtifact;

export interface CompileArtifactsResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly SourceArtifact[];
}

/** @deprecated Use {@link CompileArtifactsResult}. */
export type CompileNextArtifactsResult = CompileArtifactsResult;

export function compileArtifacts(
  sourceText: string,
  options: CompileArtifactOptions = {},
): CompileArtifactsResult {
  const result = compileSource(sourceText, options);
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { diagnostics: result.diagnostics, artifacts: [] };
  }

  const artifacts: SourceArtifact[] = [];
  if (options.emitBin !== false) {
    artifacts.push({ kind: 'bin', bytes: result.bytes });
  }
  if (options.emitHex !== false) {
    artifacts.push({ kind: 'hex', text: result.hexText });
  }
  return { diagnostics: result.diagnostics, artifacts };
}

/** @deprecated Use {@link compileArtifacts}. */
export const compileNextArtifacts = compileArtifacts;
