import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from './helpers/cli/build.js';
import { writeD8ProjectFixture } from './helpers/d8_project_fixture.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
  bin: Record<string, string>;
  exports: Record<string, unknown> & { './cli': Record<string, unknown> };
};

async function runPackageScript(source: string, args: string[] = []): Promise<unknown> {
  const { stdout } = await execFileAsync(
    'node',
    ['--input-type=module', '--eval', source, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  return JSON.parse(stdout.trim()) as unknown;
}

describe('public package API surface', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('exposes tooling load/analyze through the stable subpath with preloaded entry text', async () => {
    const entryFile = resolve(repoRoot, 'test', 'fixtures', 'virtual_public_api_entry.asm');
    const source = `
      import { analyzeProgram, loadProgram } from '@jhlagado/azm/tooling';

      const result = await loadProgram({
        entryFile: process.argv[1],
        preloadedText: 'main:\\n    call helper\\n    ret\\nhelper:\\n    ret\\n',
      });
      const analysis = result.loadedProgram
        ? analyzeProgram(result.loadedProgram)
        : { diagnostics: [] };

      console.log(JSON.stringify({
        loadDiagnostics: result.diagnostics,
        analyzed: Boolean(result.loadedProgram && analysis.env),
        analysisDiagnostics: analysis.diagnostics,
        programKind: result.loadedProgram?.program.kind ?? null,
        fileCount: result.loadedProgram?.program.files.length ?? 0,
      }));
    `;

    const output = (await runPackageScript(source, [entryFile])) as {
      loadDiagnostics: unknown[];
      analyzed: boolean;
      analysisDiagnostics: unknown[];
      programKind: string | null;
      fileCount: number;
    };

    expect(output.loadDiagnostics).toEqual([]);
    expect(output.analysisDiagnostics).toEqual([]);
    expect(output.analyzed).toBe(true);
    expect(output.programKind).toBe('Program');
    expect(output.fileCount).toBe(1);
  });

  it('exposes compile through the stable compile subpath', async () => {
    const entryFile = resolve(repoRoot, 'test', 'fixtures', 'virtual_public_api_compile.asm');
    const source = `
      import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

      const result = await compile(
        process.argv[1],
        { emitListing: false, emitAsm80: false },
        { formats: defaultFormatWriters },
      );

      console.log(JSON.stringify({
        diagnostics: result.diagnostics,
        artifactKinds: result.artifacts.map((artifact) => artifact.kind),
      }));
    `;

    const output = (await runPackageScript(source, [entryFile])) as {
      diagnostics: unknown[];
      artifactKinds: string[];
    };

    expect(output.diagnostics).toEqual([]);
    expect(output.artifactKinds).toEqual(['bin', 'hex', 'd8m']);
  });

  it('exposes typed D8 metadata for Debug80 through the compile subpath', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-public-d8-'));
    const fixture = await writeD8ProjectFixture(work);

    const source = `
      import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';

      /** @type {import('@jhlagado/azm/compile').D8mJson | undefined} */
      let d8mJson;
      const result = await compile(
        process.argv[1],
        {
          sourceRoot: process.argv[2],
          d8mInputs: {
            listing: process.argv[3],
            hex: process.argv[4],
            bin: process.argv[5],
          },
          emitListing: true,
          emitAsm80: false,
        },
        { formats: defaultFormatWriters },
      );
      const d8m = result.artifacts.find((artifact) => artifact.kind === 'd8m');
      d8mJson = d8m?.json;

      console.log(JSON.stringify({
        diagnostics: result.diagnostics,
        generator: d8mJson?.generator,
        fileKeys: Object.keys(d8mJson?.files ?? {}).sort(),
        colorRed: d8mJson?.symbols.find((symbol) => symbol.name === 'ColorRed'),
        main: d8mJson?.symbols.find((symbol) => symbol.name === 'main'),
      }));
    `;

    const output = (await runPackageScript(source, [
      fixture.entry,
      fixture.project,
      fixture.listing,
      fixture.hex,
      fixture.bin,
    ])) as {
      diagnostics: unknown[];
      generator?: {
        name?: string;
        tool?: string;
        version?: string;
        inputs?: Record<string, string>;
      };
      fileKeys: string[];
      colorRed?: { kind: string; value?: number; address?: number; file?: string };
      main?: { kind: string; address?: number; file?: string };
    };

    expect(output.diagnostics).toEqual([]);
    expect(output.generator).toMatchObject({
      name: 'azm',
      tool: 'azm',
      version: packageJson.version,
      inputs: {
        entry: 'src/pacmo/pacmo.z80',
        listing: 'build/pacmo.lst',
        hex: 'build/pacmo.hex',
        bin: 'build/pacmo.bin',
      },
    });
    expect(output.fileKeys).toEqual([
      'src/pacmo/movement.asm',
      'src/pacmo/pacmo.z80',
      'src/shared/constants.asm',
    ]);
    expect(output.colorRed).toMatchObject({
      kind: 'constant',
      value: 1,
      file: 'src/shared/constants.asm',
    });
    expect(output.colorRed).not.toHaveProperty('address');
    expect(output.main).toMatchObject({
      kind: 'label',
      address: 2,
      file: 'src/pacmo/pacmo.z80',
    });

    await rm(work, { recursive: true, force: true });
  });

  it('re-exports the stable surface from the package root', async () => {
    const entryFile = resolve(repoRoot, 'test', 'fixtures', 'virtual_public_api_root.asm');
    const source = `
      import { DiagnosticIds, analyzeProgram, loadProgram } from '@jhlagado/azm';

      const result = await loadProgram({
        entryFile: process.argv[1],
        preloadedText: 'main:\\n    ret\\n',
      });
      const analysis = result.loadedProgram ? analyzeProgram(result.loadedProgram) : { diagnostics: [] };

      console.log(JSON.stringify({
        hasProgram: Boolean(result.loadedProgram),
        diagnostics: [...result.diagnostics, ...analysis.diagnostics],
        semanticErrorId: DiagnosticIds.SemanticsError,
      }));
    `;

    const output = (await runPackageScript(source, [entryFile])) as {
      hasProgram: boolean;
      diagnostics: unknown[];
      semanticErrorId: string;
    };

    expect(output.hasProgram).toBe(true);
    expect(output.diagnostics).toEqual([]);
    expect(output.semanticErrorId).toBe('AZM400');
  });

  it('publishes only AZM-branded stable package subpaths', () => {
    expect(packageJson.name).toBe('@jhlagado/azm');
    expect(packageJson.bin).toEqual({ azm: 'dist/src/cli.js' });
    expect(Object.keys(packageJson.exports).sort()).toEqual([
      '.',
      './cli',
      './compile',
      './package.json',
      './tooling',
    ]);

    const serializedExports = JSON.stringify(packageJson.exports);
    expect(serializedExports).not.toContain('@jhlagado/zax');
    expect(serializedExports).not.toContain('zax');
    expect(packageJson.exports['./cli']).not.toHaveProperty('require');
  });
});
