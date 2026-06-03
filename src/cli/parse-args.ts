import { readFileSync } from 'node:fs';
import { extname } from 'node:path';

import type { RegisterContractsMode } from '../register-contracts/types.js';
import type { CaseStyleMode } from '../tooling/case-style.js';
import { cliUsage } from './usage.js';

export type CliExit = { code: number };

export type CliOptions = {
  entryFile: string;
  outputPath?: string;
  outputType: 'hex' | 'bin';
  sourceRoot?: string | undefined;
  emitBin: boolean;
  emitHex: boolean;
  emitD8m: boolean;
  emitAsm80: boolean;
  caseStyle: CaseStyleMode;
  registerContracts: RegisterContractsMode;
  emitRegisterReport: boolean;
  emitRegisterInterface: boolean;
  emitRegisterAnnotations: boolean;
  fixRegisterContracts: boolean;
  acceptRegisterOutputCandidates: string[];
  registerContractsProfile?: 'mon3';
  registerContractsInterfaces: string[];
  includeDirs: string[];
  directiveAliasFiles: string[];
};

type CliState = Omit<CliOptions, 'entryFile' | 'outputPath'> & {
  entryFile: string | undefined;
  outputPath: string | undefined;
  sourceRoot: string | undefined;
};

type CliArgContext = {
  readonly argv: string[];
  readonly indexRef: { current: number };
  readonly state: CliState;
};

type CliArgParser = (arg: string, context: CliArgContext) => boolean;

type BooleanFlagAction = {
  readonly flags: readonly string[];
  readonly apply: (state: CliState) => void;
};

const BOOLEAN_FLAG_ACTIONS: readonly BooleanFlagAction[] = [
  {
    flags: ['--nobin'],
    apply: (state) => {
      state.emitBin = false;
    },
  },
  {
    flags: ['--nohex'],
    apply: (state) => {
      state.emitHex = false;
    },
  },
  {
    flags: ['--nod8m'],
    apply: (state) => {
      state.emitD8m = false;
    },
  },
  {
    flags: ['--asm80'],
    apply: (state) => {
      state.emitAsm80 = true;
    },
  },
  {
    flags: ['--emit-register-report', '--reg-report'],
    apply: (state) => {
      state.emitRegisterReport = true;
    },
  },
  {
    flags: ['--emit-register-interface', '--reg-interface'],
    apply: (state) => {
      state.emitRegisterInterface = true;
    },
  },
  {
    flags: ['--fix'],
    apply: (state) => {
      state.fixRegisterContracts = true;
      state.emitRegisterAnnotations = true;
    },
  },
  {
    flags: ['--contracts', '--annotate-register-contracts'],
    apply: (state) => {
      state.emitRegisterAnnotations = true;
    },
  },
];

export { cliUsage };

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
    emitAsm80: false,
    caseStyle: 'off',
    registerContracts: 'off',
    emitRegisterReport: false,
    emitRegisterInterface: false,
    emitRegisterAnnotations: false,
    fixRegisterContracts: false,
    acceptRegisterOutputCandidates: [],
    registerContractsInterfaces: [],
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

function readValue(argv: string[], indexRef: { current: number }, flag: string): string {
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
  state.outputPath = readFlagValueFromEquals(arg, '--output', () =>
    readValue(argv, indexRef, '--output'),
  );
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
    : readValue(argv, indexRef, '--type');
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

function parseRegisterContractsArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): boolean {
  const parsed = readMatchedFlagValue(arg, argv, indexRef, [
    '--register-contracts',
    '--register-care',
    '--rc',
  ]);
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
  state.registerContracts = value;
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
  state.registerContractsProfile = parsed.value;
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
  state.registerContractsInterfaces.push(value);
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
  state.sourceRoot = readFlagValueFromEquals(arg, '--source-root', () =>
    readValue(argv, indexRef, '--source-root'),
  );
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

function cliOptionOutputPath(
  state: CliState,
): Pick<CliOptions, 'outputPath'> | Record<string, never> {
  return state.outputPath ? { outputPath: state.outputPath } : {};
}

function cliOptionSourceRoot(
  state: CliState,
): Pick<CliOptions, 'sourceRoot'> | Record<string, never> {
  return state.sourceRoot !== undefined ? { sourceRoot: state.sourceRoot } : {};
}

function cliOptionRegisterContractsProfile(
  state: CliState,
): Pick<CliOptions, 'registerContractsProfile'> | Record<string, never> {
  return state.registerContractsProfile !== undefined
    ? { registerContractsProfile: state.registerContractsProfile }
    : {};
}

function finalizeCliOptions(state: CliState): CliOptions {
  validateEntryFile(state.entryFile);
  validateOutputPath(state);
  validateEnabledPrimaryOutput(state);

  return {
    entryFile: state.entryFile!,
    ...cliOptionOutputPath(state),
    outputType: state.outputType,
    ...cliOptionSourceRoot(state),
    emitBin: state.emitBin,
    emitHex: state.emitHex,
    emitD8m: state.emitD8m,
    emitAsm80: state.emitAsm80,
    caseStyle: state.caseStyle,
    registerContracts: state.registerContracts,
    emitRegisterReport: state.emitRegisterReport,
    emitRegisterInterface: state.emitRegisterInterface,
    emitRegisterAnnotations: state.emitRegisterAnnotations,
    fixRegisterContracts: state.fixRegisterContracts,
    acceptRegisterOutputCandidates: state.acceptRegisterOutputCandidates,
    ...cliOptionRegisterContractsProfile(state),
    registerContractsInterfaces: state.registerContractsInterfaces,
    includeDirs: state.includeDirs,
    directiveAliasFiles: state.directiveAliasFiles,
  };
}

function validateEntryFile(entryFile: string | undefined): void {
  if (!entryFile) {
    fail(`Expected exactly one <entry.asm|entry.z80> argument (and it must be last)`);
  }
}

function validateOutputPath(state: CliState): void {
  if (!state.entryFile) return;
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
}

function emitsRegisterContractsArtifact(state: CliState): boolean {
  return [
    state.registerContracts !== 'off',
    state.emitRegisterReport,
    state.emitRegisterInterface,
    state.emitRegisterAnnotations,
    state.fixRegisterContracts,
    state.acceptRegisterOutputCandidates.length > 0,
    state.registerContractsInterfaces.length > 0,
  ].some(Boolean);
}

function primaryOutputDisabled(state: CliState): boolean {
  return state.outputType === 'hex' ? !state.emitHex : !state.emitBin;
}

function primaryOutputName(state: CliState): string {
  return state.outputType === 'hex' ? 'HEX' : 'BIN';
}

function validateEnabledPrimaryOutput(state: CliState): void {
  if (primaryOutputDisabled(state) && !emitsRegisterContractsArtifact(state)) {
    fail(`--type ${state.outputType} requires ${primaryOutputName(state)} output to be enabled`);
  }
}

const VALUE_ARG_PARSERS: readonly CliArgParser[] = [
  (arg, { argv, indexRef, state }) => parseOutputPathArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseOutputTypeArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseSourceRootArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseCaseStyleArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseDirectiveAliasFileArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseRegisterContractsArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseRegisterProfileArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseAcceptOutputArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseRegisterInterfaceArg(arg, argv, indexRef, state),
  (arg, { argv, indexRef, state }) => parseIncludeArg(arg, argv, indexRef, state),
];

function parseBooleanFlag(arg: string, state: CliState): boolean {
  const action = BOOLEAN_FLAG_ACTIONS.find(({ flags }) => flags.includes(arg));
  if (!action) return false;
  action.apply(state);
  return true;
}

function parseValueArg(arg: string, context: CliArgContext): boolean {
  return VALUE_ARG_PARSERS.some((parser) => parser(arg, context));
}

function parseEntryArg(
  arg: string,
  argv: string[],
  indexRef: { current: number },
  state: CliState,
): void {
  if (arg.startsWith('-')) {
    fail(`Unknown option "${arg}"`);
  }
  if (state.entryFile !== undefined || indexRef.current !== argv.length - 1) {
    fail(`Expected exactly one <entry.asm|entry.z80> argument (and it must be last)`);
  }
  state.entryFile = arg;
}

export function parseCliArgs(argv: string[]): CliOptions | CliExit {
  const state = createDefaultCliState();
  const indexRef = { current: 0 };

  for (; indexRef.current < argv.length; indexRef.current += 1) {
    const arg = argv[indexRef.current]!;
    const fastPath = handleFastPath(arg);
    if (fastPath) return fastPath;

    if (parseBooleanFlag(arg, state)) continue;
    if (parseValueArg(arg, { argv, indexRef, state })) continue;
    parseEntryArg(arg, argv, indexRef, state);
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
