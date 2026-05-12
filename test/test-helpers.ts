import type {
  Artifact,
  Asm80Artifact,
  BinArtifact,
  D8mArtifact,
  HexArtifact,
  ListingArtifact,
} from '../src/formats/types.js';

export function artifactSnapshot(a: Artifact): { kind: string; data: string } {
  switch (a.kind) {
    case 'bin': {
      const bin = a as BinArtifact;
      return { kind: 'bin', data: Buffer.from(bin.bytes).toString('hex') };
    }
    case 'hex': {
      const hex = a as HexArtifact;
      return { kind: 'hex', data: hex.text };
    }
    case 'd8m': {
      const d8m = a as D8mArtifact;
      return { kind: 'd8m', data: JSON.stringify(d8m.json) };
    }
    case 'lst': {
      const lst = a as ListingArtifact;
      return { kind: 'lst', data: lst.text };
    }
    case 'asm80': {
      const asm80 = a as Asm80Artifact;
      return { kind: 'asm80', data: asm80.text };
    }
  }
}

export function stripStdEnvelope(bytes: Uint8Array): Uint8Array {
  // Standard typed-call preservation envelope (ordered pushes then reverse pops + RET).
  // New policy allows optional AF/BC/DE/HL preservation in order; subsets are allowed.
  const pushSeq = [0xf5, 0xc5, 0xd5, 0xe5]; // AF, BC, DE, HL
  const popSeq = [0xe1, 0xd1, 0xc1, 0xf1]; // HL, DE, BC, AF

  if (bytes.length === 0) return bytes;

  // Determine which suffix of pushSeq matches the start of the buffer.
  let startIdx = pushSeq.indexOf(bytes[0]!);
  if (startIdx === -1) return bytes;

  let prefixLen = 0;
  for (let i = startIdx; i < pushSeq.length && i - startIdx < bytes.length; i += 1) {
    if (bytes[prefixLen] === pushSeq[i]) {
      prefixLen += 1;
    } else {
      break;
    }
  }

  // Determine matching pops (must be symmetric with pushes).
  const expectedPops = popSeq.slice(popSeq.length - prefixLen);
  const hasRet = bytes[bytes.length - 1] === 0xc9;
  const popStart = bytes.length - (hasRet ? 1 : 0) - expectedPops.length;
  const ends = popStart >= 0 && expectedPops.every((b, i) => bytes[popStart + i] === b) && hasRet;

  if (prefixLen > 0 && ends && bytes.length >= prefixLen + expectedPops.length + (hasRet ? 1 : 0)) {
    return bytes.slice(prefixLen, popStart);
  }

  return bytes;
}
