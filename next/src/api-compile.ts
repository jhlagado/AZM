import { readFile } from 'node:fs/promises';
import { dirname, normalize } from 'node:path';

import { assembleProgram } from './assembly/assemble-program.js';
import { analyzeProgramNext, loadProgramNext } from './tooling/api.js';
import { defaultFormatWriters } from './outputs/index.js';
import { writeHex } from './outputs/write-hex.js';
import type {
  AddressRange,
  Artifact,
  EmittedByteMap,
  FormatWriters,
  SymbolEntry,
  WriteD8mOptions,
} from './outputs/types.js';
import type { Diagnostic } from './model/diagnostic.js';
import type { SourceItem } from './model/source-item.js';
import { analyzeRegisterCare } from './register-care/analyze.js';
import { parseAcceptedOutputCandidates } from './register-care/accept-output.js';
import { parseInterfaceContracts } from './register-care/smartComments.js';
import type { AnalyzeRegisterCareOptions, RegisterCareMode, RoutineContract } from './register-care/types.js';

export { writeHex, defaultFormatWriters };
export type { AddressRange, Artifact, EmittedByteMap, FormatWriters };

export interface CompileNextDependencies {
  readonly formats: FormatWriters;
}

export interface CompileNextFunctionOptions {
  readonly includeDirs?: readonly string[];
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
  });
  diagnostics.push(...loaded.diagnostics);

  if (loaded.loadedProgram === undefined || hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const analysis = analyzeProgramNext(loaded.loadedProgram);
  diagnostics.push(...analysis.diagnostics);
  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const artifacts: Artifact[] = [];

  const registerCareMode = options.registerCare ?? 'off';
  const shouldAnalyzeRegisterCare =
    registerCareMode !== 'off' ||
    options.emitRegisterReport === true ||
    options.emitRegisterInterface === true ||
    options.emitRegisterAnnotations === true ||
    options.fixRegisterContracts === true ||
    (options.acceptRegisterOutputCandidates?.length ?? 0) > 0 ||
    (options.registerCareInterfaces?.length ?? 0) > 0;

  if (shouldAnalyzeRegisterCare) {
    // Validate interface references and accepted output markers now; full analysis is deferred.
    parseAcceptedOutputCandidates(options.acceptRegisterOutputCandidates ?? []);
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

    const registerCare = analyzeRegisterCare(
      loaded.loadedProgram,
      {
        mode: registerCareMode,
        emitReport: options.emitRegisterReport === true,
        emitInterface: options.emitRegisterInterface === true,
        emitAnnotations:
          options.emitRegisterAnnotations === true || options.fixRegisterContracts === true,
        ...(interfaceContracts.length > 0 ? { interfaceContracts } : {}),
      } satisfies AnalyzeRegisterCareOptions,
    );
    if (registerCare.reportText !== undefined) {
      artifacts.push({ kind: 'register-care-report', text: registerCare.reportText });
    }
    if (registerCare.interfaceText !== undefined) {
      artifacts.push({ kind: 'register-care-interface', text: registerCare.interfaceText });
    }
    diagnostics.push(...registerCare.diagnostics);
    if (hasErrors(diagnostics)) return { diagnostics, artifacts: [] };
  }

  if (options.skipAssembly === true) {
    return { diagnostics, artifacts };
  }

  const program = loaded.loadedProgram.program.files[0]?.items ?? [];
  const assembled = assembleProgram(program);
  diagnostics.push(...assembled.diagnostics);

  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const map = assembledImageToMap(assembled.bytes, assembled.origin);
  const symbols = collectSymbolEntries(program, assembled.symbols);
  const emit = compileArtifactDefaults(options);
  const d8Root = options.sourceRoot ?? dirname(normalizedEntry);

  if (emit.emitBin) {
    artifacts.push(deps.formats.writeBin(map, symbols));
  }

  if (emit.emitHex) {
    artifacts.push(deps.formats.writeHex(map, symbols));
  }

  if (emit.emitD8m) {
    const main = symbols.find((symbol) => symbol.kind === 'label' && symbol.name.toLowerCase() === 'main');
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
      ...(main !== undefined ? { entryAddress: main.kind === 'constant' ? main.value : main.address } : {}),
    };
    artifacts.push(deps.formats.writeD8m(map, symbols, d8mOpts));
  }

  if (emit.emitListing) {
    if (deps.formats.writeListing !== undefined) {
      artifacts.push(deps.formats.writeListing(map, symbols));
    }
  }

  if (emit.emitAsm80) {
    if (deps.formats.writeAsm80 !== undefined) {
      const sourceText = emitExpandedSourceText(loaded.loadedProgram.sourceTexts);
      artifacts.push(deps.formats.writeAsm80(sourceText));
    }
  }

  return { diagnostics, artifacts };
}

function compileArtifactDefaults(
  options: CompileNextFunctionOptions,
): {
  readonly emitBin: boolean;
  readonly emitHex: boolean;
  readonly emitD8m: boolean;
  readonly emitListing: boolean;
  readonly emitAsm80: boolean;
} {
  const anyPrimary = [options.emitBin, options.emitHex, options.emitD8m].some(
    (value) => value !== undefined,
  );
  const emitBin = anyPrimary ? options.emitBin ?? false : true;
  const emitHex = anyPrimary ? options.emitHex ?? false : true;
  const emitD8m = anyPrimary ? options.emitD8m ?? false : true;
  const emitListing = options.emitListing ?? true;
  const emitAsm80 = options.emitAsm80 ?? false;
  return { emitBin, emitHex, emitD8m, emitListing, emitAsm80 };
}

function assembledImageToMap(bytes: Uint8Array, origin: number): EmittedByteMap {
  const map = new Map<number, number>();
  for (let offset = 0; offset < bytes.length; offset += 1) {
    map.set(origin + offset, bytes[offset] ?? 0);
  }

  const writtenRange: AddressRange = {
    start: origin,
    end: origin + bytes.length,
  };

  return { bytes: map, writtenRange };
}

function emitExpandedSourceText(sourceTexts: ReadonlyMap<string, string>): string {
  const parts: string[] = [];
  let first = true;
  for (const [path, sourceText] of sourceTexts) {
    const normalizedPath = path.replace(/\\/g, '/');
    if (!first) {
      parts.push('');
      parts.push('');
    }
    parts.push(`; AZM Next source file: ${normalizedPath}`);
    parts.push(sourceText.replace(/\r\n/g, '\n'));
    first = false;
  }
  return parts.join('\n');
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
        item.members.forEach((member, index) => {
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
        });
        break;
      }
    }
  }

  return [...map.values()];
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

async function readPackageVersion(): Promise<string> {
  if (cachedPackageVersion !== undefined) {
    return cachedPackageVersion;
  }

  const packageJsonCandidates = [
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
