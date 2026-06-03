import type { Artifact, Asm80Artifact } from '../../src/outputs/types.js';

export function requireAsm80Artifact(artifacts: readonly Artifact[]): Asm80Artifact {
  const asm80 = artifacts.find((artifact): artifact is Asm80Artifact => artifact.kind === 'asm80');
  if (!asm80) throw new Error('missing asm80 artifact');
  return asm80;
}
