import type { FormatWriters } from './types.js';
import { writeBin } from './write-bin.js';
import { writeD8m } from './write-d8.js';
import { writeHex } from './write-hex.js';
import { writeListing } from './write-listing.js';
import { writeAsm80 } from './write-asm80.js';

/** Default in-memory writers for Stage 12 compile API. */
export const defaultFormatWriters: FormatWriters = {
  writeBin,
  writeHex,
  writeD8m,
  writeListing,
  writeAsm80,
};
