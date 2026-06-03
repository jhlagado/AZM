import { extname, resolve } from 'node:path';

import type { CompileNextFunctionOptions } from '../api-compile.js';
import type { Artifact } from '../outputs/types.js';
import { writeArtifactFiles } from './artifact-files.js';
import type { CliOptions } from './parse-args.js';

function normalizeDiagnosticPath(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function compareDiagnostics(aSource: string, bSource: string): number {
  const aNormalized = normalizeDiagnosticPath(aSource || '');
  const bNormalized = normalizeDiagnosticPath(bSource || '');
  return aNormalized.localeCompare(bNormalized);
}

export function compareDiagnosticsForCli(
  a: {
    sourceName?: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
  },
  b: {
    sourceName?: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning' | 'info';
    code: string;
    message: string;
  },
): number {
  const sourceCmp = compareDiagnostics(a.sourceName ?? '', b.sourceName ?? '');
  if (sourceCmp !== 0) return sourceCmp;

  const lineCmp = (a.line ?? Number.POSITIVE_INFINITY) - (b.line ?? Number.POSITIVE_INFINITY);
  if (lineCmp !== 0) return lineCmp;

  const columnCmp = (a.column ?? Number.POSITIVE_INFINITY) - (b.column ?? Number.POSITIVE_INFINITY);
  if (columnCmp !== 0) return columnCmp;

  const severityRank = (severity: 'error' | 'warning' | 'info') => {
    if (severity === 'error') return 0;
    if (severity === 'warning') return 1;
    return 2;
  };
  const severityCmp = severityRank(a.severity) - severityRank(b.severity);
  if (severityCmp !== 0) return severityCmp;

  const codeCmp = a.code.localeCompare(b.code);
  if (codeCmp !== 0) return codeCmp;
  return a.message.localeCompare(b.message);
}

export function artifactBase(
  entryFile: string,
  outputType: 'hex' | 'bin',
  outputPath?: string,
): string {
  if (outputPath !== undefined) {
    const resolvedOutputPath = resolve(outputPath);
    const providedExt = extname(resolvedOutputPath);
    return providedExt.length > 0
      ? resolvedOutputPath.slice(0, -providedExt.length)
      : resolvedOutputPath;
  }

  const resolvedEntry = resolve(entryFile);
  const entryExt = extname(resolvedEntry);
  return entryExt.length > 0 ? resolvedEntry.slice(0, -entryExt.length) : resolvedEntry;
}

export async function writeArtifacts(
  base: string,
  artifacts: readonly Artifact[],
  outputType: 'hex' | 'bin',
): Promise<string | undefined> {
  const result = await writeArtifactFiles(
    artifacts,
    {
      hex: `${base}.hex`,
      bin: `${base}.bin`,
      d8m: `${base}.d8.json`,
      asm80: `${base}.z80`,
      registerContractsReport: `${base}.regcontracts.txt`,
      registerContractsInterface: `${base}.asmi`,
    },
    outputType,
  );
  return result.primaryPath ?? result.registerContractsPath;
}

export function buildCompileOptions(parsed: CliOptions, base: string): CompileNextFunctionOptions {
  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  return {
    includeDirs: parsed.includeDirs,
    directiveAliasFiles: parsed.directiveAliasFiles,
    emitBin: parsed.emitBin,
    emitHex: parsed.emitHex,
    emitD8m: parsed.emitD8m,
    emitAsm80: parsed.emitAsm80,
    caseStyle: parsed.caseStyle,
    registerContracts: parsed.registerContracts,
    emitRegisterReport: parsed.emitRegisterReport,
    emitRegisterInterface: parsed.emitRegisterInterface,
    emitRegisterAnnotations: parsed.emitRegisterAnnotations,
    fixRegisterContracts: parsed.fixRegisterContracts,
    acceptRegisterOutputCandidates: parsed.acceptRegisterOutputCandidates,
    ...(parsed.registerContractsProfile !== undefined
      ? { registerContractsProfile: parsed.registerContractsProfile }
      : {}),
    registerContractsInterfaces: parsed.registerContractsInterfaces,
    ...(parsed.sourceRoot !== undefined ? { sourceRoot: parsed.sourceRoot } : {}),
    ...(parsed.sourceRoot !== undefined
      ? {
          d8mInputs: {
            ...(parsed.emitHex ? { hex: hexPath } : {}),
            ...(parsed.emitBin ? { bin: binPath } : {}),
          },
        }
      : {}),
  };
}
