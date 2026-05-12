import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { readArtifactSet, runCli } from '../helpers/cli.js';

describe('cli determinism contract', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('produces identical sibling artifacts across repeated CLI runs', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-det-'));
    const entry = join(__dirname, '..', 'fixtures', 'pr11_include_main.zax');
    const includes = join(__dirname, '..', 'fixtures', 'includes');
    const outHex = join(work, 'out', 'bundle.hex');
    const base = join(work, 'out', 'bundle');

    const run1 = await runCli(['-I', includes, '-o', outHex, entry]);
    expect(run1.code).toBe(0);
    expect(run1.stdout.trim()).toBe(outHex);
    const snap1 = await readArtifactSet(base);

    const run2 = await runCli(['-I', includes, '-o', outHex, entry]);
    expect(run2.code).toBe(0);
    expect(run2.stdout.trim()).toBe(outHex);
    const snap2 = await readArtifactSet(base);

    expect(snap2).toEqual(snap1);

    const d8m = JSON.parse(snap2.d8m) as { files?: Record<string, string> };
    const fileKeys = Object.keys(d8m.files ?? {});
    expect(fileKeys.every((k) => !k.includes('\\'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 30_000);

  it('keeps artifact bytes identical across include flag forms and include order', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-det-flags-'));
    const entry = join(__dirname, '..', 'fixtures', 'pr11_include_main.zax');
    const includes = join(__dirname, '..', 'fixtures', 'includes');
    const fixturesDir = join(__dirname, '..', 'fixtures');
    const outA = join(work, 'a', 'bundle.hex');
    const outB = join(work, 'b', 'bundle.hex');

    const resA = await runCli(['-I', fixturesDir, '-I', includes, '-o', outA, entry]);
    expect(resA.code).toBe(0);
    const snapA = await readArtifactSet(join(work, 'a', 'bundle'));

    const resB = await runCli(
      [`--include=${includes}`, `--include=${fixturesDir}`, `--output=${outB}`, entry],
      work,
    );
    expect(resB.code).toBe(0);
    const snapB = await readArtifactSet(join(work, 'b', 'bundle'));

    expect(snapB).toEqual(snapA);

    await rm(work, { recursive: true, force: true });
  }, 30_000);
});
