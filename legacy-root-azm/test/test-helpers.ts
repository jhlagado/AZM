import type {
  Artifact,
  Asm80Artifact,
  BinArtifact,
  D8mArtifact,
  HexArtifact,
  ListingArtifact,
  RegisterCareAnnotationsArtifact,
  RegisterCareInterfaceArtifact,
  RegisterCareReportArtifact,
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
    case 'register-care-report': {
      const report = a as RegisterCareReportArtifact;
      return { kind: 'register-care-report', data: report.text };
    }
    case 'register-care-interface': {
      const iface = a as RegisterCareInterfaceArtifact;
      return { kind: 'register-care-interface', data: iface.text };
    }
    case 'register-care-annotations': {
      const annotations = a as RegisterCareAnnotationsArtifact;
      return { kind: 'register-care-annotations', data: JSON.stringify(annotations.files) };
    }
  }
}

export function binBytes(artifacts: Artifact[]): number[] {
  const bin = artifacts.find((artifact): artifact is BinArtifact => artifact.kind === 'bin');
  if (!bin) throw new Error('missing bin artifact');
  return Array.from(bin.bytes);
}

export function containsSubsequence(haystack: number[], needle: number[]): boolean {
  return haystack.some((_, index) =>
    needle.every((byte, offset) => haystack[index + offset] === byte),
  );
}
