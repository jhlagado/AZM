export function byteHex(value) {
  return value === undefined ? 'EOF' : `0x${value.toString(16).padStart(2, '0')}`;
}

export function hex(value, width = 4) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

export function byteWindow(bytes, center, radius = 4) {
  if (center === undefined || center < 0) return '[]';
  const start = Math.max(0, center - radius);
  const end = Math.min(bytes.length, center + radius + 1);
  return `[${Array.from(bytes.subarray(start, end), (byte) => hex(byte, 2)).join(' ')}]`;
}
