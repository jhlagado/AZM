import { dirname } from 'node:path';
import { readFile } from 'node:fs/promises';

import { analyzeLoadedProgram } from './analysis.js';
import { hasErrors, normalizePath } from './compileShared.js';
import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import {
  buildDirectiveAliasPolicy,
  defaultDirectiveAliasProfileName,
  readDirectiveAliasProfile,
} from './frontend/directiveAliases.js';
import { diagnosticsForAzmRemovedZaxConstructs } from './frontend/azmNativeRemovals.js';
import { inferSourceMode } from './frontend/sourceMode.js';
import type { CompileFn, CompilerOptions, CompileResult, PipelineDeps } from './pipeline.js';

import { emitProgram } from './lowering/emit.js';
import { STARTUP_ENTRY_LABEL } from './lowering/startupInit.js';
import type { Artifact } from './formats/types.js';
import { loadProgram } from './moduleLoader.js';
import { analyzeRegisterCare } from './registerCare/analyze.js';
import { parseAzmiContracts } from './registerCare/smartComments.js';

function withDefaults(
  options: CompilerOptions,
): Required<
  Pick<CompilerOptions, 'emitBin' | 'emitHex' | 'emitD8m' | 'emitListing' | 'emitAsm80'>
> {
  const anyPrimaryEmitSpecified = [options.emitBin, options.emitHex, options.emitD8m].some(
    (v) => v !== undefined,
  );

  const emitBin = anyPrimaryEmitSpecified ? (options.emitBin ?? false) : true;
  const emitHex = anyPrimaryEmitSpecified ? (options.emitHex ?? false) : true;
  const emitD8m = anyPrimaryEmitSpecified ? (options.emitD8m ?? false) : true;

  // Listing is a sidecar artifact: default to on unless explicitly suppressed.
  const emitListing = options.emitListing ?? true;
  const emitAsm80 = options.emitAsm80 ?? false;

  return { emitBin, emitHex, emitD8m, emitListing, emitAsm80 };
}

/**
 * Compile an AZM/ASM80-family program starting from an entry file.
 *
 * - Resolves imports transitively (deterministic topological order with cycle checks).
 * - Runs parse → semantics → lowering → format writers.
 * - Produces artifacts in-memory via `deps.formats`.
 * - Defaults to emitting BIN + HEX + D8M unless an emit flag is explicitly provided.
 */
export const compile: CompileFn = async (
  entryFile: string,
  options: CompilerOptions,
  deps: PipelineDeps,
): Promise<CompileResult> => {
  const entryPath = normalizePath(entryFile);
  const diagnostics: Diagnostic[] = [];
  const artifacts: Artifact[] = [];
  const sourceMode = options.sourceMode ?? inferSourceMode(entryPath);
  if (!sourceMode) {
    diagnostics.push({
      id: DiagnosticIds.Unknown,
      severity: 'error',
      message: 'Unsupported source file extension (expected .azm, .asm, or .z80)',
      file: entryPath,
    });
    return { diagnostics, artifacts };
  }
  const projectAliasProfiles = [];
  for (const path of options.directiveAliasFiles ?? []) {
    projectAliasProfiles.push(await readDirectiveAliasProfile(normalizePath(path)));
  }
  const directiveAliasPolicy = buildDirectiveAliasPolicy(
    defaultDirectiveAliasProfileName(),
    projectAliasProfiles,
  );
  const loaded = await loadProgram(entryPath, diagnostics, {
    ...options,
    sourceMode,
    directiveAliasPolicy,
  });
  if (!loaded) return { diagnostics, artifacts };
  const { program, sourceTexts, sourceLineComments } = loaded;

  if (sourceMode === 'azm') {
    diagnostics.push(...diagnosticsForAzmRemovedZaxConstructs(program));
  }

  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts };
  }

  const analysis = analyzeLoadedProgram(loaded, {
    ...(options.caseStyle !== undefined ? { caseStyle: options.caseStyle } : {}),
    ...(options.requireMain !== undefined ? { requireMain: options.requireMain } : {}),
  });
  diagnostics.push(...analysis.diagnostics);
  if (hasErrors(diagnostics) || !analysis.env) return { diagnostics, artifacts };
  const env = analysis.env;

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
    const interfaceContracts = [];
    for (const path of options.registerCareInterfaces ?? []) {
      const resolved = normalizePath(path);
      const text = await readFile(resolved, 'utf8');
      interfaceContracts.push(...parseAzmiContracts(text, resolved).values());
    }
    const registerCare = analyzeRegisterCare(loaded, {
      mode: registerCareMode,
      emitReport: options.emitRegisterReport === true,
      emitInterface: options.emitRegisterInterface === true,
      emitAnnotations: options.emitRegisterAnnotations === true || options.fixRegisterContracts === true,
      fixRegisterContracts: options.fixRegisterContracts === true,
      ...(options.acceptRegisterOutputCandidates !== undefined
        ? { acceptOutputCandidates: options.acceptRegisterOutputCandidates }
        : {}),
      ...(options.registerCareProfile !== undefined
        ? { profile: options.registerCareProfile }
        : {}),
      ...(interfaceContracts.length > 0 ? { interfaceContracts } : {}),
    });
    diagnostics.push(...registerCare.diagnostics);
    if (registerCare.reportText !== undefined) {
      artifacts.push({ kind: 'register-care-report', text: registerCare.reportText });
    }
    if (registerCare.interfaceText !== undefined) {
      artifacts.push({ kind: 'register-care-interface', text: registerCare.interfaceText });
    }
    if (registerCare.annotatedFiles !== undefined) {
      artifacts.push({ kind: 'register-care-annotations', files: registerCare.annotatedFiles });
    }
    if (hasErrors(diagnostics)) {
      return { diagnostics, artifacts };
    }
  }

  const { map, symbols, placedLoweredAsmProgram } = emitProgram(program, env, diagnostics, {
    ...(options.includeDirs ? { includeDirs: options.includeDirs } : {}),
    ...(options.opStackPolicy ? { opStackPolicy: options.opStackPolicy } : {}),
    ...(options.rawTypedCallWarnings !== undefined
      ? { rawTypedCallWarnings: options.rawTypedCallWarnings }
      : {}),
    ...(options.defaultCodeBase !== undefined ? { defaultCodeBase: options.defaultCodeBase } : {}),
    sourceTexts,
    sourceLineComments,
  });
  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts };
  }

  const emit = withDefaults(options);

  if (emit.emitBin) {
    artifacts.push(deps.formats.writeBin(map, symbols));
  }
  if (emit.emitHex) {
    artifacts.push(deps.formats.writeHex(map, symbols));
  }
  if (emit.emitD8m) {
    const mainEntry =
      (symbols.find((s) => s.kind === 'label' && s.name.toLowerCase() === STARTUP_ENTRY_LABEL) as
        | { kind: 'label'; name: string; address: number }
        | undefined) ??
      (symbols.find((s) => s.kind === 'label' && s.name.toLowerCase() === 'main') as
        | { kind: 'label'; name: string; address: number }
        | undefined);
    artifacts.push(
      deps.formats.writeD8m(map, symbols, {
        rootDir: dirname(entryPath),
        ...(mainEntry
          ? {
              entrySymbol: mainEntry.name,
              entryAddress: mainEntry.address & 0xffff,
            }
          : {}),
      }),
    );
  }
  if (emit.emitListing) {
    if (deps.formats.writeListing) {
      artifacts.push(deps.formats.writeListing(map, symbols));
    } else {
      diagnostics.push({
        id: DiagnosticIds.Unknown,
        severity: 'warning',
        message: 'emitListing=true but no listing writer is configured; skipping .lst artifact.',
        file: program.entryFile,
      });
    }
  }
  if (emit.emitAsm80) {
    if (deps.formats.writeAsm80) {
      artifacts.push(deps.formats.writeAsm80(placedLoweredAsmProgram));
    } else {
      diagnostics.push({
        id: DiagnosticIds.Unknown,
        severity: 'warning',
        message: 'emitAsm80=true but no asm80 writer is configured; skipping .asm artifact.',
        file: program.entryFile,
      });
    }
  }

  return { diagnostics, artifacts };
};
