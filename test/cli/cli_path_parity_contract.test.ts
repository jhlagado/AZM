import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { normalizePathForCompare, readArtifactSet, runCli } from '../helpers/cli.js';

describe('cli path parity contract', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('emits byte-identical artifacts for relative and absolute entry/output path forms', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-path-parity-'));
    const sub = join(work, 'sub');
    await mkdir(sub, { recursive: true });

    await writeFile(
      join(work, 'main.zax'),
      'import "lib.zax"\n\nexport func main()\n  ld a, IncConst\nend\n',
      'utf8',
    );
    await writeFile(join(work, 'lib.zax'), 'const IncConst = 7\n', 'utf8');

    const relOut = join(work, 'out-rel', 'bundle.hex');
    const absOut = join(work, 'out-abs', 'bundle.hex');

    const relRun = await runCli(['-o', '../out-rel/bundle.hex', '../main.zax'], sub);
    expect(relRun.code).toBe(0);
    expect(normalizePathForCompare(relRun.stdout.trim())).toBe(
      normalizePathForCompare(resolve(relOut)),
    );

    const absRun = await runCli(['-o', absOut, join(work, 'main.zax')], work);
    expect(absRun.code).toBe(0);
    expect(normalizePathForCompare(absRun.stdout.trim())).toBe(
      normalizePathForCompare(resolve(absOut)),
    );

    const relSnap = await readArtifactSet(join(work, 'out-rel', 'bundle'));
    const absSnap = await readArtifactSet(join(work, 'out-abs', 'bundle'));
    expect(absSnap).toEqual(relSnap);

    const d8m = JSON.parse(relSnap.d8m) as { files?: Record<string, string> };
    const fileKeys = Object.keys(d8m.files ?? {});
    expect(fileKeys.every((k) => !k.includes('\\'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 30_000);
});
