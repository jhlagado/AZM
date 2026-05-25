import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile, defaultFormatWriters } from '../../src/index.js';
import type { Asm80Artifact } from '../../src/outputs/types.js';

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('stage 15 assembler lowering evidence', () => {
  it('writes a canonical lowered .z80 artifact from parsed source items', async () => {
    await withTempDir('azm-next-lowering-source-', async (dir) => {
      const include = join(dir, 'inc.inc');
      const entry = join(dir, 'main.asm');
      await writeFile(include, 'VALUE .equ $2a\n', 'utf8');
      await writeFile(entry, '.include "inc.inc"\nmain:\n  ld a,VALUE\n  ret\n', 'utf8');

      const result = await compile(
        entry,
        {
          emitBin: false,
          emitHex: false,
          emitD8m: false,
          emitAsm80: true,
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      const asm80 = result.artifacts.find(
        (artifact): artifact is Asm80Artifact => artifact.kind === 'asm80',
      );
      expect(asm80).toBeDefined();
      expect(asm80?.text).toBe(
        '; AZM lowered ASM80 output\n\nORG $00\nVALUE EQU $2A\nmain:\nld a, $2A\nret\n',
      );
      expect(asm80?.text).not.toEqual('; AZM lowered ASM80 output\n');
    });
  });
});
