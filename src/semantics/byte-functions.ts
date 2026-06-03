import type { ByteFunction } from './constant-operator-types.js';

const byteFunctions: Readonly<Record<ByteFunction, (value: number) => number>> = {
  LSB: (value) => value & 0xff,
  MSB: (value) => (value >> 8) & 0xff,
};

export function applyByteFunction(functionName: ByteFunction, value: number): number {
  return byteFunctions[functionName](value);
}
