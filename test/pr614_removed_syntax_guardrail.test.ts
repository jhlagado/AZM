import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scanForbiddenRemovedSyntax } from '../scripts/ci/removed-syntax-guardrail.js';

describe('PR614 removed syntax guardrail', () => {
  it('passes for repository assembly sources and assembly markdown fences', () => {
    const { violations } = scanForbiddenRemovedSyntax();
    expect(violations).toEqual([]);
  });

  it('rejects a bare data marker in ASM source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-'));
    const fixture = join(dir, 'new-removed-form.asm');
    await writeFile(fixture, 'section data vars at $1000\n  data\n  x: byte\nend\n', 'utf8');

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [fixture] });
    expect(violations.map((v) => v.ruleId)).toEqual([
      'removed-active-counter-section',
      'bare-data-marker',
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('rejects top-level const declarations in ASM sources', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-'));
    const fixture = join(dir, 'new-const-form.asm');
    await writeFile(fixture, 'const VALUE = 1\nmain:\n  ret\n', 'utf8');

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [fixture] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe('top-level-const-decl');

    await rm(dir, { recursive: true, force: true });
  });

  it('rejects removed source file extensions in scanned roots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-ext-'));
    const examples = join(dir, 'examples');
    await mkdir(examples);
    await writeFile(join(examples, 'removed.azm'), 'main:\n  ret\n', 'utf8');

    const { violations } = scanForbiddenRemovedSyntax({
      repoRoot: dir,
      roots: ['examples'],
    });
    expect(violations).toEqual([
      expect.objectContaining({
        file: 'examples/removed.azm',
        ruleId: 'removed-source-extension',
      }),
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('flags forbidden removed forms inside markdown code fences', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-md-'));
    const md = join(dir, 'removed-example.md');
    await writeFile(
      md,
      ['# Notes', '', '```asm', 'section code at $0100', 'func main()', '  ret', 'end', '```', ''].join('\n'),
      'utf8',
    );

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [md] });
    expect(violations.map((v) => v.ruleId)).toEqual([
      'removed-active-counter-section',
      'removed-function-decl',
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('flags top-level const declarations inside markdown code fences', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-md-'));
    const md = join(dir, 'const-example.md');
    await writeFile(
      md,
      ['# Notes', '', '```asm', 'const VALUE = 1', 'main:', '  ret', '```', ''].join('\n'),
      'utf8',
    );

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [md] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe('top-level-const-decl');

    await rm(dir, { recursive: true, force: true });
  });

  it('ignores prose-only mentions in markdown files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-md-prose-'));
    const md = join(dir, 'prose-only.md');
    await writeFile(
      md,
      [
        '# Migration note',
        '',
        'The old `globals ... end` and bare `data` marker forms are removed.',
        'Use labels plus .db/.dw/.ds directives instead.',
        '',
      ].join('\n'),
      'utf8',
    );

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [md] });
    expect(violations).toEqual([]);

    await rm(dir, { recursive: true, force: true });
  });

  it.each([
    ['func main()', 'removed-function-decl'],
    ['export func main()', 'removed-function-decl'],
    ['module gfx', 'removed-module-import'],
    ['import video', 'removed-module-import'],
    ['var Screen byte', 'removed-var-decl'],
    ['globals', 'removed-globals-block'],
  ])('rejects %s in ASM source', async (source, ruleId) => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-'));
    const fixture = join(dir, 'removed-form.asm');
    await writeFile(fixture, `${source}\n`, 'utf8');

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [fixture] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe(ruleId);

    await rm(dir, { recursive: true, force: true });
  });
});
