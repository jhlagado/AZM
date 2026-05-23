import type { AddressRange, EmittedByteMap } from './types.js';

export function getWrittenSegments(map: EmittedByteMap): AddressRange[] {
  if (map.bytes.size === 0) return [];

  const addresses = [...new Set(map.bytes.keys())].sort((a, b) => a - b);
  const segments: AddressRange[] = [];
  let start = addresses[0]!;
  let previous = start;

  for (let index = 1; index < addresses.length; index += 1) {
    const address = addresses[index]!;
    if (address <= previous + 1) {
      previous = address;
      continue;
    }
    segments.push({ start, end: previous + 1 });
    start = address;
    previous = address;
  }

  segments.push({ start, end: previous + 1 });
  return segments;
}

export function getWrittenRange(map: EmittedByteMap): AddressRange {
  if (map.writtenRange) return map.writtenRange;
  const segments = getWrittenSegments(map);
  if (segments.length === 0) return { start: 0, end: 0 };
  return {
    start: segments[0]!.start,
    end: segments[segments.length - 1]!.end,
  };
}
