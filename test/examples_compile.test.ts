import { describe, expect, it } from 'vitest';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { artifactSnapshot } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function diagnosticsSnapshot(res: Awaited<ReturnType<typeof compile>>): Array<{
  id: string;
  message: string;
  severity: string;
}> {
  return res.diagnostics.map((d) => ({ id: d.id, message: d.message, severity: d.severity }));
}

describe('examples', () => {
  it('compile cleanly', async () => {
    const examplesDir = join(__dirname, '..', 'examples');
    const entries = (await readdir(examplesDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.zax'))
      // Keep legacy asm80 examples around for reference, but they are not part of the current ZAX subset.
      .filter((e) => !e.name.startsWith('legacy_'))
      .map((e) => join(examplesDir, e.name))
      .sort((a, b) => a.localeCompare(b));

    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const res = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(res.diagnostics).toEqual([]);
    }
  });

  it('compile deterministically across repeated runs', async () => {
    const examplesDir = join(__dirname, '..', 'examples');
    const entries = (await readdir(examplesDir, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.zax'))
      .filter((e) => !e.name.startsWith('legacy_'))
      .map((e) => join(examplesDir, e.name))
      .sort((a, b) => a.localeCompare(b));

    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const first = await compile(entry, {}, { formats: defaultFormatWriters });
      const firstDiagnostics = diagnosticsSnapshot(first);
      const firstSnap = first.artifacts.map(artifactSnapshot);

      for (let i = 0; i < 3; i++) {
        const next = await compile(entry, {}, { formats: defaultFormatWriters });
        expect(diagnosticsSnapshot(next)).toEqual(firstDiagnostics);
        expect(next.artifacts.map(artifactSnapshot)).toEqual(firstSnap);
      }
    }
  });
});
