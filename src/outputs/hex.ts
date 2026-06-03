export function writeIntelHex(
  origin: number,
  bytes: Uint8Array,
  reservedAddresses: readonly number[] = [],
  initializedAddresses: readonly number[] = [],
): string {
  if (bytes.length === 0) {
    return ':00000001FF\n';
  }

  const records: string[] = [];
  const end = origin + bytes.length;
  const segments = toNonReservedSegments(origin, end, reservedAddresses, initializedAddresses);

  if (segments.length === 0) {
    for (let address = origin; address < end; address += 16) {
      const count = Math.min(16, end - address);
      const startOffset = address - origin;
      const chunk = Array.from(bytes.slice(startOffset, startOffset + count));
      records.push(writeRecord(count, address, 0x00, chunk));
    }
    return `${records.join('\n')}\n:00000001FF\n`;
  }

  for (const segment of segments) {
    for (let address = segment.start; address < segment.end; address += 16) {
      const startOffset = address - origin;
      const count = Math.min(16, segment.end - address);
      const chunk = Array.from(bytes.slice(startOffset, startOffset + count));
      records.push(writeRecord(count, address, 0x00, chunk));
    }
  }

  return `${records.join('\n')}\n:00000001FF\n`;
}

function toNonReservedSegments(
  start: number,
  end: number,
  reservedAddresses: readonly number[],
  initializedAddresses: readonly number[],
): readonly { readonly start: number; readonly end: number }[] {
  const bounds = initializedBounds(start, end, initializedAddresses);
  if (!bounds) return [];
  const reservedInRange = addressSetInRange(start, end, reservedAddresses);
  if (reservedInRange.size === 0) return [];

  const segments: { start: number; end: number }[] = [];
  let segmentStart: number | undefined;
  let segmentEnd = start;

  for (let address = start; address < end; address += 1) {
    if (shouldSkipReservedAddress(address, bounds, reservedInRange)) {
      closeSegment(segments, segmentStart, segmentEnd);
      segmentStart = undefined;
      segmentEnd = address + 1;
      continue;
    }

    if (segmentStart === undefined) {
      segmentStart = address;
    }
    segmentEnd = address + 1;
  }

  if (segmentStart !== undefined) {
    segments.push({ start: segmentStart, end: segmentEnd });
  }

  return segments;
}

function initializedBounds(
  start: number,
  end: number,
  initializedAddresses: readonly number[],
): { readonly first: number; readonly last: number } | undefined {
  const inRange = initializedAddresses.filter((address) => address >= start && address < end);
  if (inRange.length === 0) return undefined;
  return {
    first: inRange.reduce((best, address) => Math.min(best, address), end),
    last: inRange.reduce((best, address) => Math.max(best, address), start - 1),
  };
}

function addressSetInRange(
  start: number,
  end: number,
  addresses: readonly number[],
): ReadonlySet<number> {
  return new Set(addresses.filter((address) => address >= start && address < end));
}

function shouldSkipReservedAddress(
  address: number,
  initialized: { readonly first: number; readonly last: number },
  reservedInRange: ReadonlySet<number>,
): boolean {
  return address > initialized.first && address < initialized.last && reservedInRange.has(address);
}

function closeSegment(
  segments: { start: number; end: number }[],
  segmentStart: number | undefined,
  segmentEnd: number,
): void {
  if (segmentStart !== undefined) {
    segments.push({ start: segmentStart, end: segmentEnd });
  }
}

function writeRecord(
  length: number,
  address: number,
  type: number,
  bytes: readonly number[],
): string {
  const fields = [length, (address >> 8) & 0xff, address & 0xff, type, ...bytes];
  const checksum = ((~fields.reduce((sum, value) => sum + value, 0) + 1) & 0xff) >>> 0;
  return `:${toHex(length)}${toHex((address >> 8) & 0xff)}${toHex(address & 0xff)}${toHex(type)}${bytes
    .map(toHex)
    .join('')}${toHex(checksum)}`;
}

function toHex(value: number): string {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}
