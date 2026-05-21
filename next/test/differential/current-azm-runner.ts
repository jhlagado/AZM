import type { AssemblerRunResult } from './compare-results.js';

export function runCurrentAzmSource(_sourceText: string): AssemblerRunResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: 'current AZM differential runner is not implemented yet',
  };
}
