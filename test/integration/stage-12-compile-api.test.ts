import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compile,
  defaultFormatWriters,
  type Artifact,
  type CompileNextFunctionOptions,
  type D8mArtifact,
} from '../../src/index.js';
import type { D8mGenerator } from '../../src/outputs/types.js';
import { writeD8ProjectFixture } from '../helpers/d8_project_fixture.js';

interface ArtifactSnapshot {
  readonly kind: string;
  readonly payload: string;
}

const packageVersion = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { readonly version: string };

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function snapshotArtifacts(artifacts: readonly Artifact[]): ArtifactSnapshot[] {
  const neverArtifact = (_: never): ArtifactSnapshot => {
    throw new Error('Unhandled artifact kind');
  };

  return artifacts.map((artifact) => {
    switch (artifact.kind) {
      case 'bin': {
        return {
          kind: artifact.kind,
          payload: Buffer.from(artifact.bytes).toString('hex'),
        };
      }
      case 'hex':
        return { kind: artifact.kind, payload: artifact.text };
      case 'd8m': {
        const { generator, files, segments, ...rest } = artifact.json;
        return {
          kind: artifact.kind,
          payload: JSON.stringify({ ...rest, generator }),
        };
      }
      case 'lst': {
        return { kind: artifact.kind, payload: artifact.text };
      }
      case 'asm80': {
        return { kind: artifact.kind, payload: artifact.text };
      }
      case 'register-care-report':
      case 'register-care-interface': {
        return {
          kind: artifact.kind,
          payload: artifact.text,
        };
      }
      case 'register-care-annotations': {
        return {
          kind: artifact.kind,
          payload: JSON.stringify(artifact.files),
        };
      }
      default:
        return neverArtifact(artifact);
    }
  });
}

function toPosix(value: string): string {
  return value.replace(/\\/g, '/');
}

describe('stage 12 compile API', () => {
  const source = `.org $0100
main:
  ld a,$2a
  ret
`;

  it('returns default bin, hex, d8m, and listing artifacts from the programming API', async () => {
    await withTempDir('azm-next-compile-default-', async (dir) => {
      const entry = join(dir, 'program.asm');
      await writeFile(entry, source, 'utf8');

      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(result.diagnostics).toEqual([]);
      expect(result.artifacts.map((artifact) => artifact.kind)).toEqual([
        'bin',
        'hex',
        'd8m',
        'lst',
      ]);

      const bin = result.artifacts.find((artifact) => artifact.kind === 'bin');
      const hex = result.artifacts.find((artifact) => artifact.kind === 'hex');
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
      const lst = result.artifacts.find((artifact) => artifact.kind === 'lst');

      expect(Array.from(bin?.bytes ?? [])).toEqual([0x3e, 0x2a, 0xc9]);
      expect(hex?.text).toBe(':030100003E2AC9CB\n:00000001FF\n');
      expect(d8m).toBeDefined();
      expect(lst).toBeDefined();
    });
  });

  it('honors primary artifact suppression while keeping listing defaulting on', async () => {
    await withTempDir('azm-next-compile-suppress-', async (dir) => {
      const entry = join(dir, 'program.asm');
      await writeFile(entry, source, 'utf8');

      const bothOff = await compile(
        entry,
        { emitHex: false, emitD8m: false },
        {
          formats: defaultFormatWriters,
        },
      );
      expect(bothOff.artifacts.map((artifact) => artifact.kind)).toEqual(['lst']);

      const hexOnly = await compile(
        entry,
        { emitBin: false, emitD8m: false },
        {
          formats: defaultFormatWriters,
        },
      );
      expect(hexOnly.artifacts.map((artifact) => artifact.kind)).toEqual(['lst']);
    });
  });

  it('returns no artifacts when errors are present', async () => {
    await withTempDir('azm-next-compile-error-', async (dir) => {
      const entry = join(dir, 'error.asm');
      const bad = `ld a,UNKNOWN_SYMBOL\n`;
      await writeFile(entry, bad, 'utf8');

      const result = await compile(entry, { emitBin: false }, { formats: defaultFormatWriters });

      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_SYMBOL',
          message: 'unknown symbol: UNKNOWN_SYMBOL',
          sourceName: normalize(entry),
          line: 1,
          column: 1,
        },
      ]);
      expect(result.artifacts).toEqual([]);
    });
  });

  it('loads project directive aliases through the compile API', async () => {
    await withTempDir('azm-next-compile-aliases-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const aliases = join(dir, 'azm.aliases.json');

      await writeFile(
        aliases,
        JSON.stringify({
          extends: 'azm',
          directiveAliases: {
            DEFB: '.db',
            DEFW: '.dw',
          },
        }),
        'utf8',
      );
      await writeFile(
        entry,
        ['        ORG 0100H', 'main:', '        DEFB 1', '        DEFW main', ''].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          directiveAliasFiles: [aliases],
          emitBin: true,
          emitHex: false,
          emitListing: false,
          emitD8m: false,
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      expect(snapshotArtifacts(result.artifacts)).toEqual([{ kind: 'bin', payload: '010001' }]);
    });
  });

  it('emits case-style warnings through the compile API', async () => {
    await withTempDir('azm-next-compile-case-style-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, ['main:', '  loop: ld a, $af', '  ret', ''].join('\n'), 'utf8');

      const result = await compile(
        entry,
        { caseStyle: 'upper', emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ld" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: register "a" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ret" should be uppercase under --case-style=upper.',
        }),
      ]);
    });
  });

  it('emits case-style warnings for op invocation heads and unused op bodies', async () => {
    await withTempDir('azm-next-compile-case-style-op-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        ['op ClearA()', '  ld a, 0', 'end', 'main:', '  ClearA', '  ret', ''].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        { caseStyle: 'upper', emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ld" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: register "a" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message:
            'Case-style lint: mnemonic "ClearA" should be uppercase under --case-style=upper.',
        }),
        expect.objectContaining({
          severity: 'warning',
          code: 'AZMN_CASE_STYLE',
          message: 'Case-style lint: mnemonic "ret" should be uppercase under --case-style=upper.',
        }),
      ]);
    });
  });

  it('exports D8 metadata with normalized paths and entry symbol/address', async () => {
    await withTempDir('azm-next-compile-d8m-', async (dir) => {
      const sourceFile = join(dir, 'main.asm');
      const buildDir = join(dir, 'build');
      await mkdir(buildDir, { recursive: true });
      await writeFile(
        sourceFile,
        `.org $4000
ColorRed EQU 1
main:
  ld a, ColorRed
`,
        'utf8',
      );

      const options: CompileNextFunctionOptions = {
        emitBin: false,
        emitHex: false,
        emitListing: false,
        emitD8m: true,
        sourceRoot: dir,
        d8mInputs: {
          listing: join(buildDir, 'game.lst'),
          hex: join(buildDir, 'game.hex'),
          bin: join(buildDir, 'game.bin'),
        },
      };

      const result = await compile(sourceFile, options, { formats: defaultFormatWriters });
      expect(result.diagnostics).toEqual([]);

      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m') as
        | D8mArtifact
        | undefined;
      expect(d8m).toBeDefined();

      const json = d8m!.json;
      expect(json.generator).toMatchObject({
        name: 'azm',
        tool: 'azm',
        version: packageVersion.version,
        inputs: {
          entry: 'main.asm',
          listing: toPosix(toPosix(join('build', 'game.lst')).replace(/^\.\//, '')),
          hex: toPosix(join('build', 'game.hex')),
          bin: toPosix(join('build', 'game.bin')),
        },
        entrySymbol: 'main',
        entryAddress: 0x4000,
      } as Partial<D8mGenerator>);
      expect(json.fileList).toEqual(['main.asm']);
      expect(json.files).toHaveProperty('main.asm');

      const colorRed = json.symbols.find((symbol) => symbol.name === 'ColorRed');
      const main = json.symbols.find((symbol) => symbol.name === 'main');
      expect(colorRed).toMatchObject({ kind: 'constant', value: 1, file: 'main.asm' });
      expect(main).toMatchObject({ kind: 'label', address: 0x4000, file: 'main.asm' });
    });
  });

  it('exports D8 source-attributed file segments from promoted assembly spans', async () => {
    await withTempDir('azm-next-compile-d8m-source-segments-', async (dir) => {
      const fixture = await writeD8ProjectFixture(dir);

      const result = await compile(
        fixture.entry,
        {
          emitBin: false,
          emitHex: false,
          emitListing: false,
          emitD8m: true,
          sourceRoot: fixture.project,
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m') as
        | D8mArtifact
        | undefined;
      expect(d8m).toBeDefined();

      expect(d8m?.json.files['src/pacmo/pacmo.z80']?.segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            start: 0x0002,
            end: 0x0005,
            line: 4,
            lstLine: 4,
            kind: 'code',
            confidence: 'high',
          }),
          expect.objectContaining({
            start: 0x0005,
            end: 0x0006,
            line: 5,
            lstLine: 5,
            kind: 'code',
            confidence: 'high',
          }),
        ]),
      );
      expect(d8m?.json.files['src/pacmo/movement.asm']?.segments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            start: 0x0000,
            end: 0x0001,
            line: 2,
            lstLine: 2,
            kind: 'code',
            confidence: 'high',
          }),
          expect.objectContaining({
            start: 0x0001,
            end: 0x0002,
            line: 3,
            lstLine: 3,
            kind: 'code',
            confidence: 'high',
          }),
        ]),
      );
    });
  });

  it('clips D8 source-attributed file segments to the emitted binary range', async () => {
    await withTempDir('azm-next-compile-d8m-cropped-segments-', async (dir) => {
      const sourceFile = join(dir, 'main.asm');
      await writeFile(
        sourceFile,
        `.org $0100
data: .db 1
.org $0000
main: nop
.binfrom $0000
.binto $0000
`,
        'utf8',
      );

      const result = await compile(
        sourceFile,
        {
          emitBin: false,
          emitHex: false,
          emitListing: false,
          emitD8m: true,
          sourceRoot: dir,
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m') as
        | D8mArtifact
        | undefined;

      expect(d8m?.json.segments).toEqual([{ start: 0x0000, end: 0x0001 }]);
      expect(d8m?.json.files['main.asm']?.segments).toEqual([
        expect.objectContaining({
          start: 0x0000,
          end: 0x0001,
          line: 4,
          kind: 'code',
          confidence: 'high',
        }),
      ]);
    });
  });

  it('preserves d8 input paths that share a prefix with root without incorrect relative truncation', async () => {
    await withTempDir('azm-next-compile-d8m-collision-', async (dir) => {
      const sourceFile = join(dir, 'main.asm');
      await writeFile(
        sourceFile,
        `.org $0100
main:
  nop
`,
        'utf8',
      );

      const sourceRoot = join(dir, 'app');
      const collisionPath = `${sourceRoot}2/build`;
      await mkdir(collisionPath, { recursive: true });
      const result = await compile(
        sourceFile,
        {
          emitBin: false,
          emitHex: false,
          emitListing: false,
          emitD8m: true,
          sourceRoot,
          d8mInputs: {
            listing: join(collisionPath, 'game.lst'),
            hex: join(collisionPath, 'game.hex'),
            bin: join(collisionPath, 'game.bin'),
          },
        },
        { formats: defaultFormatWriters },
      );

      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m') as
        | D8mArtifact
        | undefined;
      expect(d8m).toBeDefined();
      expect(d8m?.json.generator).toMatchObject({
        inputs: {
          listing: toPosix(join(collisionPath, 'game.lst')),
          hex: toPosix(join(collisionPath, 'game.hex')),
          bin: toPosix(join(collisionPath, 'game.bin')),
        },
      } as Partial<D8mGenerator>);
    });
  });

  it('emits ASM80 artifacts when enabled', async () => {
    await withTempDir('azm-next-compile-asm80-', async (dir) => {
      const entry = join(dir, 'program.asm');
      await writeFile(entry, source, 'utf8');

      const result = await compile(
        entry,
        {
          emitBin: false,
          emitHex: false,
          emitD8m: false,
          emitListing: false,
          emitAsm80: true,
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      const asm80 = result.artifacts.find((artifact) => artifact.kind === 'asm80');
      expect(asm80).toBeDefined();
      expect(asm80!.text).toContain('AZM Next');
      expect(result.artifacts.map((artifact) => artifact.kind)).toEqual(['asm80']);
    });
  });

  it('produces deterministic artifacts across repeated compiles', async () => {
    await withTempDir('azm-next-compile-determinism-', async (dir) => {
      const entry = join(dir, 'program.asm');
      await writeFile(entry, source, 'utf8');

      const first = snapshotArtifacts(
        (await compile(entry, { emitListing: true }, { formats: defaultFormatWriters })).artifacts,
      );
      for (let i = 0; i < 5; i++) {
        const nextArtifacts = snapshotArtifacts(
          (await compile(entry, { emitListing: true }, { formats: defaultFormatWriters }))
            .artifacts,
        );
        expect(nextArtifacts).toEqual(first);
      }
    });
  });
});
