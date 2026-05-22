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

export async function runCurrentAzmSource(sourceText: string): Promise<AssemblerRunResult> {
  const dir = await mkdtemp(join(tmpdir(), 'azm-current-diff-'));
  const entryFile = join(dir, 'main.asm');
  await writeFile(entryFile, sourceText, 'utf8');
  try {
    const compileModulePromise = import('../../../src/compile.js');
    const formatModulePromise = import('../../../src/formats/index.js');
    const [compileModule, formatModule] = await Promise.all([
      compileModulePromise,
      formatModulePromise,
    ]);
    const result = (await compileModule.compile(
      entryFile,
      {
        emitBin: true,
        emitHex: true,
        emitD8m: false,
        emitListing: false,
      },
      { formats: formatModule.defaultFormatWriters },
    )) as CurrentAzmRunResult;

    const hex = hexArtifactText(result.artifacts);
    const bin = binArtifactBytes(result.artifacts);
    return {
      exitCode: result.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0,
      stdout: '',
      stderr: result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .filter(Boolean)
        .join('\n'),
      hexText: hex,
      ...(bin !== undefined ? { binBytes: bin } : {}),
      diagnosticsText: result.diagnostics
        .map((diagnostic) => diagnostic.message)
        .filter(Boolean)
        .map((message) => message.replace(/\r\n/g, '\n'))
        .map((message) => message.trimEnd()),
    };
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
