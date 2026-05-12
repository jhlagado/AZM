import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR243 module-id identity regression', () => {
  it('does not collide for same basenames in different directories', async () => {
    const entry = join(__dirname, 'fixtures', 'pr243_modid_main.zax');

    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(res.artifacts.length).toBeGreaterThan(0);
  });
});
