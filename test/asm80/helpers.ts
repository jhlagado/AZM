import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import type { Artifact, Asm80Artifact, BinArtifact, D8mArtifact } from '../../src/outputs/types.js';

export function getBinBase(d8m: D8mArtifact): number {
  const segments = d8m.json.segments as Array<{ start: number; end: number }>;
  return Math.min(...segments.map((segment) => segment.start));
}

export async function compileAsm80Fixture(
  tmpPrefix: string,
  fileName: string,
  lines: string[],
  options: { emitAsm80?: boolean } = { emitAsm80: true },
): Promise<readonly Artifact[]> {
  const dir = mkdtempSync(join(tmpdir(), tmpPrefix));
  const entry = join(dir, fileName);
  writeFileSync(entry, lines.join('\n'), 'utf8');

  const res = await compile(
    entry,
    {
      emitBin: true,
      emitAsm80: options.emitAsm80 ?? true,
      emitD8m: true,
    },
    { formats: defaultFormatWriters },
  );
  if (res.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error(`unexpected diagnostics: ${JSON.stringify(res.diagnostics)}`);
  }
  return res.artifacts;
}

export function requireBinArtifact(artifacts: readonly Artifact[]): BinArtifact {
  const bin = artifacts.find((artifact): artifact is BinArtifact => artifact.kind === 'bin');
  if (!bin) throw new Error('missing bin artifact');
  return bin;
}

export function requireAsm80Artifact(artifacts: readonly Artifact[]): Asm80Artifact {
  const asm80 = artifacts.find((artifact): artifact is Asm80Artifact => artifact.kind === 'asm80');
  if (!asm80) throw new Error('missing asm80 artifact');
  return asm80;
}

export function requireAsm80Artifacts(artifacts: readonly Artifact[]): {
  asm80: Asm80Artifact;
  bin: BinArtifact;
  d8m: D8mArtifact;
} {
  const d8m = artifacts.find((artifact): artifact is D8mArtifact => artifact.kind === 'd8m');
  const bin = artifacts.find((artifact): artifact is BinArtifact => artifact.kind === 'bin');
  const asm80 = artifacts.find((artifact): artifact is Asm80Artifact => artifact.kind === 'asm80');
  if (!d8m || !bin || !asm80) throw new Error('missing artifacts');
  return { asm80, bin, d8m };
}
