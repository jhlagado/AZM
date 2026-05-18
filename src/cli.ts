#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from './compile.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { inferSourceMode, type SourceMode } from './frontend/sourceMode.js';
import { defaultFormatWriters } from './formats/index.js';
import type { Artifact } from './formats/types.js';
import type { CaseStyleMode, OpStackPolicyMode } from './pipeline.js';
import type { RegisterCareMode } from './registerCare/types.js';

type CliExit = { code: number };

type CliOptions = {
  entryFile: string;
  outputPath?: string;
  outputType: 'hex' | 'bin';
  emitBin: boolean;
  emitHex: boolean;
  emitD8m: boolean;
  emitListing: boolean;
  emitAsm80: boolean;
  caseStyle: CaseStyleMode;
  opStackPolicy: OpStackPolicyMode;
  rawTypedCallWarnings: boolean;
  includeDirs: string[];
  sourceMode: SourceMode;
  registerCare: RegisterCareMode;
  emitRegisterReport: boolean;
  emitRegisterInterface: boolean;
  annotateRegisterContracts: boolean;
  fixRegisterContracts: boolean;
  acceptRegisterOutputCandidates: string[];
  registerCareProfile?: 'mon3';
  registerCareInterfaces: string[];
};

type CliState = Omit<CliOptions, 'entryFile' | 'outputPath' | 'sourceMode'> & {
  entryFile: string | undefined;
  outputPath: string | undefined;
};

function usage(): string {
  return [
    'zax [options] <entry.zax>',
    '',
    'Options:',
    '  -o, --output <file>   Primary output path (must match --type extension)',
    '  -t, --type <type>     Primary output type: hex|bin (default: hex)',
    '  -n, --nolist          Suppress .lst',
    '      --nobin           Suppress .bin',
    '      --nohex           Suppress .hex',
    '      --nod8m           Suppress .d8.json',
    '      --asm80           Emit assembler-valid lowered source (.asm)',
    '      --case-style <m>  Case-style lint mode: off|upper|lower|consistent',
    '      --op-stack-policy <m> Op stack-policy mode: off|warn|error',
    '      --raw-typed-call-warn Emit warnings for raw call to typed callable targets',
    '      --rc <m>            Register-care mode: off|audit|warn|error|strict',
    '      --reg-report       Emit .regcare.txt report',
    '      --reg-interface    Emit inferred .azmi interface',
    '      --fix             Apply conservative register-care source fixes',
    '      --contracts       Update source AZM contract blocks in place',
    '      --accept-out <r:c> Promote inferred output candidate while annotating',
    '      --azmi <file>      Load register-care interface contracts',
    '      --reg-profile <p> Register-care profile: mon3',
    '  -I, --include <dir>   Add import search path (repeatable)',
    '  -V, --version         Print version',
    '  -h, --help            Show help',
    '',
    'Notes:',
    '  - <entry.zax> must be the last argument (assembler-style).',
    '  - Output artifacts are written next to the primary output using the artifact base name.',
    '',
  ].join('\n');
}

function fail(message: string): never {
  throw Object.assign(new Error(message), { name: 'CliError' });
}

function createDefaultCliState(): CliState {
  return {
    outputPath: undefined,
    outputType: 'hex',
    emitBin: true,
    emitHex: true,
    emitD8m: true,
    emitListing: true,
    emitAsm80: false,
    caseStyle: 'off',
    opStackPolicy: 'off',
    rawTypedCallWarnings: false,
    includeDirs: [],
    entryFile: undefined,
    registerCare: 'off',
    emitRegisterReport: false,
    emitRegisterInterface: false,
    annotateRegisterContracts: false,
    fixRegisterContracts: false,
    acceptRegisterOutputCandidates: [],
    registerCareInterfaces: [],
  };
}

function readFlagValue(argv: string[], indexRef: { current: number }, flag: string): string {
  const value = argv[++indexRef.current];
  if (!value) fail(`${flag} expects a value`);
  return value;
}

function parseOutputPathArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '-o' && arg !== '--output' && !arg.startsWith('--output=')) return false;
  if (arg.startsWith('--output=')) {
    const value = arg.slice('--output='.length);
    if (!value) fail(`--output expects a value`);
    state.outputPath = value;
    return true;
  }
  state.outputPath = readFlagValue(argv, indexRef, arg);
  return true;
}

function parseOutputTypeArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '-t' && arg !== '--type' && !arg.startsWith('--type=')) return false;
  const value = arg.startsWith('--type=')
    ? arg.slice('--type='.length)
    : readFlagValue(argv, indexRef, arg);
  if (!value) fail(`--type expects a value`);
  if (value !== 'hex' && value !== 'bin') fail(`Unsupported --type "${value}" (expected hex|bin)`);
  state.outputType = value;
  return true;
}

function parseCaseStyleArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '--case-style' && !arg.startsWith('--case-style=')) return false;
  const value = arg.startsWith('--case-style=')
    ? arg.slice('--case-style='.length)
    : readFlagValue(argv, indexRef, '--case-style');
  if (!value) fail(`--case-style expects a value`);
  if (value !== 'off' && value !== 'upper' && value !== 'lower' && value !== 'consistent') {
    fail(`Unsupported --case-style "${value}" (expected off|upper|lower|consistent)`);
  }
  state.caseStyle = value;
  return true;
}

function parseOpStackPolicyArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '--op-stack-policy' && !arg.startsWith('--op-stack-policy=')) return false;
  const value = arg.startsWith('--op-stack-policy=')
    ? arg.slice('--op-stack-policy='.length)
    : readFlagValue(argv, indexRef, '--op-stack-policy');
  if (!value) fail(`--op-stack-policy expects a value`);
  if (value !== 'off' && value !== 'warn' && value !== 'error') {
    fail(`Unsupported --op-stack-policy "${value}" (expected off|warn|error)`);
  }
  state.opStackPolicy = value;
  return true;
}

function parseRegisterCareArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  const flag = arg.startsWith('--register-care') ? '--register-care' : '--rc';
  if (
    arg !== '--register-care' &&
    arg !== '--rc' &&
    !arg.startsWith('--register-care=') &&
    !arg.startsWith('--rc=')
  ) {
    return false;
  }
  const value = arg.includes('=')
    ? arg.slice(arg.indexOf('=') + 1)
    : readFlagValue(argv, indexRef, flag);
  if (!value) fail(`${flag} expects a value`);
  if (
    value !== 'off' &&
    value !== 'audit' &&
    value !== 'warn' &&
    value !== 'error' &&
    value !== 'strict'
  ) {
    fail(`Unsupported ${flag} "${value}" (expected off|audit|warn|error|strict)`);
  }
  state.registerCare = value;
  return true;
}

function parseRegisterProfileArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  const flag = arg.startsWith('--register-profile') ? '--register-profile' : '--reg-profile';
  if (
    arg !== '--register-profile' &&
    arg !== '--reg-profile' &&
    !arg.startsWith('--register-profile=') &&
    !arg.startsWith('--reg-profile=')
  ) {
    return false;
  }
  const value = arg.includes('=')
    ? arg.slice(arg.indexOf('=') + 1)
    : readFlagValue(argv, indexRef, flag);
  if (!value) fail(`${flag} expects a value`);
  if (value !== 'mon3') {
    fail(`Unsupported ${flag} "${value}" (expected mon3)`);
  }
  state.registerCareProfile = value;
  return true;
}

function parseRegisterInterfaceInputArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '--azmi' && !arg.startsWith('--azmi=')) return false;
  const value = arg.includes('=')
    ? arg.slice(arg.indexOf('=') + 1)
    : readFlagValue(argv, indexRef, '--azmi');
  if (!value) fail(`--azmi expects a value`);
  state.registerCareInterfaces.push(value);
  return true;
}

function parseAcceptRegisterOutputArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  const flag = arg.startsWith('--accept-register-output')
    ? '--accept-register-output'
    : '--accept-out';
  if (
    arg !== '--accept-register-output' &&
    arg !== '--accept-out' &&
    !arg.startsWith('--accept-register-output=') &&
    !arg.startsWith('--accept-out=')
  ) {
    return false;
  }
  const value = arg.includes('=')
    ? arg.slice(arg.indexOf('=') + 1)
    : readFlagValue(argv, indexRef, flag);
  if (!value) fail(`${flag} expects a value`);
  state.acceptRegisterOutputCandidates.push(value);
  return true;
}

function parseIncludeArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '-I' && arg !== '--include' && !arg.startsWith('--include=')) return false;
  if (arg.startsWith('--include=')) {
    const value = arg.slice('--include='.length);
    if (!value) fail(`--include expects a value`);
    state.includeDirs.push(value);
    return true;
  }
  state.includeDirs.push(readFlagValue(argv, indexRef, arg));
  return true;
}

function handleCliFastPath(arg: string): CliExit | undefined {
  if (arg === '-h' || arg === '--help') {
    process.stdout.write(usage());
    return { code: 0 };
  }
  if (arg === '-V' || arg === '--version') {
    const require = createRequire(import.meta.url);
    const here = dirname(fileURLToPath(import.meta.url));
    const packageJsonPath = resolve(here, '..', '..', 'package.json');
    const pkg = require(packageJsonPath) as { version?: unknown };
    process.stdout.write(`${String(pkg.version ?? '0.0.0')}\n`);
    return { code: 0 };
  }
  return undefined;
}

function finalizeCliOptions(state: CliState): CliOptions {
  if (!state.entryFile) {
    fail(`Expected exactly one <entry.zax> argument (and it must be last)`);
  }

  const emitsRegisterCareArtifact =
    state.emitRegisterReport ||
    state.emitRegisterInterface ||
    state.annotateRegisterContracts ||
    state.fixRegisterContracts ||
    state.acceptRegisterOutputCandidates.length > 0 ||
    state.registerCareInterfaces.length > 0;

  if (state.outputType === 'hex' && !state.emitHex && !emitsRegisterCareArtifact) {
    fail(`--type hex requires HEX output to be enabled`);
  }
  if (state.outputType === 'bin' && !state.emitBin && !emitsRegisterCareArtifact) {
    fail(`--type bin requires BIN output to be enabled`);
  }

  if (state.outputPath) {
    const ext = extname(state.outputPath).toLowerCase();
    const wantExt = state.outputType === 'hex' ? '.hex' : '.bin';
    if (ext !== wantExt) {
      fail(`--output must end with "${wantExt}" when --type is "${state.outputType}"`);
    }
  }

  return {
    entryFile: state.entryFile,
    ...(state.outputPath ? { outputPath: state.outputPath } : {}),
    outputType: state.outputType,
    emitBin: state.emitBin,
    emitHex: state.emitHex,
    emitD8m: state.emitD8m,
    emitListing: state.emitListing,
    emitAsm80: state.emitAsm80,
    caseStyle: state.caseStyle,
    opStackPolicy: state.opStackPolicy,
    rawTypedCallWarnings: state.rawTypedCallWarnings,
    includeDirs: state.includeDirs,
    sourceMode: inferSourceMode(state.entryFile),
    registerCare: state.registerCare,
    emitRegisterReport: state.emitRegisterReport,
    emitRegisterInterface: state.emitRegisterInterface,
    annotateRegisterContracts: state.annotateRegisterContracts,
    fixRegisterContracts: state.fixRegisterContracts,
    acceptRegisterOutputCandidates: state.acceptRegisterOutputCandidates,
    registerCareInterfaces: state.registerCareInterfaces,
    ...(state.registerCareProfile !== undefined
      ? { registerCareProfile: state.registerCareProfile }
      : {}),
  };
}

export function parseCliArgs(argv: string[]): CliOptions | CliExit {
  const state = createDefaultCliState();
  const indexRef = { current: 0 };

  for (; indexRef.current < argv.length; indexRef.current++) {
    const arg = argv[indexRef.current]!;
    const fastPath = handleCliFastPath(arg);
    if (fastPath) return fastPath;
    if (parseOutputPathArg(arg, argv, indexRef, state)) continue;
    if (parseOutputTypeArg(arg, argv, indexRef, state)) continue;
    if (arg === '-n' || arg === '--nolist') {
      state.emitListing = false;
      continue;
    }
    if (arg === '--nobin') {
      state.emitBin = false;
      continue;
    }
    if (arg === '--nohex') {
      state.emitHex = false;
      continue;
    }
    if (arg === '--nod8m') {
      state.emitD8m = false;
      continue;
    }
    if (arg === '--asm80') {
      state.emitAsm80 = true;
      continue;
    }
    if (parseCaseStyleArg(arg, argv, indexRef, state)) continue;
    if (parseOpStackPolicyArg(arg, argv, indexRef, state)) continue;
    if (arg === '--raw-typed-call-warn') {
      state.rawTypedCallWarnings = true;
      continue;
    }
    if (parseRegisterCareArg(arg, argv, indexRef, state)) continue;
    if (arg === '--emit-register-report' || arg === '--reg-report') {
      state.emitRegisterReport = true;
      continue;
    }
    if (arg === '--emit-register-interface' || arg === '--reg-interface') {
      state.emitRegisterInterface = true;
      continue;
    }
    if (arg === '--fix') {
      state.fixRegisterContracts = true;
      state.annotateRegisterContracts = true;
      continue;
    }
    if (arg === '--annotate-register-contracts' || arg === '--contracts') {
      state.annotateRegisterContracts = true;
      continue;
    }
    if (parseAcceptRegisterOutputArg(arg, argv, indexRef, state)) continue;
    if (parseRegisterInterfaceInputArg(arg, argv, indexRef, state)) continue;
    if (parseRegisterProfileArg(arg, argv, indexRef, state)) continue;
    if (parseIncludeArg(arg, argv, indexRef, state)) continue;
    if (arg.startsWith('-')) {
      fail(`Unknown option "${arg}"`);
    }
    if (state.entryFile !== undefined) {
      fail(`Expected exactly one <entry.zax> argument (and it must be last)`);
    }
    if (indexRef.current !== argv.length - 1) {
      fail(`Expected exactly one <entry.zax> argument (and it must be last)`);
    }
    state.entryFile = arg;
  }

  return finalizeCliOptions(state);
}

function artifactBase(entryFile: string, outputType: 'hex' | 'bin', outputPath?: string): string {
  if (outputPath) {
    const resolved = resolve(outputPath);
    const ext = extname(resolved);
    return ext.length > 0 ? resolved.slice(0, -ext.length) : resolved;
  }
  const entry = resolve(entryFile);
  const ext = extname(entry);
  const stem = ext.length > 0 ? entry.slice(0, -ext.length) : entry;
  // Default primary output path is sibling of entry with extension derived from outputType.
  return stem;
}

async function writeArtifacts(
  base: string,
  artifacts: Artifact[],
  outputType: 'hex' | 'bin',
): Promise<void> {
  const byKind = new Map<string, Artifact>();
  for (const a of artifacts) byKind.set(a.kind, a);

  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  const d8mPath = `${base}.d8.json`;
  const lstPath = `${base}.lst`;
  const asm80Path = `${base}.z80`;
  const registerReportPath = `${base}.regcare.txt`;
  const registerInterfacePath = `${base}.azmi`;

  const writes: Array<Promise<void>> = [];
  const ensureDir = async (p: string) => mkdir(dirname(p), { recursive: true });
  let primaryWrittenPath: string | undefined;
  let registerReportWrittenPath: string | undefined;
  let registerInterfaceWrittenPath: string | undefined;
  let registerAnnotationWrittenPath: string | undefined;

  const hex = byKind.get('hex');
  if (hex && hex.kind === 'hex') {
    await ensureDir(hexPath);
    writes.push(writeFile(hexPath, hex.text, 'utf8'));
    if (outputType === 'hex') primaryWrittenPath = hexPath;
  }
  const bin = byKind.get('bin');
  if (bin && bin.kind === 'bin') {
    await ensureDir(binPath);
    writes.push(writeFile(binPath, Buffer.from(bin.bytes)));
    if (outputType === 'bin') primaryWrittenPath = binPath;
  }
  const d8m = byKind.get('d8m');
  if (d8m && d8m.kind === 'd8m') {
    await ensureDir(d8mPath);
    writes.push(writeFile(d8mPath, JSON.stringify(d8m.json, null, 2) + '\n', 'utf8'));
  }
  const lst = byKind.get('lst');
  if (lst && lst.kind === 'lst') {
    await ensureDir(lstPath);
    writes.push(writeFile(lstPath, lst.text, 'utf8'));
  }
  const asm80 = byKind.get('asm80');
  if (asm80 && asm80.kind === 'asm80') {
    await ensureDir(asm80Path);
    writes.push(writeFile(asm80Path, asm80.text, 'utf8'));
  }
  const registerReport = byKind.get('register-care-report');
  if (registerReport && registerReport.kind === 'register-care-report') {
    await ensureDir(registerReportPath);
    writes.push(writeFile(registerReportPath, registerReport.text, 'utf8'));
    registerReportWrittenPath = registerReportPath;
  }
  const registerInterface = byKind.get('register-care-interface');
  if (registerInterface && registerInterface.kind === 'register-care-interface') {
    await ensureDir(registerInterfacePath);
    writes.push(writeFile(registerInterfacePath, registerInterface.text, 'utf8'));
    registerInterfaceWrittenPath = registerInterfacePath;
  }
  const registerAnnotations = byKind.get('register-care-annotations');
  if (registerAnnotations && registerAnnotations.kind === 'register-care-annotations') {
    for (const file of registerAnnotations.files) {
      await ensureDir(file.path);
      writes.push(writeFile(file.path, file.text, 'utf8'));
      registerAnnotationWrittenPath ??= file.path;
    }
  }

  await Promise.all(writes);

  const reportedPath =
    primaryWrittenPath ??
    registerReportWrittenPath ??
    registerInterfaceWrittenPath ??
    registerAnnotationWrittenPath;
  if (reportedPath) {
    process.stdout.write(`${reportedPath}\n`);
  }
}

function normalizeDiagnosticPath(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function compareDiagnosticsForCli(a: Diagnostic, b: Diagnostic): number {
  const fileCmp = normalizeDiagnosticPath(a.file).localeCompare(normalizeDiagnosticPath(b.file));
  if (fileCmp !== 0) return fileCmp;

  const lineCmp = (a.line ?? Number.POSITIVE_INFINITY) - (b.line ?? Number.POSITIVE_INFINITY);
  if (lineCmp !== 0) return lineCmp;

  const colCmp = (a.column ?? Number.POSITIVE_INFINITY) - (b.column ?? Number.POSITIVE_INFINITY);
  if (colCmp !== 0) return colCmp;

  const sevRank = (severity: Diagnostic['severity']): number => {
    if (severity === 'error') return 0;
    if (severity === 'warning') return 1;
    return 2;
  };
  const sevCmp = sevRank(a.severity) - sevRank(b.severity);
  if (sevCmp !== 0) return sevCmp;

  const idCmp = a.id.localeCompare(b.id);
  if (idCmp !== 0) return idCmp;

  return a.message.localeCompare(b.message);
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);
    if ('code' in parsed) return parsed.code;

    const base = artifactBase(parsed.entryFile, parsed.outputType, parsed.outputPath);

    const res = await compile(
      parsed.entryFile,
      {
        emitBin: parsed.emitBin,
        emitHex: parsed.emitHex,
        emitD8m: parsed.emitD8m,
        emitListing: parsed.emitListing,
        emitAsm80: parsed.emitAsm80,
        caseStyle: parsed.caseStyle,
        opStackPolicy: parsed.opStackPolicy,
        rawTypedCallWarnings: parsed.rawTypedCallWarnings,
        includeDirs: parsed.includeDirs,
        sourceMode: parsed.sourceMode,
        requireMain: parsed.sourceMode === 'zax',
        defaultCodeBase: parsed.sourceMode === 'zax' ? 0x0100 : 0,
        registerCare: parsed.registerCare,
        emitRegisterReport: parsed.emitRegisterReport,
        emitRegisterInterface: parsed.emitRegisterInterface,
        emitRegisterAnnotations: parsed.annotateRegisterContracts,
        fixRegisterContracts: parsed.fixRegisterContracts,
        acceptRegisterOutputCandidates: parsed.acceptRegisterOutputCandidates,
        registerCareInterfaces: parsed.registerCareInterfaces,
        ...(parsed.registerCareProfile !== undefined
          ? { registerCareProfile: parsed.registerCareProfile }
          : {}),
      },
      { formats: defaultFormatWriters },
    );

    const sortedDiagnostics = [...res.diagnostics].sort(compareDiagnosticsForCli);
    if (sortedDiagnostics.length > 0) {
      for (const d of sortedDiagnostics) {
        const loc =
          d.line !== undefined && d.column !== undefined
            ? `${d.file}:${d.line}:${d.column}`
            : d.file;
        process.stderr.write(`${loc}: ${d.severity}: [${d.id}] ${d.message}\n`);
      }
    }

    if (sortedDiagnostics.some((d) => d.severity === 'error')) {
      return 1;
    }

    await writeArtifacts(base, res.artifacts, parsed.outputType);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`zax: ${msg}\n`);
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
}

function stripExtendedWindowsPrefix(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  if (path.startsWith('\\\\?\\')) return path.slice(4);
  return path;
}

function normalizePathForCompare(path: string): string {
  const resolved = resolve(path);
  const real = (() => {
    try {
      return realpathSync.native(resolved);
    } catch {
      return resolved;
    }
  })();
  const stripped = stripExtendedWindowsPrefix(real);
  const normalized = stripped.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function samePath(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}

function isDirectCliInvocation(invokedAs: string | undefined): boolean {
  if (!invokedAs) return false;
  const self = fileURLToPath(import.meta.url);
  if (samePath(invokedAs, self)) return true;

  const invoked = normalizePathForCompare(invokedAs);
  const normalizedSelf = normalizePathForCompare(self);
  // Windows CI can surface different canonical path spellings for the same file.
  // Fall back to stable suffix matching for the built CLI entry path.
  return invoked.endsWith('/dist/src/cli.js') && normalizedSelf.endsWith('/dist/src/cli.js');
}

if (isDirectCliInvocation(process.argv[1])) {
  void runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
