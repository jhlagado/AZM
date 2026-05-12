import { mkdtemp, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { __cliBuildInternals } from './helpers/cliBuild.js';

describe('PR249 CLI build infrastructure checks', () => {
  const { latestInputMtimeMsForRoots } = __cliBuildInternals;

  it('scans roots and returns the latest mtime for inputs', async () => {
    const root = await mkdtemp(join(tmpdir(), 'zax-cli-build-'));
    const older = join(root, 'older.txt');
    const newer = join(root, 'newer.txt');

    await writeFile(older, 'old');
    await writeFile(newer, 'new');

    const oldTime = new Date(Date.now() - 10_000);
    const newTime = new Date(Date.now());
    await utimes(older, oldTime, oldTime);
    await utimes(newer, newTime, newTime);

    const latest = await latestInputMtimeMsForRoots([root]);
    const newerStat = await stat(newer);
    expect(latest).toBeGreaterThanOrEqual(newerStat.mtimeMs);
  });
});
