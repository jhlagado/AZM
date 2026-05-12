import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  FIXTURE_ALLOWLIST,
  scanForbiddenLegacySyntax,
} from '../scripts/ci/legacy-syntax-guardrail.js';

describe('PR614 legacy syntax guardrail', () => {
  it('passes for repository zax sources under the current fixture allowlist', () => {
    const { violations } = scanForbiddenLegacySyntax();
    expect(violations).toEqual([]);
  });

  it('rejects a new bare data marker outside the allowlist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zax-pr614-'));
    const fixture = join(dir, 'new-legacy-form.zax');
    await writeFile(fixture, 'section data vars at $1000\n  data\n  x: byte\nend\n', 'utf8');

    const { violations } = scanForbiddenLegacySyntax({ filePaths: [fixture] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe('bare-data-marker');

    await rm(dir, { recursive: true, force: true });
  });

  it('keeps explicit fixture allowlist entries exempt', () => {
    const knownLegacyFixture = 'test/fixtures/pr170_block_termination_recovery_matrix.zax';
    expect(FIXTURE_ALLOWLIST.has(knownLegacyFixture)).toBe(true);

    const { violations } = scanForbiddenLegacySyntax({ filePaths: [knownLegacyFixture] });
    expect(violations).toEqual([]);
  });

  it('flags forbidden legacy forms inside markdown code fences', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zax-pr614-md-'));
    const md = join(dir, 'legacy-example.md');
    await writeFile(
      md,
      ['# Notes', '', '```zax', 'section code at $0100', 'func main()', '  ret', 'end', '```', ''].join('\n'),
      'utf8',
    );

    const { violations } = scanForbiddenLegacySyntax({ filePaths: [md] });
    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe('legacy-active-counter-section');

    await rm(dir, { recursive: true, force: true });
  });

  it('ignores prose-only mentions in markdown files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zax-pr614-md-prose-'));
    const md = join(dir, 'prose-only.md');
    await writeFile(
      md,
      [
        '# Migration note',
        '',
        'The old `globals ... end` and bare `data` marker forms are removed.',
        'Use named sections instead.',
        '',
      ].join('\n'),
      'utf8',
    );

    const { violations } = scanForbiddenLegacySyntax({ filePaths: [md] });
    expect(violations).toEqual([]);

    await rm(dir, { recursive: true, force: true });
  });
});
