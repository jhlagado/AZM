export interface AssemblerRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly hexText?: string;
  readonly binBytes?: Uint8Array;
  readonly listingText?: string;
  readonly d8mJson?: unknown;
  readonly diagnosticsText?: string[];
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

  if ((expected.diagnosticsText ?? []).join('\n') !== (actual.diagnosticsText ?? []).join('\n')) {
    differences.push({
      field: 'diagnosticsText',
      expected: normalizeDiagnosticText(expected.diagnosticsText),
      actual: normalizeDiagnosticText(actual.diagnosticsText),
    });
  }

  const compareArtifacts = expected.exitCode === 0 && actual.exitCode === 0;
  if (compareArtifacts) {
    const expectedBin = normalizeBytes(expected.binBytes);
    const actualBin = normalizeBytes(actual.binBytes);
    if (expectedBin !== actualBin) {
      differences.push({
        field: 'binBytes',
        expected: expectedBin,
        actual: actualBin,
      });
    }
  }

  if (compareArtifacts && (expected.hexText ?? '') !== (actual.hexText ?? '')) {
    differences.push({
      field: 'hexText',
      expected: expected.hexText ?? '',
      actual: actual.hexText ?? '',
    });
  }

  if (compareArtifacts && (expected.listingText ?? '') !== (actual.listingText ?? '')) {
    differences.push({
      field: 'listingText',
      expected: expected.listingText ?? '',
      actual: actual.listingText ?? '',
    });
  }

  if (compareArtifacts && normalizeJson(expected.d8mJson) !== normalizeJson(actual.d8mJson)) {
    differences.push({
      field: 'd8mJson',
      expected: normalizeJson(expected.d8mJson),
      actual: normalizeJson(actual.d8mJson),
    });
  }

  if (normalizeText(expected.stdout) !== normalizeText(actual.stdout)) {
    differences.push({
      field: 'stdout',
      expected: normalizeText(expected.stdout),
      actual: normalizeText(actual.stdout),
    });
  }

  if (normalizeText(expected.stderr) !== normalizeText(actual.stderr)) {
    differences.push({
      field: 'stderr',
      expected: normalizeText(expected.stderr),
      actual: normalizeText(actual.stderr),
    });
  }

  return differences;
}

function normalizeDiagnosticText(diagnostics: readonly string[] | undefined): string {
  return (diagnostics ?? []).join('\n');
}

function normalizeBytes(bytes: Uint8Array | undefined): string {
  if (!bytes) {
    return '';
  }
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function normalizeText(value: string): string {
  return (value ?? '').replace(/\r\n/g, '\n').trimEnd();
}

function normalizeJson(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  return JSON.stringify(sortJsonValue(value), null, 2);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortJsonValue(item)]),
    );
  }
  return value;
}
