import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { runCli } from '../helpers/cli.js';

describe('npm zax smoke', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('builds and prints version via npm script wrapper', async () => {
    const res = await runCli(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).not.toBe('');
  });
});
