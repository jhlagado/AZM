// @ts-nocheck
import { rm, writeFile } from 'node:fs/promises';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AssemblerRunResult } from './compare-results.js';

type CurrentAzmRunResult = {
  readonly artifacts: { kind: string }[];
  readonly diagnostics: { message?: string; severity?: string }[];
};

interface RunCurrentAzmOptions {
  readonly emitSidecars?: boolean;
}

function asRunResult(result: CurrentAzmRunResult): AssemblerRunResult {
  return {
    exitCode: result.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0,
    stdout: '',
    stderr: result.diagnostics
      .map((diagnostic) => diagnostic.message)
      .filter(Boolean)
      .join('\n'),
    hexText: hexArtifactText(result.artifacts),
    ...(listingArtifactText(result.artifacts) !== undefined
      ? { listingText: listingArtifactText(result.artifacts) }
      : {}),
    ...(d8mArtifactJson(result.artifacts) !== undefined
      ? { d8mJson: d8mArtifactJson(result.artifacts) }
      : {}),
    ...(binArtifactBytes(result.artifacts) !== undefined
      ? { binBytes: binArtifactBytes(result.artifacts) }
      : {}),
    diagnosticsText: result.diagnostics
      .map((diagnostic) => diagnostic.message)
      .filter(Boolean)
      .map((message) => message.replace(/\r\n/g, '\n'))
      .map((message) => message.trimEnd()),
  };
}

export async function runCurrentAzmSource(
  sourceText: string,
  options: RunCurrentAzmOptions = {},
): Promise<AssemblerRunResult> {
  const dir = await mkdtemp(join(tmpdir(), 'azm-current-diff-'));
  const entryFile = join(dir, 'main.asm');
  await writeFile(entryFile, sourceText, 'utf8');
  try {
    const compileModulePromise = import('../../legacy-root-azm/src/compile.js');
    const formatModulePromise = import('../../legacy-root-azm/src/formats/index.js');
    const [compileModule, formatModule] = await Promise.all([
      compileModulePromise,
      formatModulePromise,
    ]);
    const result = (await compileModule.compile(
      entryFile,
      {
        emitBin: true,
        emitHex: true,
        emitD8m: options.emitSidecars === true,
        emitListing: options.emitSidecars === true,
      },
      { formats: formatModule.defaultFormatWriters },
    )) as CurrentAzmRunResult;

    return asRunResult({ ...result, diagnostics: result.diagnostics });
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: String(error instanceof Error ? error.message : error),
      hexText: '',
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runCurrentAzmFixture(
  entryFile: string,
  includeDirs: readonly string[] = [],
  options: RunCurrentAzmOptions = {},
): Promise<AssemblerRunResult> {
  try {
    const compileModule = await import('../../legacy-root-azm/src/compile.js');
    const formatModule = await import('../../legacy-root-azm/src/formats/index.js');
    const result = (await compileModule.compile(
      entryFile,
      {
        emitBin: true,
        emitHex: true,
        emitD8m: options.emitSidecars === true,
        emitListing: options.emitSidecars === true,
        includeDirs,
      },
      { formats: formatModule.defaultFormatWriters },
    )) as CurrentAzmRunResult;
    return asRunResult(result);
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: String(error instanceof Error ? error.message : error),
      hexText: '',
    };
  }
}

function hexArtifactText(artifacts: { kind: string }[]): string {
  const hex = artifacts.find(
    (artifact): artifact is { kind: 'hex'; text: string } => artifact.kind === 'hex',
  );
  return hex?.text ?? '';
}

function binArtifactBytes(artifacts: { kind: string }[]): Uint8Array | undefined {
  const bin = artifacts.find(
    (artifact): artifact is { kind: 'bin'; bytes: Uint8Array } => artifact.kind === 'bin',
  );
  return bin?.bytes;
}

function listingArtifactText(artifacts: { kind: string }[]): string | undefined {
  const listing = artifacts.find(
    (artifact): artifact is { kind: 'lst'; text: string } => artifact.kind === 'lst',
  );
  return listing?.text;
}

function d8mArtifactJson(artifacts: { kind: string }[]): unknown {
  const d8m = artifacts.find(
    (artifact): artifact is { kind: 'd8m'; json: unknown } => artifact.kind === 'd8m',
  );
  return d8m?.json;
}
