import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..');

describe('ASM80 baseline acceptance workflow', () => {
  it('exposes a single npm script for the external MON3 and TEC-1G gates', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['test:asm80:baseline']).toBe('node scripts/dev/run-asm80-baseline.mjs');
  });

  it('keeps the Tetro acceptance check opt-in and separate from the standing baseline', () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.['test:asm80:tetro']).toBe(
      'ZAX_RUN_TETRO_ACCEPTANCE=1 vitest run test/asm80/tetro_acceptance.test.ts',
    );
    expect(pkg.scripts?.['test:asm80:baseline']).not.toContain('tetro');
  });

  it('documents the opt-in baseline command with both external corpora', () => {
    const doc = readFileSync(
      join(repoRoot, 'docs', 'reference', 'testing-verification-guide.md'),
      'utf8',
    );

    expect(doc).toContain('npm run test:asm80:baseline');
    expect(doc).toContain('MON3');
    expect(doc).toContain('TEC-1G');
  });

  it('documents local path overrides for the external baseline', () => {
    const doc = readFileSync(
      join(repoRoot, 'docs', 'reference', 'testing-verification-guide.md'),
      'utf8',
    );

    expect(doc).toContain('MON3_SOURCE');
    expect(doc).toContain('TEC1G_SOFTWARE_ROOT');
    expect(doc).toContain('ASM80');
  });

  it('documents the opt-in Tetro acceptance command and source override', () => {
    const doc = readFileSync(
      join(repoRoot, 'docs', 'reference', 'testing-verification-guide.md'),
      'utf8',
    );

    expect(doc).toContain('npm run test:asm80:tetro');
    expect(doc).toContain('TETRO_SOURCE');
  });

  it('wires the baseline wrapper to the documented override variables', () => {
    const script = readFileSync(join(repoRoot, 'scripts', 'dev', 'run-asm80-baseline.mjs'), 'utf8');

    expect(script).toContain('process.env.MON3_SOURCE');
    expect(script).toContain('process.env.TEC1G_SOFTWARE_ROOT');
    expect(script).toContain('process.env.ASM80');
  });

  it('wires the MON3 acceptance test to the documented source override', () => {
    const testSource = readFileSync(
      join(repoRoot, 'test', 'asm80', 'mon3_acceptance.test.ts'),
      'utf8',
    );

    expect(testSource).toContain('process.env.MON3_SOURCE');
  });

  it('keeps TEC-1G mismatch diagnostics source and byte focused', () => {
    const script = readFileSync(
      join(repoRoot, 'scripts', 'dev', 'compare-tec1g-corpus.mjs'),
      'utf8',
    );

    expect(script).toContain('lengthDelta=');
    expect(script).toContain('zaxWindow=');
    expect(script).toContain('asm80Window=');
  });
});
