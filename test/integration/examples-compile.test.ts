import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { compileNext } from '../../src/index.js';

const EXAMPLES_DIR = fileURLToPath(new URL('../../examples', import.meta.url));

async function exampleEntries(): Promise<string[]> {
  const entries = (await readdir(EXAMPLES_DIR, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() && (entry.name.endsWith('.asm') || entry.name.endsWith('.z80')),
    )
    .map((entry) => join(EXAMPLES_DIR, entry.name))
    .sort((left, right) => left.localeCompare(right));
  return entries;
}

describe('examples', () => {
  it('compile cleanly', async () => {
    const entries = await exampleEntries();
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const source = await readFile(entry, 'utf8');
      const res = compileNext(source, { entryName: entry });
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    }
  });

  it('compile deterministically across repeated runs', async () => {
    const entries = await exampleEntries();
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const source = await readFile(entry, 'utf8');
      const first = compileNext(source, { entryName: entry });
      const firstDiagnostics = first.diagnostics.map((d) => ({
        code: d.code,
        message: d.message,
        severity: d.severity,
      }));
      const firstBytes = Array.from(first.bytes);
      const firstHex = first.hexText;

      for (let run = 0; run < 3; run++) {
        const next = compileNext(source, { entryName: entry });
        expect(
          next.diagnostics.map((d) => ({
            code: d.code,
            message: d.message,
            severity: d.severity,
          })),
        ).toEqual(firstDiagnostics);
        expect(Array.from(next.bytes)).toEqual(firstBytes);
        expect(next.hexText).toBe(firstHex);
      }
    }
  });
});
