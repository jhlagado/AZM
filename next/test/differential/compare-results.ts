export interface AssemblerRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly hexText?: string;
  readonly binBytes?: Uint8Array;
}

export interface Difference {
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
}

export function compareRunResults(
  expected: AssemblerRunResult,
  actual: AssemblerRunResult,
): Difference[] {
  const differences: Difference[] = [];
  if (expected.exitCode !== actual.exitCode) {
    differences.push({
      field: 'exitCode',
      expected: String(expected.exitCode),
      actual: String(actual.exitCode),
    });
  }
  if ((expected.hexText ?? '') !== (actual.hexText ?? '')) {
    differences.push({
      field: 'hexText',
      expected: expected.hexText ?? '',
      actual: actual.hexText ?? '',
    });
  }
  return differences;
}
