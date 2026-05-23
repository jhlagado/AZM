import { readFile } from 'node:fs/promises';
import { dirname, normalize } from 'node:path';

import { assembleProgram } from './assembly/assemble-program.js';
import { analyzeProgramNext, loadProgramNext } from './tooling/api.js';
import { defaultFormatWriters } from './outputs/index.js';
import { UnsupportedAsm80LoweringError } from './outputs/write-asm80.js';
import { writeHex } from './outputs/write-hex.js';
import type {
  AddressRange,
  Artifact,
  D8mArtifact,
  D8mFileEntry,
  D8mFileSymbol,
  D8mGenerator,
  D8mJson,
  D8mSegment,
  D8mSymbol,
  EmittedByteMap,
  FormatWriters,
  SymbolEntry,
  WriteD8mOptions,
} from './outputs/types.js';
import type { Diagnostic } from './model/diagnostic.js';
import type { SourceItem } from './model/source-item.js';
import { analyzeRegisterCare } from './register-care/analyze.js';
import { buildRegisterCareProgramModel } from './register-care/programModel.js';
import { parseAcceptedOutputCandidates } from './register-care/accept-output.js';
import { parseInterfaceContracts } from './register-care/smartComments.js';
import type { CaseStyleMode } from './tooling/case-style.js';
import type {
  AnalyzeRegisterCareOptions,
  RegisterCareDirectCall,
  RegisterCareMode,
  RoutineContract,
} from './register-care/types.js';

function parseUnresolvedSymbolName(message: string): string | undefined {
  const match = /^Unresolved symbol "([^"]+)"/.exec(message);
  return match?.[1];
}

function isSuppressedUnknownSymbolInRegisterCareMode(
  diagnostic: Diagnostic,
  directCalls: readonly RegisterCareDirectCall[] | undefined,
): boolean {
  if (directCalls === undefined || directCalls.length === 0) {
    return false;
  }
  if (diagnostic.code !== 'AZMN_SYMBOL' || diagnostic.message === undefined) {
    return false;
  }
  if (!diagnostic.message.includes('in 16-bit fixup')) {
    return false;
  }
  const symbol = parseUnresolvedSymbolName(diagnostic.message);
  if (symbol === undefined) {
    return false;
  }
  return directCalls.some(
    (call) =>
      call.target === symbol &&
      call.file === diagnostic.sourceName &&
      call.line === diagnostic.line &&
      call.column === diagnostic.column,
  );
}

export { writeHex, defaultFormatWriters };
export type {
  AddressRange,
  Artifact,
  D8mArtifact,
  D8mFileEntry,
  D8mFileSymbol,
  D8mGenerator,
  D8mJson,
  D8mSegment,
  D8mSymbol,
  EmittedByteMap,
  FormatWriters,
  SymbolEntry,
  WriteD8mOptions,
};

export type CompileDependencies = CompileNextDependencies;
export type CompileFunctionOptions = CompileNextFunctionOptions;
export type CompileResult = CompileNextResult;

export interface CompileNextDependencies {
  readonly formats: FormatWriters;
}

export interface CompileNextFunctionOptions {
  readonly includeDirs?: readonly string[];
  readonly directiveAliasFiles?: readonly string[];
  readonly caseStyle?: CaseStyleMode;
  readonly outputPath?: string;
  readonly outputType?: 'bin' | 'hex';
  readonly sourceRoot?: string;
  readonly d8mInputs?: {
    readonly listing?: string;
    readonly hex?: string;
    readonly bin?: string;
  };
  readonly emitBin?: boolean;
  readonly emitHex?: boolean;
  readonly emitD8m?: boolean;
  readonly emitListing?: boolean;
  readonly emitAsm80?: boolean;
  readonly registerCare?: RegisterCareMode;
  readonly emitRegisterReport?: boolean;
  readonly emitRegisterInterface?: boolean;
  readonly emitRegisterAnnotations?: boolean;
  readonly fixRegisterContracts?: boolean;
  readonly acceptRegisterOutputCandidates?: string[];
  readonly registerCareProfile?: 'mon3';
  readonly registerCareInterfaces?: string[];
  readonly skipAssembly?: boolean;
}

export interface CompileNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly Artifact[];
}

let cachedPackageVersion: string | undefined;

/**
 * Compile an AZM/ASM80-style program into in-memory artifacts.
 */
export async function compile(
  entryFile: string,
  options: CompileNextFunctionOptions = {},
  deps: CompileNextDependencies = { formats: defaultFormatWriters },
): Promise<CompileNextResult> {
  const diagnostics: Diagnostic[] = [];
  const normalizedEntry = normalize(entryFile);

  const loaded = await loadProgramNext({
    entryFile: normalizedEntry,
    ...(options.includeDirs !== undefined ? { includeDirs: options.includeDirs } : {}),
    ...(options.directiveAliasFiles !== undefined
      ? { directiveAliasFiles: options.directiveAliasFiles }
      : {}),
  });
  diagnostics.push(...loaded.diagnostics);

  if (loaded.loadedProgram === undefined) {
    return { diagnostics, artifacts: [] };
  }

  const analysis = analyzeProgramNext(loaded.loadedProgram, {
    ...(options.caseStyle !== undefined ? { caseStyle: options.caseStyle } : {}),
  });
  const registerCareMode = options.registerCare ?? 'off';
  const shouldAnalyzeRegisterCare =
    registerCareMode !== 'off' ||
    options.emitRegisterReport === true ||
    options.emitRegisterInterface === true ||
    options.emitRegisterAnnotations === true ||
    options.fixRegisterContracts === true ||
    (options.acceptRegisterOutputCandidates?.length ?? 0) > 0 ||
    (options.registerCareInterfaces?.length ?? 0) > 0;

  const directCalls = shouldAnalyzeRegisterCare
    ? buildRegisterCareProgramModel(loaded.loadedProgram.program.files[0]?.items ?? []).directCalls
    : undefined;

  diagnostics.push(
    ...analysis.diagnostics.filter((diagnostic) =>
      shouldAnalyzeRegisterCare
        ? !isSuppressedUnknownSymbolInRegisterCareMode(diagnostic, directCalls)
        : true,
    ),
  );

  const artifacts: Artifact[] = [];

  if (shouldAnalyzeRegisterCare) {
    // Validate interface references and accepted output markers now; full analysis is deferred.
    const acceptedOutputCandidates = parseAcceptedOutputCandidates(
      options.acceptRegisterOutputCandidates ?? [],
    );
    const interfaceContracts: RoutineContract[] = [];

    for (const rawInterface of options.registerCareInterfaces ?? []) {
      const contractPath = normalize(rawInterface);
      if (contractPath.slice(-5).toLowerCase() !== '.asmi') {
        diagnostics.push({
          severity: 'error',
          code: 'AZMN_REGISTER_CARE',
          message: 'Register-care interface files must use the .asmi extension',
          sourceName: contractPath,
        });
        continue;
      }
      const interfaceText = await readFile(contractPath, 'utf8');
      for (const contract of parseInterfaceContracts(interfaceText, contractPath).values()) {
        interfaceContracts.push(contract);
      }
    }

    if (hasErrors(diagnostics)) {
      return { diagnostics, artifacts: [] };
    }

    const registerCare = analyzeRegisterCare(loaded.loadedProgram, {
      mode: registerCareMode,
      emitReport: options.emitRegisterReport === true,
      emitInterface: options.emitRegisterInterface === true,
      emitAnnotations:
        options.emitRegisterAnnotations === true || options.fixRegisterContracts === true,
      fixRegisterContracts: options.fixRegisterContracts === true,
      acceptedOutputCandidates,
      ...(options.registerCareProfile !== undefined
        ? { registerCareProfile: options.registerCareProfile }
        : {}),
      ...(interfaceContracts.length > 0 ? { interfaceContracts } : {}),
    } satisfies AnalyzeRegisterCareOptions);
    if (registerCare.reportText !== undefined) {
      artifacts.push({ kind: 'register-care-report', text: registerCare.reportText });
    }
    if (registerCare.interfaceText !== undefined) {
      artifacts.push({ kind: 'register-care-interface', text: registerCare.interfaceText });
    }
    if (registerCare.annotations !== undefined && registerCare.annotations.length > 0) {
      const files = registerCare.annotations.map((item) => ({
        path: item.path,
        text: item.text,
      }));
      artifacts.push({ kind: 'register-care-annotations', files });
    }
    diagnostics.push(...registerCare.diagnostics);
    if (hasErrors(diagnostics)) return { diagnostics, artifacts: [] };
  }

  if (options.skipAssembly === true) {
    return { diagnostics, artifacts };
  }

  const program = loaded.loadedProgram.program.files[0]?.items ?? [];
  const assembled = assembleProgram(program);
  diagnostics.push(
    ...assembled.diagnostics.filter((diagnostic) =>
      shouldAnalyzeRegisterCare
        ? !isSuppressedUnknownSymbolInRegisterCareMode(diagnostic, directCalls)
        : true,
    ),
  );
  sortDiagnosticsInPlace(diagnostics);

  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const map = assembledImageToMap(assembled.bytes, assembled.origin, assembled.sourceSegments);
  const hexMap = assembledInitializedImageToMap(
    assembled.bytes,
    assembled.origin,
    assembled.initializedAddresses,
  );
  const sidecarMap = assembledInitializedImageToMap(
    assembled.bytes,
    assembled.origin,
    assembled.initializedAddresses,
    assembled.sourceSegments,
  );
  const symbols = collectSymbolEntries(program, assembled.symbols);
  const emit = compileArtifactDefaults(options);
  const d8Root = options.sourceRoot ?? dirname(normalizedEntry);

  if (emit.emitBin) {
    artifacts.push(deps.formats.writeBin(map, symbols));
  }

  if (emit.emitHex) {
    artifacts.push(deps.formats.writeHex(hexMap, symbols));
  }

  if (emit.emitD8m) {
    const main = symbols.find(
      (symbol) => symbol.kind === 'label' && symbol.name.toLowerCase() === 'main',
    );
    const d8mOpts: WriteD8mOptions = {
      rootDir: normalize(d8Root),
      packageVersion: await readPackageVersion(),
      inputs: {
        entry: normalizedEntry,
        ...(options.d8mInputs?.listing !== undefined ? { listing: options.d8mInputs.listing } : {}),
        ...(options.d8mInputs?.hex !== undefined ? { hex: options.d8mInputs.hex } : {}),
        ...(options.d8mInputs?.bin !== undefined ? { bin: options.d8mInputs.bin } : {}),
      },
      ...(main !== undefined ? { entrySymbol: main.name } : {}),
      ...(main !== undefined
        ? { entryAddress: main.kind === 'constant' ? main.value : main.address }
        : {}),
    };
    artifacts.push(deps.formats.writeD8m(sidecarMap, symbols, d8mOpts));
  }

  if (emit.emitListing) {
    if (deps.formats.writeListing !== undefined) {
      artifacts.push(deps.formats.writeListing(sidecarMap, symbols));
    }
  }

  if (emit.emitAsm80) {
    if (deps.formats.writeAsm80 !== undefined) {
      try {
        artifacts.push(deps.formats.writeAsm80(program, symbols));
      } catch (error) {
        if (error instanceof UnsupportedAsm80LoweringError) {
          diagnostics.push({
            severity: 'error',
            code: 'AZMN_ASM80',
            message: error.message,
            sourceName: error.item.span.sourceName,
            line: error.item.span.line,
            column: error.item.span.column,
          });
          return { diagnostics, artifacts };
        }
        throw error;
      }
    }
  }

  return { diagnostics, artifacts };
}

function compileArtifactDefaults(options: CompileNextFunctionOptions): {
  readonly emitBin: boolean;
  readonly emitHex: boolean;
  readonly emitD8m: boolean;
  readonly emitListing: boolean;
  readonly emitAsm80: boolean;
} {
  const anyPrimary = [options.emitBin, options.emitHex, options.emitD8m].some(
    (value) => value !== undefined,
  );
  const emitBin = anyPrimary ? (options.emitBin ?? false) : true;
  const emitHex = anyPrimary ? (options.emitHex ?? false) : true;
  const emitD8m = anyPrimary ? (options.emitD8m ?? false) : true;
  const emitListing = options.emitListing ?? true;
  const emitAsm80 = options.emitAsm80 ?? false;
  return { emitBin, emitHex, emitD8m, emitListing, emitAsm80 };
}

function assembledImageToMap(
  bytes: Uint8Array,
  origin: number,
  sourceSegments: EmittedByteMap['sourceSegments'] = [],
): EmittedByteMap {
  const map = new Map<number, number>();
  for (let offset = 0; offset < bytes.length; offset += 1) {
    map.set(origin + offset, bytes[offset] ?? 0);
  }

  const writtenRange: AddressRange = {
    start: origin,
    end: origin + bytes.length,
  };

  return { bytes: map, writtenRange, sourceSegments };
}

function assembledInitializedImageToMap(
  bytes: Uint8Array,
  origin: number,
  initializedAddresses: readonly number[],
  sourceSegments: EmittedByteMap['sourceSegments'] = [],
): EmittedByteMap {
  const map = new Map<number, number>();
  for (const address of initializedAddresses) {
    const offset = address - origin;
    if (offset >= 0 && offset < bytes.length) {
      map.set(address, bytes[offset] ?? 0);
    }
  }

  return { bytes: map, sourceSegments };
}

function collectSymbolEntries(
  items: readonly SourceItem[],
  resolvedSymbols: Readonly<Record<string, number>>,
): SymbolEntry[] {
  const map = new Map<string, SymbolEntry>();
  for (const item of items) {
    switch (item.kind) {
      case 'equ': {
        const value = resolvedSymbols[item.name];
        if (value !== undefined) {
          map.set(item.name, {
            kind: 'constant',
            name: item.name,
            value,
            file: item.span.sourceName,
            line: item.span.line,
            scope: 'global',
          });
        }
        break;
      }

      case 'label': {
        const address = resolvedSymbols[item.name];
        if (address !== undefined) {
          map.set(item.name, {
            kind: 'label',
            name: item.name,
            address,
            file: item.span.sourceName,
            line: item.span.line,
            scope: 'global',
          });
        }
        break;
      }

      case 'enum': {
        for (const member of item.members) {
          const fullName = `${item.name}.${member}`;
          const value = resolvedSymbols[fullName];
          if (value !== undefined) {
            map.set(fullName, {
              kind: 'constant',
              name: fullName,
              value,
              file: item.span.sourceName,
              line: item.span.line,
              scope: 'global',
            });
          }
        }
        break;
      }
    }
  }

  return [...map.values()];
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function sortDiagnosticsInPlace(diagnostics: Diagnostic[]): void {
  diagnostics.sort((left, right) => {
    const lineDelta = (left.line ?? 0) - (right.line ?? 0);
    if (lineDelta !== 0) {
      return lineDelta;
    }
    return (left.column ?? 0) - (right.column ?? 0);
  });
}

async function readPackageVersion(): Promise<string> {
  if (cachedPackageVersion !== undefined) {
    return cachedPackageVersion;
  }

  const packageJsonCandidates = [
    new URL('../package.json', import.meta.url),
    new URL('../../package.json', import.meta.url),
    new URL('../../../package.json', import.meta.url),
  ];

  for (const candidate of packageJsonCandidates) {
    try {
      const raw = await readFile(candidate, 'utf8');
      const json = JSON.parse(raw) as { version?: string };
      if (json.version !== undefined) {
        cachedPackageVersion = json.version;
        return cachedPackageVersion;
      }
    } catch {
      // Continue searching candidates.
    }
  }

  cachedPackageVersion = '0.0.0';
  return cachedPackageVersion;
}
