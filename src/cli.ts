#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile, type CompileNextFunctionOptions, type CompileNextResult } from './api-compile.js';
import { formatNextDiagnostic } from './diagnostics/format.js';
import type { Artifact } from './outputs/types.js';
import type { RegisterCareMode } from './register-care/types.js';
import type { CaseStyleMode } from './tooling/case-style.js';

type CliExit = { code: number };

type CliOptions = {
  entryFile: string;
  outputPath?: string;
  outputType: 'hex' | 'bin';
  sourceRoot?: string | undefined;
  emitBin: boolean;
  emitHex: boolean;
  emitD8m: boolean;
  emitListing: boolean;
  emitAsm80: boolean;
  caseStyle: CaseStyleMode;
  registerCare: RegisterCareMode;
  emitRegisterReport: boolean;
  emitRegisterInterface: boolean;
  emitRegisterAnnotations: boolean;
  fixRegisterContracts: boolean;
  acceptRegisterOutputCandidates: string[];
  registerCareProfile?: 'mon3';
  registerCareInterfaces: string[];
  includeDirs: string[];
  directiveAliasFiles: string[];
};

type CliState = Omit<CliOptions, 'entryFile' | 'outputPath'> & {
  entryFile: string | undefined;
  outputPath: string | undefined;
  sourceRoot: string | undefined;
};

function usage(): string {
  return [
    'azm [options] <entry.asm|entry.z80>',
    '',
    'Options:',
    '  -o, --output <file>   Primary output path (must match --type extension)',
    '  -t, --type <type>     Primary output type: hex|bin (default: hex)',
    '  -n, --nolist          Suppress .lst',
    '      --nobin           Suppress .bin',
    '      --nohex           Suppress .hex',
    '      --nod8m           Suppress .d8.json',
    '      --asm80           Emit lowered source (.z80)',
    '      --register-care    Register-care mode: off|audit|warn|error|strict',
    '      --rc <m>           Register-care mode alias for --register-care',
    '      --reg-report       Emit register-care report artifact',
    '      --reg-interface     Emit inferred register-care interface (.asmi)',
    '      --contracts        Rewrite source with inferred register-care contracts',
    '      --fix              Enable contract rewrite and conservative fixes',
    '      --accept-out <x>   Accept register-care output candidates',
    '      --interface <file>  Load .asmi contract file',
    '      --reg-profile <p>  Register-care profile (currently mon3)',
    '      --source-root <d> Normalize D8 source paths relative to this directory',
    '      --case-style <m>  Case-style lint mode: off|upper|lower|consistent',
    '      --aliases <file>  Load project directive alias JSON (repeatable)',
    '  -I, --include <dir>   Add include search path (repeatable)',
    '  -V, --version         Print version',
    '  -h, --help            Show help',
    '',
    'Notes:',
    '  - <entry.asm|entry.z80> must be the last argument (assembler-style).',
    '  - Output artifacts are written using the primary output stem with standard suffixes.',
    '',
  ].join('\n');
}

function fail(message: string): never {
  throw new Error(message);
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
    registerCare: 'off',
    emitRegisterReport: false,
    emitRegisterInterface: false,
    emitRegisterAnnotations: false,
    fixRegisterContracts: false,
    acceptRegisterOutputCandidates: [],
    registerCareInterfaces: [],
    sourceRoot: undefined,
    includeDirs: [],
    directiveAliasFiles: [],
    entryFile: undefined,
  };
}

function readFlagValueFromEquals(
  arg: string,
  flag: string,
  valueProvider: () => string | undefined,
): string {
  if (arg.startsWith(`${flag}=`)) {
    const value = arg.slice(flag.length + 1);
    if (!value) {
      fail(`${flag} expects a value`);
    }
    return value;
  }

  const value = valueProvider();
  if (!value) {
    fail(`${flag} expects a value`);
  }
  return value;
}

function readValue(
  argv: string[],
  indexRef: { current: number },
  flag: string,
): string {
  indexRef.current += 1;
  const value = argv[indexRef.current];
  if (!value) {
    fail(`${flag} expects a value`);
  }
  return value;
}

function parseOutputPathArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '-o' && arg !== '--output' && !arg.startsWith('--output=')) return false;
  state.outputPath = readFlagValueFromEquals(arg, '--output', () => readValue(argv, indexRef, '--output'));
  return true;
}

function parseOutputTypeArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '-t' && arg !== '--type' && !arg.startsWith('--type=')) return false;
  const value = arg.startsWith('--type=') ? arg.slice('--type='.length) : readValue(argv, indexRef, '--type');
  if (!value) {
    fail('--type expects a value');
  }
  if (value !== 'hex' && value !== 'bin') {
    fail(`Unsupported --type "${value}" (expected hex|bin)`);
  }
  state.outputType = value;
  return true;
}

function parseIncludeArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '-I' && arg !== '--include' && !arg.startsWith('--include=')) return false;
  const includeArg = arg.startsWith('--include=')
    ? arg.slice('--include='.length)
    : readValue(argv, indexRef, arg);
  if (!includeArg) {
    fail(`${arg.startsWith('--include=') ? '--include' : arg} expects a value`);
  }
  state.includeDirs.push(includeArg);
  return true;
}

function parseDirectiveAliasFileArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '--aliases' && !arg.startsWith('--aliases=')) return false;
  const value = arg.startsWith('--aliases=')
    ? arg.slice('--aliases='.length)
    : readValue(argv, indexRef, '--aliases');
  if (!value) fail('--aliases expects a value');
  state.directiveAliasFiles.push(value);
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
    : readValue(argv, indexRef, '--case-style');
  if (!value) fail('--case-style expects a value');
  if (value !== 'off' && value !== 'upper' && value !== 'lower' && value !== 'consistent') {
    fail(`Unsupported --case-style "${value}" (expected off|upper|lower|consistent)`);
  }
  state.caseStyle = value;
  return true;
}

function readMatchedFlagValue(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  flags: readonly string[],
): { flag: string; value: string } | undefined {
  const flag = flags.find((candidate) => arg === candidate || arg.startsWith(`${candidate}=`));
  if (!flag) return undefined;
  const value = arg.startsWith(`${flag}=`)
    ? arg.slice(flag.length + 1)
    : readValue(argv, indexRef, flag);
  if (!value) {
    fail(`${flag} expects a value`);
  }
  return { flag, value };
}

function parseRegisterCareArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  const parsed = readMatchedFlagValue(arg, argv, indexRef, ['--register-care', '--rc']);
  if (!parsed) return false;

  const { value, flag } = parsed;
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
  const parsed = readMatchedFlagValue(arg, argv, indexRef, ['--register-profile', '--reg-profile']);
  if (!parsed) return false;
  if (parsed.value !== 'mon3') {
    fail(`Unsupported ${parsed.flag} "${parsed.value}" (expected mon3)`);
  }
  state.registerCareProfile = parsed.value;
  return true;
}

function parseRegisterInterfaceArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '--interface' && !arg.startsWith('--interface=')) return false;
  const value = arg.startsWith('--interface=')
    ? arg.slice('--interface='.length)
    : readValue(argv, indexRef, '--interface');
  if (!value) fail('--interface expects a value');
  state.registerCareInterfaces.push(value);
  return true;
}

function parseAcceptOutputArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  const parsed = readMatchedFlagValue(arg, argv, indexRef, [
    '--accept-register-output',
    '--accept-out',
  ]);
  if (!parsed) return false;
  state.acceptRegisterOutputCandidates.push(parsed.value);
  return true;
}

function parseSourceRootArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  if (arg !== '--source-root' && !arg.startsWith('--source-root=')) return false;
  state.sourceRoot = readFlagValueFromEquals(arg, '--source-root', () => readValue(argv, indexRef, '--source-root'));
  return true;
}

function handleFastPath(arg: string): CliExit | undefined {
  if (arg === '-h' || arg === '--help') {
    process.stdout.write(usage());
    return { code: 0 };
  }
  if (arg === '-V' || arg === '--version') {
    process.stdout.write(`${readPackageVersion()}\n`);
    return { code: 0 };
  }
  return undefined;
}

function finalizeCliOptions(state: CliState): CliOptions {
  if (!state.entryFile) {
    fail(`Expected exactly one <entry.asm|entry.z80> argument (and it must be last)`);
  }

  const ext = extname(state.entryFile).toLowerCase();
  if (ext !== '.asm' && ext !== '.z80') {
    fail(`Unsupported entry extension "${ext || '<none>'}" (expected .asm, .z80)`);
  }

  if (state.outputPath !== undefined) {
    const wantExt = state.outputType === 'hex' ? '.hex' : '.bin';
    const providedExt = extname(state.outputPath).toLowerCase();
    if (providedExt !== wantExt) {
      fail(`--output must end with "${wantExt}" when --type is "${state.outputType}"`);
    }
  }

  const emitsRegisterCare =
    state.registerCare !== 'off' ||
    state.emitRegisterReport ||
    state.emitRegisterInterface ||
    state.emitRegisterAnnotations ||
    state.fixRegisterContracts ||
    state.acceptRegisterOutputCandidates.length > 0 ||
    state.registerCareInterfaces.length > 0;

  if (state.outputType === 'hex' && !state.emitHex && !emitsRegisterCare) {
    fail(`--type hex requires HEX output to be enabled`);
  }
  if (state.outputType === 'bin' && !state.emitBin && !emitsRegisterCare) {
    fail(`--type bin requires BIN output to be enabled`);
  }

  return {
    entryFile: state.entryFile,
    ...(state.outputPath ? { outputPath: state.outputPath } : {}),
    outputType: state.outputType,
    ...(state.sourceRoot !== undefined ? { sourceRoot: state.sourceRoot } : {}),
    emitBin: state.emitBin,
    emitHex: state.emitHex,
    emitD8m: state.emitD8m,
    emitListing: state.emitListing,
    emitAsm80: state.emitAsm80,
    caseStyle: state.caseStyle,
    registerCare: state.registerCare,
    emitRegisterReport: state.emitRegisterReport,
    emitRegisterInterface: state.emitRegisterInterface,
    emitRegisterAnnotations: state.emitRegisterAnnotations,
    fixRegisterContracts: state.fixRegisterContracts,
    acceptRegisterOutputCandidates: state.acceptRegisterOutputCandidates,
    ...(state.registerCareProfile !== undefined
      ? { registerCareProfile: state.registerCareProfile }
      : {}),
    registerCareInterfaces: state.registerCareInterfaces,
    includeDirs: state.includeDirs,
    directiveAliasFiles: state.directiveAliasFiles,
  };
}

export function parseCliArgs(argv: string[]): CliOptions | CliExit {
  const state = createDefaultCliState();
  const indexRef = { current: 0 };

  for (; indexRef.current < argv.length; indexRef.current += 1) {
    const arg = argv[indexRef.current]!;
    const fastPath = handleFastPath(arg);
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
      state.emitRegisterAnnotations = true;
      continue;
    }
    if (arg === '--contracts' || arg === '--annotate-register-contracts') {
      state.emitRegisterAnnotations = true;
      continue;
    }
    if (parseSourceRootArg(arg, argv, indexRef, state)) continue;
    if (parseCaseStyleArg(arg, argv, indexRef, state)) continue;
    if (parseDirectiveAliasFileArg(arg, argv, indexRef, state)) continue;
    if (parseRegisterCareArg(arg, argv, indexRef, state)) continue;
    if (parseRegisterProfileArg(arg, argv, indexRef, state)) continue;
    if (parseAcceptOutputArg(arg, argv, indexRef, state)) continue;
    if (parseRegisterInterfaceArg(arg, argv, indexRef, state)) continue;
    if (parseIncludeArg(arg, argv, indexRef, state)) continue;

    if (arg.startsWith('-')) {
      fail(`Unknown option "${arg}"`);
    }

    if (state.entryFile !== undefined) {
      fail(`Expected exactly one <entry.asm|entry.z80> argument (and it must be last)`);
    }
    if (indexRef.current !== argv.length - 1) {
      fail(`Expected exactly one <entry.asm|entry.z80> argument (and it must be last)`);
    }
    state.entryFile = arg;
  }

  return finalizeCliOptions(state);
}

function normalizeDiagnosticPath(file: string): string {
  const normalized = file.replace(/\\/g, '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function compareDiagnostics(aSource: string, bSource: string): number {
  const aNormalized = normalizeDiagnosticPath(aSource || '');
  const bNormalized = normalizeDiagnosticPath(bSource || '');
  return aNormalized.localeCompare(bNormalized);
}

function compareDiagnosticsForCli(
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

function artifactBase(entryFile: string, outputType: 'hex' | 'bin', outputPath?: string): string {
  if (outputPath !== undefined) {
    const resolvedOutputPath = resolve(outputPath);
    const providedExt = extname(resolvedOutputPath);
    return providedExt.length > 0 ? resolvedOutputPath.slice(0, -providedExt.length) : resolvedOutputPath;
  }

  const resolvedEntry = resolve(entryFile);
  const entryExt = extname(resolvedEntry);
  return entryExt.length > 0 ? resolvedEntry.slice(0, -entryExt.length) : resolvedEntry;
}

async function writeArtifacts(
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

function buildCompileOptions(parsed: CliOptions, base: string): CompileNextFunctionOptions {
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

let cachedPackageVersion: string | undefined;

function readPackageVersion(): string {
  if (cachedPackageVersion !== undefined) {
    return cachedPackageVersion;
  }

  const candidatePaths = [
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
    new URL('../../../package.json', import.meta.url),
  ];

  for (const path of candidatePaths) {
    try {
      const raw = readFileSync(path, 'utf8');
      const parsed = JSON.parse(raw) as { version?: string };
      if (parsed.version !== undefined) {
        cachedPackageVersion = parsed.version;
        return cachedPackageVersion;
      }
    } catch {
      // continue
    }
  }

  cachedPackageVersion = '0.0.0';
  return cachedPackageVersion;
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);
    if ('code' in parsed) {
      return parsed.code;
    }

    const base = artifactBase(parsed.entryFile, parsed.outputType, parsed.outputPath);
    const compileResult: CompileNextResult = await compile(parsed.entryFile, buildCompileOptions(parsed, base));
    const sortedDiagnostics = [...compileResult.diagnostics].sort(compareDiagnosticsForCli);
    if (sortedDiagnostics.length > 0) {
      for (const diagnostic of sortedDiagnostics) {
        process.stderr.write(`${formatNextDiagnostic(diagnostic)}\n`);
      }
    }

    if (sortedDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      return 1;
    }

    const primaryPath = await writeArtifacts(base, compileResult.artifacts, parsed.outputType);
    if (primaryPath !== undefined) {
      process.stdout.write(primaryPath);
    }
    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`azm: ${msg}\n`);
    process.stderr.write(`${usage()}\n`);
    return 2;
  }
}

function normalizePathForCompare(path: string): string {
  const resolved = resolve(path);
  const canonical = (() => {
    try {
      return realpathSync(resolved);
    } catch {
      return resolved;
    }
  })();

  const normalized = canonical.replace(/\\/g, '/');
  const normalizedDarwin =
    process.platform === 'darwin' ? normalized.replace(/^\/private\//, '/') : normalized;
  return process.platform === 'win32' ? normalizedDarwin.toLowerCase() : normalizedDarwin;
}

function samePath(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}

function isDirectCliInvocation(invokedAs: string | undefined): boolean {
  if (!invokedAs) return false;
  const self = fileURLToPath(import.meta.url);
  if (samePath(invokedAs, self)) return true;

  const invoked = normalizePathForCompare(invokedAs);
  const expected = normalizePathForCompare(resolve(self, '..', '..', 'dist', 'src', 'cli.js'));

  // Windows CI can surface different canonical path spellings for the same file.
  return invoked.endsWith('/dist/src/cli.js') && expected.endsWith('/dist/src/cli.js');
}

if (isDirectCliInvocation(process.argv[1])) {
  void runCli(process.argv.slice(2)).then((code) => process.exit(code));
}
