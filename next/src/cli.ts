import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile, type CompileNextFunctionOptions, type CompileNextResult } from './api-compile.js';
import { formatNextDiagnostic } from './diagnostics/format.js';
import type { Artifact } from './outputs/types.js';

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
  includeDirs: string[];
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
    '      --source-root <d> Normalize D8 source paths relative to this directory',
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
    sourceRoot: undefined,
    includeDirs: [],
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
  state.includeDirs.push(includeArg);
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

  if (state.outputType === 'hex' && !state.emitHex) {
    fail(`--type hex requires HEX output to be enabled`);
  }
  if (state.outputType === 'bin' && !state.emitBin) {
    fail(`--type bin requires BIN output to be enabled`);
  }

  if (state.outputPath !== undefined) {
    const wantExt = state.outputType === 'hex' ? '.hex' : '.bin';
    const providedExt = extname(state.outputPath).toLowerCase();
    if (providedExt !== wantExt) {
      fail(`--output must end with "${wantExt}" when --type is "${state.outputType}"`);
    }
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
    includeDirs: state.includeDirs,
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
    if (parseSourceRootArg(arg, argv, indexRef, state)) continue;
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

  const writes: Promise<void>[] = [];
  const ensureDir = async (path: string): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
  };
  let primaryPath: string | undefined;

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

  await Promise.all(writes);
  return primaryPath;
}

function buildCompileOptions(parsed: CliOptions, base: string): CompileNextFunctionOptions {
  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  const lstPath = `${base}.lst`;

  return {
    includeDirs: parsed.includeDirs,
    emitBin: parsed.emitBin,
    emitHex: parsed.emitHex,
    emitD8m: parsed.emitD8m,
    emitListing: parsed.emitListing,
    emitAsm80: parsed.emitAsm80,
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
