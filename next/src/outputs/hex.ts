export function writeIntelHex(origin: number, bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return ':00000001FF\n';
  }

  const dataLine = writeRecord(bytes.length, origin, 0x00, Array.from(bytes));
  return `${dataLine}\n:00000001FF\n`;
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
