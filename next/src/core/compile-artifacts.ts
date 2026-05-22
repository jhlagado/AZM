import type { Diagnostic } from '../model/diagnostic.js';
import { compileNext, type CompileNextOptions } from './compile.js';

export interface CompileNextArtifactOptions extends CompileNextOptions {
  readonly emitBin?: boolean;
  readonly emitHex?: boolean;
}

export type NextArtifact =
  | {
      readonly kind: 'bin';
      readonly bytes: Uint8Array;
    }
  | {
      readonly kind: 'hex';
      readonly text: string;
    };

export interface CompileNextArtifactsResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly NextArtifact[];
}

export function compileNextArtifacts(
  sourceText: string,
  options: CompileNextArtifactOptions = {},
): CompileNextArtifactsResult {
  const result = compileNext(sourceText, options);
  if (result.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    return { diagnostics: result.diagnostics, artifacts: [] };
  }

  const artifacts: NextArtifact[] = [];
  if (options.emitBin !== false) {
    artifacts.push({ kind: 'bin', bytes: result.bytes });
  }
  if (options.emitHex !== false) {
    artifacts.push({ kind: 'hex', text: result.hexText });
  }
  return { diagnostics: result.diagnostics, artifacts };
}
