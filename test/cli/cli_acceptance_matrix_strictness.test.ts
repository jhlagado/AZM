import { beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, normalizePathForCompare, runCli } from '../helpers/cli.js';

type ArtifactKind = 'bin' | 'hex' | 'd8m' | 'lst';
type ArtifactExpectation = Record<ArtifactKind, boolean>;

const allArtifacts: ArtifactKind[] = ['bin', 'hex', 'd8m', 'lst'];

function artifactPath(base: string, kind: ArtifactKind): string {
  switch (kind) {
    case 'bin':
      return `${base}.bin`;
    case 'hex':
      return `${base}.hex`;
    case 'd8m':
      return `${base}.d8.json`;
    case 'lst':
      return `${base}.lst`;
  }
}

async function readArtifact(base: string, kind: ArtifactKind): Promise<string> {
  const path = artifactPath(base, kind);
  if (kind === 'bin') {
    const bytes = await readFile(path);
    return Buffer.from(bytes).toString('hex');
  }
  return readFile(path, 'utf8');
}

describe('cli acceptance matrix strictness', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('keeps artifact payloads stable across primary-type and suppression combinations', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-acceptance-matrix-'));
    const entry = join(work, 'main.zax');
    await writeFile(
      entry,
      [
        'const X = 7',
        'const Y = 11',
        '',
        'export func main()',
        '  ld a, X',
        '  add a, Y',
        'end',
        '',
      ].join('\n'),
      'utf8',
    );

    const cases: Array<{
      name: string;
      outputType: 'hex' | 'bin';
      flags: string[];
      expected: ArtifactExpectation;
    }> = [
      {
        name: 'full-hex-primary',
        outputType: 'hex',
        flags: [],
        expected: { bin: true, hex: true, d8m: true, lst: true },
      },
      {
        name: 'full-bin-primary',
        outputType: 'bin',
        flags: ['--type', 'bin'],
        expected: { bin: true, hex: true, d8m: true, lst: true },
      },
      {
        name: 'hex-only',
        outputType: 'hex',
        flags: ['--nobin', '--nod8m', '--nolist'],
        expected: { bin: false, hex: true, d8m: false, lst: false },
      },
      {
        name: 'bin-only',
        outputType: 'bin',
        flags: ['--type', 'bin', '--nohex', '--nod8m', '--nolist'],
        expected: { bin: true, hex: false, d8m: false, lst: false },
      },
      {
        name: 'hex-plus-listing',
        outputType: 'hex',
        flags: ['--nobin', '--nod8m'],
        expected: { bin: false, hex: true, d8m: false, lst: true },
      },
      {
        name: 'bin-plus-d8m',
        outputType: 'bin',
        flags: ['--type', 'bin', '--nohex', '--nolist'],
        expected: { bin: true, hex: false, d8m: true, lst: false },
      },
      {
        name: 'hex-plus-d8m',
        outputType: 'hex',
        flags: ['--nobin', '--nolist'],
        expected: { bin: false, hex: true, d8m: true, lst: false },
      },
      {
        name: 'bin-plus-listing',
        outputType: 'bin',
        flags: ['--type', 'bin', '--nohex', '--nod8m'],
        expected: { bin: true, hex: false, d8m: false, lst: true },
      },
    ];

    const canonical = new Map<ArtifactKind, string>();

    for (const c of cases) {
      const outDir = join(work, c.name);
      const primaryPath = join(outDir, c.outputType === 'hex' ? 'bundle.hex' : 'bundle.bin');
      const base = join(outDir, 'bundle');
      const res = await runCli([...c.flags, '-o', primaryPath, entry]);

      expect(res.code).toBe(0);
      expect(normalizePathForCompare(res.stdout.trim())).toBe(
        normalizePathForCompare(resolve(primaryPath)),
      );
      expect(res.stderr).toBe('');

      for (const kind of allArtifacts) {
        const present = await exists(artifactPath(base, kind));
        expect(present, `${c.name}:${kind}`).toBe(c.expected[kind]);
        if (!present) continue;
        const payload = await readArtifact(base, kind);
        const prior = canonical.get(kind);
        if (prior === undefined) canonical.set(kind, payload);
        else expect(payload, `${c.name}:${kind}:payload`).toBe(prior);
      }
    }

    await rm(work, { recursive: true, force: true });
  }, 40_000);

  it('keeps artifacts deterministic across include path spellings (relative, absolute, equals-form)', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-include-parity-'));
    const entry = join(work, 'entry.zax');
    const incDir = join(work, 'incs');
    const relativeInc = './incs';

    await mkdir(incDir, { recursive: true });
    await writeFile(
      entry,
      'import "shared.zax"\n\nexport func main()\n  ld a, Shared\nend\n',
      'utf8',
    );
    await writeFile(join(incDir, 'shared.zax'), 'const Shared = 9\n', 'utf8');

    const absOut = join(work, 'abs', 'bundle.hex');
    const eqOut = join(work, 'eq', 'bundle.hex');

    const absRes = await runCli(['-I', incDir, '-o', absOut, entry]);
    expect(absRes.code).toBe(0);
    const absBase = join(work, 'abs', 'bundle');

    const relRes = await runCli(['-I', relativeInc, '-o', './rel/bundle.hex', './entry.zax'], work);
    expect(relRes.code).toBe(0);
    const relBase = join(work, 'rel', 'bundle');

    const eqRes = await runCli(
      [`--include=${incDir}`, `--output=${eqOut}`, join(work, 'entry.zax')],
      join(work, '.'),
    );
    expect(eqRes.code).toBe(0);
    const eqBase = join(work, 'eq', 'bundle');

    for (const kind of allArtifacts) {
      const absPayload = await readArtifact(absBase, kind);
      const relPayload = await readArtifact(relBase, kind);
      const eqPayload = await readArtifact(eqBase, kind);
      expect(relPayload, `relative-vs-absolute:${kind}`).toBe(absPayload);
      expect(eqPayload, `equals-vs-absolute:${kind}`).toBe(absPayload);
    }

    await rm(work, { recursive: true, force: true });
  }, 40_000);

  it('pins a strict negative contract matrix for malformed CLI argument shapes', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-negative-matrix-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n  nop\nend\n', 'utf8');

    const cases: Array<{ name: string; args: string[]; message: string }> = [
      {
        name: 'entry-not-last',
        args: [entry, '--nolist'],
        message: 'Expected exactly one <entry.zax> argument',
      },
      {
        name: 'missing-output-value',
        args: ['--output'],
        message: '--output expects a value',
      },
      {
        name: 'missing-include-value',
        args: ['-I'],
        message: '-I expects a value',
      },
      {
        name: 'missing-type-value',
        args: ['--type'],
        message: '--type expects a value',
      },
      {
        name: 'unknown-option',
        args: ['--badflag', entry],
        message: 'Unknown option',
      },
      {
        name: 'unsupported-case-style',
        args: ['--case-style', 'camel', entry],
        message: 'Unsupported --case-style "camel"',
      },
      {
        name: 'output-type-extension-mismatch',
        args: ['--type', 'bin', '-o', join(work, 'out.hex'), entry],
        message: '--output must end with ".bin"',
      },
    ];

    for (const c of cases) {
      const res = await runCli(c.args);
      expect(res.code, c.name).toBe(2);
      expect(res.stderr, c.name).toContain(c.message);
      expect(res.stdout, c.name).toBe('');
    }

    await rm(work, { recursive: true, force: true });
  }, 30_000);
});
