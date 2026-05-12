import type { AddressRange, EmittedSourceSegment } from '../formats/types.js';

type LayoutDiag = (message: string) => void;

export function alignTo(n: number, alignment: number): number {
  return alignment <= 0 ? n : Math.ceil(n / alignment) * alignment;
}

export function writeSection(
  base: number,
  section: Map<number, number>,
  bytes: Map<number, number>,
  report: LayoutDiag,
): void {
  for (const [offset, value] of section) {
    const addr = base + offset;
    if (addr < 0 || addr > 0xffff) {
      report(`Emitted byte address out of range: ${addr}.`);
      continue;
    }
    if (bytes.has(addr)) {
      report(`Byte overlap at address ${addr}.`);
      continue;
    }
    bytes.set(addr, value);
  }
}

export function computeWrittenRange(bytes: Map<number, number>): AddressRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const addr of bytes.keys()) {
    min = Math.min(min, addr);
    max = Math.max(max, addr);
  }

  return Number.isFinite(min) && Number.isFinite(max)
    ? { start: min, end: max + 1 }
    : { start: 0, end: 0 };
}

export function rebaseCodeSourceSegments(
  codeBase: number,
  segments: EmittedSourceSegment[],
): EmittedSourceSegment[] {
  return segments
    .map((segment) => ({
      ...segment,
      start: codeBase + segment.start,
      end: codeBase + segment.end,
    }))
    .filter(
      (segment) => segment.start >= 0 && segment.end <= 0x10000 && segment.end > segment.start,
    );
}

