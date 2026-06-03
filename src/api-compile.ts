import { normalize } from 'node:path';

import { assembleProgram } from './assembly/assemble-program.js';
import { emitAssemblyArtifacts } from './api-artifacts.js';
import { runRegisterContracts, shouldAnalyzeRegisterContracts } from './api-register-contracts.js';
import { analyzeProgramNext, loadProgramNext } from './tooling/api.js';
import { defaultFormatWriters } from './outputs/index.js';
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
import { buildRegisterContractsProgramModel } from './register-contracts/programModel.js';
import type { CaseStyleMode } from './tooling/case-style.js';
import type {
  RegisterContractsDirectCall,
  RegisterContractsMode,
} from './register-contracts/types.js';

function parseUnresolvedSymbolName(message: string): string | undefined {
  const match = /^Unresolved symbol "([^"]+)"/.exec(message);
  return match?.[1];
}

function isSuppressedUnknownSymbolInRegisterContractsMode(
  diagnostic: Diagnostic,
  directCalls: readonly RegisterContractsDirectCall[] | undefined,
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
    readonly hex?: string;
    readonly bin?: string;
  };
  readonly emitBin?: boolean;
  readonly emitHex?: boolean;
  readonly emitD8m?: boolean;
  readonly emitAsm80?: boolean;
  readonly registerContracts?: RegisterContractsMode;
  /** @deprecated Use registerContracts. */
  readonly registerCare?: RegisterContractsMode;
  readonly emitRegisterReport?: boolean;
  readonly emitRegisterInterface?: boolean;
  readonly emitRegisterAnnotations?: boolean;
  readonly fixRegisterContracts?: boolean;
  readonly acceptRegisterOutputCandidates?: string[];
  readonly registerContractsProfile?: 'mon3';
  /** @deprecated Use registerContractsProfile. */
  readonly registerCareProfile?: 'mon3';
  readonly registerContractsInterfaces?: string[];
  /** @deprecated Use registerContractsInterfaces. */
  readonly registerCareInterfaces?: string[];
  readonly skipAssembly?: boolean;
}

export interface CompileNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly artifacts: readonly Artifact[];
}

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
  const analyzeRegisterContractsNow = shouldAnalyzeRegisterContracts(options);

  const directCalls = analyzeRegisterContractsNow
    ? buildRegisterContractsProgramModel(loaded.loadedProgram.program.files[0]?.items ?? [])
        .directCalls
    : undefined;

  diagnostics.push(
    ...analysis.diagnostics.filter((diagnostic) =>
      analyzeRegisterContractsNow
        ? !isSuppressedUnknownSymbolInRegisterContractsMode(diagnostic, directCalls)
        : true,
    ),
  );

  const artifacts: Artifact[] = [];

  if (analyzeRegisterContractsNow) {
    const registerContracts = await runRegisterContracts(loaded.loadedProgram, options);
    artifacts.push(...registerContracts.artifacts);
    diagnostics.push(...registerContracts.diagnostics);
    if (hasErrors(diagnostics)) return { diagnostics, artifacts };
  }

  if (options.skipAssembly === true) {
    return { diagnostics, artifacts };
  }

  const program = loaded.loadedProgram.program.files[0]?.items ?? [];
  const assembled = assembleProgram(program);
  diagnostics.push(
    ...assembled.diagnostics.filter((diagnostic) =>
      analyzeRegisterContractsNow
        ? !isSuppressedUnknownSymbolInRegisterContractsMode(diagnostic, directCalls)
        : true,
    ),
  );
  sortDiagnosticsInPlace(diagnostics);

  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts: [] };
  }

  const emittedArtifacts = await emitAssemblyArtifacts({
    entryFile: normalizedEntry,
    options,
    formats: deps.formats,
    program,
    bytes: assembled.bytes,
    origin: assembled.origin,
    sourceSegments: assembled.sourceSegments,
    initializedAddresses: assembled.initializedAddresses,
    symbols: assembled.symbols,
  });
  artifacts.push(...emittedArtifacts.artifacts);
  diagnostics.push(...emittedArtifacts.diagnostics);

  return { diagnostics, artifacts };
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
