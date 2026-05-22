import { compileNext } from '../../src/core/compile.js';
import type { AssemblerRunResult } from './compare-results.js';

export function runNextAzmSource(sourceText: string): AssemblerRunResult {
  try {
    const result = compileNext(sourceText);
    return {
      exitCode: result.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0,
      stdout: '',
      stderr: result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'),
      hexText: result.hexText,
      binBytes: result.bytes,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: String(error instanceof Error ? error.message : error),
    };
  }
}
