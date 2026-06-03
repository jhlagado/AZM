import { readFileSync } from 'node:fs';

export function parseListingWrittenRange(listingPath) {
  const text = readFileSync(listingPath, 'utf8');
  let start;
  let end = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9A-Fa-f]{4})\s+/.exec(line);
    if (!match) continue;
    const address = Number.parseInt(match[1], 16);
    const bytes = line
      .slice(7, 31)
      .trim()
      .split(/\s+/)
      .filter((token) => /^[0-9A-Fa-f]{2}$/.test(token)).length;
    if (bytes === 0) continue;
    start = start === undefined ? address : Math.min(start, address);
    end = Math.max(end, address + bytes);
  }
  return { start: start ?? 0, end };
}

export function binaryFromListingRange(bytes, range) {
  if (bytes.length !== 0x10000) return bytes;
  let end = range.end;
  for (let index = bytes.length - 1; index >= range.start; index--) {
    if (bytes[index] !== 0) {
      end = Math.max(end, index + 1);
      break;
    }
  }
  return bytes.subarray(range.start, end);
}
