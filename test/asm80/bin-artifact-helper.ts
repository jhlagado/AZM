import type { Artifact, BinArtifact } from '../../src/outputs/types.js';

export function requireBinArtifact(artifacts: readonly Artifact[]): BinArtifact {
  const bin = artifacts.find((artifact): artifact is BinArtifact => artifact.kind === 'bin');
  if (!bin) throw new Error('missing bin artifact');
  return bin;
}
