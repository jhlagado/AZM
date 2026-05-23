import { compile } from '../../src/api-compile.js';
import type { AssemblerRunResult } from './compare-results.js';
import { compileNext } from '../../src/core/compile.js';

type NextAzmFixtureResult = {
  readonly artifacts: readonly { kind: string }[];
  readonly diagnostics: { message?: string; severity?: string }[];
};

export function runNextAzmSource(sourceText: string): AssemblerRunResult {
  try {
    const result = compileNext(sourceText);
    const diagnosticsText = result.diagnostics
      .map((diagnostic) => diagnostic.message)
      .filter((message): message is string => typeof message === 'string')
      .map((message) => message.replace(/\r\n/g, '\n'))
      .map((message) => message.trimEnd());
    return {
      exitCode: result.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0,
      stdout: '',
      stderr: diagnosticsText.join('\n'),
      hexText: result.hexText,
      binBytes: result.bytes,
      diagnosticsText,
    };
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: String(error instanceof Error ? error.message : error),
    };
  }
}

export async function runNextAzmFixture(
  entryFile: string,
  includeDirs: readonly string[] = [],
): Promise<AssemblerRunResult> {
  try {
    const result = (await compile(entryFile, {
      emitBin: true,
      emitHex: true,
      emitD8m: false,
      emitListing: false,
      includeDirs,
    })) as unknown as NextAzmFixtureResult;
    return asRunResult(result);
  } catch (error) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: String(error instanceof Error ? error.message : error),
    };
  }
}

function asRunResult(result: NextAzmFixtureResult): AssemblerRunResult {
  const diagnosticsText = result.diagnostics
    .filter(
      (diagnostic): diagnostic is { message: string; severity?: string } =>
        typeof diagnostic.message === 'string',
    )
    .map((diagnostic) => diagnostic.message)
    .map((message) => message.replace(/\r\n/g, '\n'))
    .map((message) => message.trimEnd());
  const binBytes = nextBinBytes(result.artifacts);
  return {
    exitCode: result.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 1 : 0,
    stdout: '',
    stderr: diagnosticsText.join('\n'),
    hexText: nextHexText(result.artifacts),
    ...(binBytes !== undefined ? { binBytes } : {}),
    diagnosticsText,
  };
}

function nextHexText(artifacts: readonly { kind: string }[]): string {
  const hex = artifacts.find((artifact): artifact is { kind: 'hex'; text: string } => artifact.kind === 'hex');
  return hex?.text ?? '';
}

function nextBinBytes(artifacts: readonly { kind: string }[]): Uint8Array | undefined {
  const bin = artifacts.find((artifact): artifact is { kind: 'bin'; bytes: Uint8Array } => artifact.kind === 'bin');
  return bin?.bytes;
}
