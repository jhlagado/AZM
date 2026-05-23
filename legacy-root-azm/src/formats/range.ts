import type { AddressRange, EmittedByteMap } from './types.js';

/**
 * Compute contiguous written segments from an emitted byte map.
 *
 * - Segments are half-open `[start, end)`.
 * - Segment boundaries are based on concrete written byte addresses.
 * - For an empty map, `[]` is returned.
 */
export function getWrittenSegments(map: EmittedByteMap): AddressRange[] {
  if (map.bytes.size === 0) return [];

  const sorted = [...new Set(map.bytes.keys())].sort((a, b) => a - b);
  const segments: AddressRange[] = [];
  let start = sorted[0]!;
  let prev = start;

  for (let index = 1; index < sorted.length; index++) {
    const addr = sorted[index]!;
    if (addr <= prev + 1) {
      prev = addr;
      continue;
    }
    segments.push({ start, end: prev + 1 });
    start = addr;
    prev = addr;
  }

  segments.push({ start, end: prev + 1 });
  return segments;
}

/**
 * Compute the effective written range for an emitted byte map.
 *
 * - If `map.writtenRange` is present, it is returned directly.
 * - Otherwise, the range is derived from the min/max written addresses.
 * - For an empty map, `{ start: 0, end: 0 }` is returned.
 */
export function getWrittenRange(map: EmittedByteMap): AddressRange {
  if (map.writtenRange) return map.writtenRange;
  const segments = getWrittenSegments(map);
  if (segments.length === 0) return { start: 0, end: 0 };
  return {
    start: segments[0]!.start,
    end: segments[segments.length - 1]!.end,
  };
}
