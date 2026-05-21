import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { scanForbiddenRemovedSyntax } from '../scripts/ci/removed-syntax-guardrail.js';

const FORBIDDEN_SOURCE_EXTENSIONS = ['.azm', '.azmi', '.zac', '.zax'];

async function withTempScanFile<T>(
  prefix: string,
  fileName: string,
  text: string,
  fn: (path: string) => T | Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    const path = join(dir, fileName);
    await writeFile(path, text, 'utf8');
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function expectSingleRuleForSource(source: string, ruleId: string): Promise<void> {
  await withTempScanFile('azm-pr614-', 'removed-form.asm', `${source}\n`, (fixture) => {
    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [fixture] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe(ruleId);
  });
}

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
    await expectSingleRuleForSource('const VALUE = 1\nmain:\n  ret', 'top-level-const-decl');
  });

  it('rejects single-line type aliases in ASM sources', async () => {
    await expectSingleRuleForSource('.type Pair byte[2]', 'single-line-type-alias');
  });

  it('rejects operand-level address-of syntax in ASM sources', async () => {
    await expectSingleRuleForSource(
      ['main:', '  ld hl,@target', 'target:', '  ret'].join('\n'),
      'operand-address-of',
    );
  });

  it('rejects removed source file extensions in scanned roots', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-ext-'));
    const examples = join(dir, 'examples');
    await mkdir(examples);
    for (const ext of FORBIDDEN_SOURCE_EXTENSIONS) {
      await writeFile(join(examples, `removed${ext}`), 'main:\n  ret\n', 'utf8');
    }

    const { violations } = scanForbiddenRemovedSyntax({
      repoRoot: dir,
      roots: ['examples'],
    });
    expect(violations.map((v) => v.file).sort()).toEqual(
      FORBIDDEN_SOURCE_EXTENSIONS.map((ext) => `examples/removed${ext}`).sort(),
    );
    expect(violations.every((v) => v.ruleId === 'removed-source-extension')).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  it('flags forbidden removed forms inside markdown code fences', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-md-'));
    const md = join(dir, 'removed-example.md');
    await writeFile(
      md,
      [
        '# Notes',
        '',
        '```asm',
        'section code at $0100',
        'func main()',
        '  ret',
        'end',
        '```',
        '',
      ].join('\n'),
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
    await withTempScanFile(
      'azm-pr614-md-',
      'const-example.md',
      ['# Notes', '', '```asm', 'const VALUE = 1', 'main:', '  ret', '```', ''].join('\n'),
      (md) => {
        const { violations } = scanForbiddenRemovedSyntax({ filePaths: [md] });
        expect(violations).toHaveLength(1);
        expect(violations[0]?.ruleId).toBe('top-level-const-decl');
      },
    );
  });

  it('rejects removed register-care comment forms in ASM source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-regcare-'));
    const fixture = join(dir, 'removed-regcare.asm');
    await writeFile(
      fixture,
      ['; ========================== AZM', ';! @in {DE}', 'HELPER:', '  ret', ''].join('\n'),
      'utf8',
    );

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [fixture] });
    expect(violations.map((v) => v.ruleId)).toEqual([
      'removed-register-care-divider-block',
      'removed-register-care-at-comment',
    ]);

    await rm(dir, { recursive: true, force: true });
  });

  it('rejects removed register-care comment forms in markdown assembly fences', async () => {
    await withTempScanFile(
      'azm-pr614-regcare-md-',
      'removed-regcare.md',
      ['# Notes', '', '```asm', ';! @out {HL}', 'HELPER:', '  ret', '```', ''].join('\n'),
      (md) => {
        const { violations } = scanForbiddenRemovedSyntax({ filePaths: [md] });
        expect(violations).toHaveLength(1);
        expect(violations[0]?.ruleId).toBe('removed-register-care-at-comment');
      },
    );
  });

  it('rejects comments in .asmi interface files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'azm-pr614-asmi-'));
    const iface = join(dir, 'lib.asmi');
    await writeFile(
      iface,
      ['; MON3 interface', 'extern MON_PRINT_CHAR', 'in A', 'clobbers A', 'end', ''].join('\n'),
      'utf8',
    );

    const { violations } = scanForbiddenRemovedSyntax({ filePaths: [iface] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe('asmi-comment-line');

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
    ['data Screen byte[768]', 'removed-data-decl'],
    ['var Screen byte', 'removed-var-decl'],
    ['let temp byte', 'removed-let-decl'],
    ['local counter byte', 'removed-local-arg-decl'],
    ['arg value byte', 'removed-local-arg-decl'],
    ['argument value byte', 'removed-local-arg-decl'],
    ['extern func MON_PRINT_CHAR(A)', 'removed-extern-func'],
    ['A := B', 'removed-typed-assignment'],
    ['globals', 'removed-globals-block'],
  ])('rejects %s in ASM source', async (source, ruleId) => {
    await expectSingleRuleForSource(source, ruleId);
  });
});
