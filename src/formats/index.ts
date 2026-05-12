import type { FormatWriters } from './types.js';
import { writeBin } from './writeBin.js';
import { writeD8m } from './writeD8m.js';
import { writeHex } from './writeHex.js';
import { writeListing } from './writeListing.js';
import { writeAsm80 } from './writeAsm80.js';

/**
 * Default in-memory artifact writers for PR1.
 *
 * These writers implement the `FormatWriters` contract and return artifacts without writing to disk.
 */
export const defaultFormatWriters: FormatWriters = {
  writeHex,
  writeBin,
  writeD8m,
  writeListing,
  writeAsm80,
};
