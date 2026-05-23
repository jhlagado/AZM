import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import type { RegisterCareMode } from '../register-care/types.js';
import type { CaseStyleMode } from '../tooling/case-style.js';

export type CliExit = { code: number };

export type CliOptions = {
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

export function cliUsage(): string {
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
    process.stdout.write(cliUsage());
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
