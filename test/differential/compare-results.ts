export interface AssemblerRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly hexText?: string;
  readonly binBytes?: Uint8Array;
  readonly d8mJson?: unknown;
  readonly asm80Text?: string;
  readonly diagnosticsText?: string[];
}

export interface Difference {
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
}

export interface CompareRunResultsOptions {
  readonly compareD8m?: boolean;
  readonly compareAsm80?: boolean;
}

export function compareRunResults(
  expected: AssemblerRunResult,
  actual: AssemblerRunResult,
  options: CompareRunResultsOptions = {},
): Difference[] {
  const differences: Difference[] = [];
  const compareArtifacts = expected.exitCode === 0 && actual.exitCode === 0;

  compareExitCode(differences, expected, actual);
  compareDiagnostics(differences, expected, actual);
  compareBinaryArtifacts(differences, expected, actual, compareArtifacts);
  compareOptionalArtifacts(differences, expected, actual, compareArtifacts, options);
  compareConsoleOutput(differences, expected, actual);

  return differences;
}

function compareExitCode(
  differences: Difference[],
  expected: AssemblerRunResult,
  actual: AssemblerRunResult,
): void {
  pushDifference(differences, 'exitCode', String(expected.exitCode), String(actual.exitCode));
}

function compareDiagnostics(
  differences: Difference[],
  expected: AssemblerRunResult,
  actual: AssemblerRunResult,
): void {
  pushDifference(
    differences,
    'diagnosticsText',
    normalizeDiagnosticText(expected.diagnosticsText),
    normalizeDiagnosticText(actual.diagnosticsText),
  );
}

function compareBinaryArtifacts(
  differences: Difference[],
  expected: AssemblerRunResult,
  actual: AssemblerRunResult,
  compareArtifacts: boolean,
): void {
  if (!compareArtifacts) return;
  pushDifference(
    differences,
    'binBytes',
    normalizeBytes(expected.binBytes),
    normalizeBytes(actual.binBytes),
  );
  pushDifference(differences, 'hexText', expected.hexText ?? '', actual.hexText ?? '');
}

function compareOptionalArtifacts(
  differences: Difference[],
  expected: AssemblerRunResult,
  actual: AssemblerRunResult,
  compareArtifacts: boolean,
  options: CompareRunResultsOptions,
): void {
  if (!compareArtifacts) return;
  if (options.compareD8m === true) {
    pushDifference(
      differences,
      'd8mJson',
      normalizeJson(expected.d8mJson),
      normalizeJson(actual.d8mJson),
    );
  }
  if (options.compareAsm80 === true) {
    pushDifference(
      differences,
      'asm80Text',
      normalizeText(expected.asm80Text ?? ''),
      normalizeText(actual.asm80Text ?? ''),
    );
  }
}

function compareConsoleOutput(
  differences: Difference[],
  expected: AssemblerRunResult,
  actual: AssemblerRunResult,
): void {
  pushDifference(
    differences,
    'stdout',
    normalizeText(expected.stdout),
    normalizeText(actual.stdout),
  );
  pushDifference(
    differences,
    'stderr',
    normalizeText(expected.stderr),
    normalizeText(actual.stderr),
  );
}

function pushDifference(
  differences: Difference[],
  field: string,
  expected: string,
  actual: string,
): void {
  if (expected === actual) return;
  differences.push({ field, expected, actual });
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
