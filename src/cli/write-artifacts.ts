import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';

import type { CompileNextFunctionOptions } from '../api-compile.js';
import type { Artifact } from '../outputs/types.js';
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
  a: { sourceName?: string; line?: number; column?: number; severity: 'error' | 'warning' | 'info'; code: string; message: string },
  b: { sourceName?: string; line?: number; column?: number; severity: 'error' | 'warning' | 'info'; code: string; message: string },
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

export function artifactBase(entryFile: string, outputType: 'hex' | 'bin', outputPath?: string): string {
  if (outputPath !== undefined) {
    const resolvedOutputPath = resolve(outputPath);
    const providedExt = extname(resolvedOutputPath);
    return providedExt.length > 0 ? resolvedOutputPath.slice(0, -providedExt.length) : resolvedOutputPath;
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
  const byKind = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    byKind.set(artifact.kind, artifact);
  }

  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  const d8mPath = `${base}.d8.json`;
  const lstPath = `${base}.lst`;
  const asm80Path = `${base}.z80`;
  const registerCareReportPath = `${base}.regcare.txt`;
  const registerCareInterfacePath = `${base}.asmi`;

  const writes: Promise<void>[] = [];
  const ensureDir = async (path: string): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
  };
  let primaryPath: string | undefined;
  let registerCarePath: string | undefined;

  const bin = byKind.get('bin');
  if (bin && bin.kind === 'bin') {
    writes.push(
      (async () => {
        await ensureDir(binPath);
        await writeFile(binPath, Buffer.from(bin.bytes));
      })(),
    );
    if (outputType === 'bin') {
      primaryPath = binPath;
    }
  }

  const hex = byKind.get('hex');
  if (hex && hex.kind === 'hex') {
    writes.push(
      (async () => {
        await ensureDir(hexPath);
        await writeFile(hexPath, hex.text, 'utf8');
      })(),
    );
    if (outputType === 'hex') {
      primaryPath = hexPath;
    }
  }

  const d8m = byKind.get('d8m');
  if (d8m && d8m.kind === 'd8m') {
    writes.push(
      (async () => {
        await ensureDir(d8mPath);
        const text = JSON.stringify(d8m.json, null, 2);
        await writeFile(d8mPath, `${text}\n`, 'utf8');
      })(),
    );
  }

  const lst = byKind.get('lst');
  if (lst && lst.kind === 'lst') {
    writes.push(
      (async () => {
        await ensureDir(lstPath);
        await writeFile(lstPath, lst.text, 'utf8');
      })(),
    );
  }

  const asm80 = byKind.get('asm80');
  if (asm80 && asm80.kind === 'asm80') {
    writes.push(
      (async () => {
        await ensureDir(asm80Path);
        await writeFile(asm80Path, asm80.text, 'utf8');
      })(),
    );
  }
  const registerCareReport = byKind.get('register-care-report');
  if (registerCareReport && registerCareReport.kind === 'register-care-report') {
    writes.push(
      (async () => {
        await ensureDir(registerCareReportPath);
        await writeFile(registerCareReportPath, registerCareReport.text, 'utf8');
      })(),
    );
    registerCarePath = registerCareReportPath;
  }

  const registerCareInterface = byKind.get('register-care-interface');
  if (registerCareInterface && registerCareInterface.kind === 'register-care-interface') {
    writes.push(
      (async () => {
        await ensureDir(registerCareInterfacePath);
        await writeFile(registerCareInterfacePath, registerCareInterface.text, 'utf8');
      })(),
    );
    registerCarePath ??= registerCareInterfacePath;
  }

  const registerCareAnnotations = byKind.get('register-care-annotations');
  if (registerCareAnnotations && registerCareAnnotations.kind === 'register-care-annotations') {
    for (const item of registerCareAnnotations.files) {
      writes.push(
        (async () => {
          await ensureDir(item.path);
          await writeFile(item.path, item.text, 'utf8');
        })(),
      );
      if (primaryPath === undefined) {
        primaryPath = item.path;
      }
    }
  }

  await Promise.all(writes);
  if (primaryPath !== undefined) {
    return primaryPath;
  }
  return registerCarePath;
}

export function buildCompileOptions(parsed: CliOptions, base: string): CompileNextFunctionOptions {
  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  const lstPath = `${base}.lst`;

  return {
    includeDirs: parsed.includeDirs,
    directiveAliasFiles: parsed.directiveAliasFiles,
    emitBin: parsed.emitBin,
    emitHex: parsed.emitHex,
    emitD8m: parsed.emitD8m,
    emitListing: parsed.emitListing,
    emitAsm80: parsed.emitAsm80,
    caseStyle: parsed.caseStyle,
    registerCare: parsed.registerCare,
    emitRegisterReport: parsed.emitRegisterReport,
    emitRegisterInterface: parsed.emitRegisterInterface,
    emitRegisterAnnotations: parsed.emitRegisterAnnotations,
    fixRegisterContracts: parsed.fixRegisterContracts,
    acceptRegisterOutputCandidates: parsed.acceptRegisterOutputCandidates,
    ...(parsed.registerCareProfile !== undefined
      ? { registerCareProfile: parsed.registerCareProfile }
      : {}),
    registerCareInterfaces: parsed.registerCareInterfaces,
    ...(parsed.sourceRoot !== undefined ? { sourceRoot: parsed.sourceRoot } : {}),
    ...(parsed.sourceRoot !== undefined
      ? {
          d8mInputs: {
            ...(parsed.emitListing ? { listing: lstPath } : {}),
            ...(parsed.emitHex ? { hex: hexPath } : {}),
            ...(parsed.emitBin ? { bin: binPath } : {}),
          },
        }
      : {}),
  };
}
