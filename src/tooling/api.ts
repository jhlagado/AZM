import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { assembleProgram } from '../assembly/assemble-program.js';
import { expandSourceForTooling, type LoadProgramNextOptions } from '../node/source-host.js';
import { parseNextSourceItems } from '../core/compile.js';
import {
  buildDirectiveAliasPolicy,
  readDirectiveAliasProfile,
} from '../syntax/directive-aliases.js';
import { lintCaseStyleNext, type CaseStyleMode } from './case-style.js';

export type { LoadProgramNextOptions };

export interface LoadedProgramNext {
  readonly program: {
    readonly kind: 'Program';
    readonly entryFile: string;
    readonly files: readonly [
      {
        readonly kind: 'SourceFile';
        readonly name: string;
        readonly items: readonly SourceItem[];
      },
    ];
  };
  readonly sourceTexts: ReadonlyMap<string, string>;
  readonly sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>;
}

export interface LoadProgramNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly loadedProgram?: LoadedProgramNext;
}

export interface AnalyzeProgramNextResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly env: {
    readonly symbols: Readonly<Record<string, number>>;
  };
}

export interface AnalyzeProgramNextOptions {
  readonly caseStyle?: CaseStyleMode;
}

export type LoadedProgram = LoadedProgramNext;
export type LoadProgramOptions = LoadProgramNextOptions;
export type LoadProgramResult = LoadProgramNextResult;
export type AnalyzeProgramResult = AnalyzeProgramNextResult;
export type AnalyzeProgramOptions = AnalyzeProgramNextOptions;

export async function loadProgramNext(
  options: LoadProgramNextOptions,
): Promise<LoadProgramNextResult> {
  const { diagnostics: loadDiagnostics, expanded } = await expandSourceForTooling(options);
  if (expanded === undefined) {
    return { diagnostics: loadDiagnostics };
  }

  const directiveAliasProfiles = await Promise.all(
    (options.directiveAliasFiles ?? []).map((path) => readDirectiveAliasProfile(path)),
  );
  const directiveAliasPolicy = buildDirectiveAliasPolicy(directiveAliasProfiles);
  const parsed = parseNextSourceItems(expanded.lines, { directiveAliasPolicy });
  const diagnostics = [...loadDiagnostics, ...parsed.diagnostics];

  return {
    diagnostics,
    loadedProgram: {
      program: {
        kind: 'Program',
        entryFile: expanded.entryFile,
        files: [{ kind: 'SourceFile', name: expanded.entryFile, items: parsed.items }],
      },
      sourceTexts: expanded.sourceTexts,
      sourceLineComments: expanded.sourceLineComments,
    },
  };
}

// Assembly runs here for symbol resolution only; encode diagnostics are collected in compile().
export function analyzeProgramNext(
  loadedProgram: LoadedProgramNext,
  options: AnalyzeProgramNextOptions = {},
): AnalyzeProgramNextResult {
  const assembly = assembleProgram(loadedProgram.program.files[0].items);
  const caseStyleDiagnostics = lintCaseStyleNext({
    items: loadedProgram.program.files[0].items,
    sourceTexts: loadedProgram.sourceTexts,
    mode: options.caseStyle ?? 'off',
  });
  return {
    diagnostics: caseStyleDiagnostics,
    env: { symbols: assembly.symbols },
  };
}

export const loadProgram = loadProgramNext;
export const analyzeProgram = analyzeProgramNext;
