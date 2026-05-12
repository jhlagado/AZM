import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { Asm80Artifact } from '../src/formats/types.js';

const fixture = join(__dirname, 'fixtures', 'pr320_preserve_matrix.zax');

function prologuePushes(text: string, label: string): string[] {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `${label.toLowerCase()}:`);
  if (start === -1) return [];
  const preserveSet = new Set(['AF', 'BC', 'DE', 'HL']);
  const pushes: string[] = [];
  for (let i = start + 1; i < Math.min(lines.length, start + 12); i++) {
    const m = /push\s+([A-Za-z]+)/i.exec(lines[i]!);
    if (m) {
      const reg = m[1]!.toUpperCase();
      if (preserveSet.has(reg)) pushes.push(reg);
    } else if (pushes.length > 0) break;
  }
  return pushes;
}

describe('PR320 preserve matrix', () => {
  it('matches preservation table for void/byte/word/long with and without flags (HL volatile except void)', async () => {
    const res = await compile(
      fixture,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, emitAsm80: true },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const asm = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(asm).toBeDefined();
    const text = asm!.text;

    expect(prologuePushes(text, 'ret_void')).toEqual(['AF', 'BC', 'DE', 'HL']);
    expect(prologuePushes(text, 'ret_void_flags')).toEqual(['BC', 'DE', 'HL']);

    expect(prologuePushes(text, 'ret_byte')).toEqual(['AF', 'BC', 'DE']);
    expect(prologuePushes(text, 'ret_byte_flags')).toEqual(['BC', 'DE']);

    expect(prologuePushes(text, 'ret_word')).toEqual(['AF', 'BC', 'DE']);
    expect(prologuePushes(text, 'ret_word_flags')).toEqual(['BC', 'DE']);

    expect(prologuePushes(text, 'ret_long')).toEqual(['AF', 'BC']);
    expect(prologuePushes(text, 'ret_long_flags')).toEqual(['BC']);
  });
});
