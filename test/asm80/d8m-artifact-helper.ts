import type { D8mArtifact } from '../../src/outputs/types.js';

export function getBinBase(d8m: D8mArtifact): number {
  const segments = d8m.json.segments as Array<{ start: number; end: number }>;
  return Math.min(...segments.map((segment) => segment.start));
}
