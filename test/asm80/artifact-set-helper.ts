import type { Artifact, Asm80Artifact, BinArtifact, D8mArtifact } from '../../src/outputs/types.js';

import { requireAsm80Artifact } from './asm80-artifact-helper.js';
import { requireBinArtifact } from './bin-artifact-helper.js';

export function requireAsm80Artifacts(artifacts: readonly Artifact[]): {
  asm80: Asm80Artifact;
  bin: BinArtifact;
  d8m: D8mArtifact;
} {
  const d8m = artifacts.find((artifact): artifact is D8mArtifact => artifact.kind === 'd8m');
  if (!d8m) throw new Error('missing artifacts');
  return { asm80: requireAsm80Artifact(artifacts), bin: requireBinArtifact(artifacts), d8m };
}
