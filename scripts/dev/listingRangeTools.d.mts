export function parseListingWrittenRange(listingPath: string): { start: number; end: number };
export function binaryFromListingRange(
  bytes: Buffer,
  range: { start: number; end: number },
): Buffer;
