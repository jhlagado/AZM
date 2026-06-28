import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from '../helpers/cli/build.js';
import { exists, runCli } from '../helpers/cli/index.js';

async function withRegisterContractsFixture<T>(
  prefix: string,
  callback: (fixture: { work: string; entry: string }) => Promise<T>,
): Promise<T> {
  const work = await mkdtemp(join(tmpdir(), prefix));
  const entry = join(work, 'main.z80');
  try {
    return await callback({ work, entry });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function writeEntry(entry: string, lines: string[]): Promise<void> {
  await writeFile(entry, lines.join('\n'), 'utf8');
}

const artifactlessArgs = ['--nobin', '--nohex', '--nod8m'];
const maskRoutineOutContract = ['; Mask prose.', ';! out A; clobbers C', 'MASK:'].join('\n');
const maskRoutineOutOnlyContract = ['; Mask prose.', ';! out A', 'MASK:'].join('\n');

function maskRoutineSource(startBody: string[], existingContract = false): string[] {
  return [
    'START:',
    '    ld a,3',
    '    call MASK',
    ...startBody,
    '    ret',
    '',
    '; Mask prose.',
    ...(existingContract ? [';! out A; clobbers C'] : []),
    'MASK:',
    '    ld c,a',
    '    ld a,$80',
    '    ret',
    '.end',
  ];
}

describe('register-contracts cli', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('does not write a register-contracts report unless explicitly requested', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-default-', async ({ work, entry }) => {
      await writeEntry(entry, ['START:', '    nop', '    ret', '.end']);

      const res = await runCli([...artifactlessArgs, '--register-contracts', 'audit', entry]);
      expect(res.code).toBe(0);

      expect(res.stdout.trim()).toBe('');
      expect(await exists(join(work, 'main.regcontracts.txt'))).toBe(false);
    });
  }, 20_000);

  it('writes a register-contracts report artifact in audit mode', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-', async ({ work, entry }) => {
      await writeEntry(entry, ['START:', '    nop', '    ret', '.end']);

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--emit-register-report',
        entry,
      ]);
      expect(res.code).toBe(0);

      const reportPath = join(work, 'main.regcontracts.txt');
      expect(res.stdout.trim()).toBe(reportPath);
      expect(await exists(reportPath)).toBe(true);
      expect(await exists(join(work, 'main.hex'))).toBe(false);
      await expect(readFile(reportPath, 'utf8')).resolves.toContain(
        'AZM Register Contracts Report',
      );
    });
  }, 20_000);

  it('writes a JSON register-contracts report artifact when requested', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-json-', async ({ work, entry }) => {
      await writeEntry(entry, [
        'START:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        'HELPER:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ]);

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'warn',
        '--reg-report',
        '--reg-report-format',
        'json',
        entry,
      ]);
      expect(res.code).toBe(0);

      const reportPath = join(work, 'main.regcontracts.json');
      expect(res.stdout.trim()).toBe(reportPath);
      const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
        format?: string;
        findings?: Array<{ kind?: string; remediation?: { category?: string } }>;
      };
      expect(report.format).toBe('azm-register-contracts-report');
      expect(report.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'output_candidate',
            remediation: expect.objectContaining({ category: 'review_output_contract' }),
          }),
        ]),
      );
    });
  }, 20_000);

  it('writes markdown register-contract inference artifacts', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-infer-md-', async ({ work, entry }) => {
      await writeEntry(entry, [
        'START:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        'HELPER:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ]);

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--reg-infer-format',
        'markdown',
        entry,
      ]);

      const inferencePath = join(work, 'main.regcontracts.inference.md');
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(inferencePath);
      await expect(readFile(inferencePath, 'utf8')).resolves.toContain(
        '# AZM Register Contracts Inference',
      );
    });
  }, 20_000);

  it('fails ratchet mode when a JSON baseline misses new findings', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-ratchet-', async ({ work, entry }) => {
      await writeEntry(entry, [
        'START:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        'HELPER:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ]);
      const baseline = join(work, 'baseline.regcontracts.json');
      await writeFile(
        baseline,
        JSON.stringify(
          {
            format: 'azm-register-contracts-report',
            version: 1,
            entryFile: entry,
            mode: 'audit',
            summaries: [],
            findings: [],
            unknownCalls: [],
          },
          null,
          2,
        ),
        'utf8',
      );

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--reg-baseline',
        baseline,
        '--reg-ratchet',
        entry,
      ]);

      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Register contract ratchet found new');
      const report = JSON.parse(await readFile(join(work, 'main.regcontracts.json'), 'utf8')) as {
        ratchet?: { newFindings?: unknown[] };
      };
      expect(report.ratchet?.newFindings?.length).toBeGreaterThan(0);
    });
  }, 20_000);

  it('keeps baseline reports as JSON even if report format text appears later', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-baseline-json-', async ({ work, entry }) => {
      await writeEntry(entry, ['START:', '    nop', '    ret', '.end']);
      const baseline = join(work, 'baseline.regcontracts.json');
      await writeFile(
        baseline,
        JSON.stringify(
          {
            format: 'azm-register-contracts-report',
            version: 1,
            entryFile: entry,
            mode: 'audit',
            summaries: [],
            findings: [],
            unknownCalls: [],
          },
          null,
          2,
        ),
        'utf8',
      );

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--reg-baseline',
        baseline,
        '--reg-report-format',
        'text',
        entry,
      ]);

      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(join(work, 'main.regcontracts.json'));
      expect(await exists(join(work, 'main.regcontracts.txt'))).toBe(false);
      expect(await exists(join(work, 'main.regcontracts.json'))).toBe(true);
    });
  }, 20_000);

  it('keeps JSON register-contracts reports when assembly fails later', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-json-asm-error-', async ({ work, entry }) => {
      await writeEntry(entry, [
        'START:',
        '    call HELPER',
        '    ret',
        'HELPER:',
        '    ld a,UNKNOWN_SYMBOL',
        '    ret',
        '.end',
      ]);

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--reg-report-format',
        'json',
        entry,
      ]);
      expect(res.code).toBe(1);

      const reportPath = join(work, 'main.regcontracts.json');
      expect(await exists(reportPath)).toBe(true);
      const report = JSON.parse(await readFile(reportPath, 'utf8')) as { format?: string };
      expect(report.format).toBe('azm-register-contracts-report');
    });
  }, 20_000);

  it('does not rewrite source contracts when normal assembly errors fail the compile', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-no-fix-on-error-', async ({ entry }) => {
      await writeEntry(entry, [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    ld e,a',
        '    ret',
        '',
        '; Mask prose.',
        'MASK:',
        '    ld c,a',
        '    ld a,UNKNOWN_SYMBOL',
        '    ret',
        '.end',
      ]);

      const before = await readFile(entry, 'utf8');
      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--contracts',
        entry,
      ]);

      expect(res.code).toBe(1);
      await expect(readFile(entry, 'utf8')).resolves.toBe(before);
    });
  }, 20_000);

  it('does not add register-contract diagnostics on pre-existing non-contract errors without a report', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-error-stability-', async ({ entry }) => {
      await writeEntry(entry, [
        'START:',
        '    call HELPER',
        '    ret',
        'HELPER:',
        '    ld a,UNKNOWN_SYMBOL',
        '    ret',
        '.end',
      ]);

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'error',
        entry,
      ]);

      expect(res.code).toBe(1);
      expect(res.stderr).toContain('[AZMN_SYMBOL]');
      expect(res.stderr).not.toContain('[AZMN_REGISTER_CONTRACTS]');
    });
  }, 20_000);

  it('accepts short register-contracts switches', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-short-', async ({ work, entry }) => {
      await writeEntry(entry, ['START:', '    nop', '    ret', '.end']);

      const res = await runCli([
        ...artifactlessArgs,
        '--rc=audit',
        '--reg-report',
        '--reg-profile',
        'mon3',
        entry,
      ]);
      expect(res.code).toBe(0);

      const reportPath = join(work, 'main.regcontracts.txt');
      expect(res.stdout.trim()).toBe(reportPath);
      await expect(readFile(reportPath, 'utf8')).resolves.toContain(
        'AZM Register Contracts Report',
      );
    });
  }, 20_000);

  it('loads bare register contract files with --interface', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-interface-',
      async ({ work, entry }) => {
        const iface = join(work, 'lib.asmi');
        await writeEntry(entry, [
          'START:',
          '    ld de,$1000',
          '    call LIB_CLOBBER_DE',
          '    inc de',
          '    ret',
          'LIB_CLOBBER_DE:',
          '    ret',
          '.end',
        ]);
        await writeFile(iface, ['extern LIB_CLOBBER_DE', 'clobbers  DE', 'end'].join('\n'), 'utf8');

        const res = await runCli([
          ...artifactlessArgs,
          '--rc=error',
          '--reg-report',
          '--interface',
          iface,
          entry,
        ]);

        expect(res.code).toBe(1);
        expect(res.stderr).toContain('CALL LIB_CLOBBER_DE may modify D,E');
      },
    );
  }, 20_000);

  it('rejects malformed --accept-out values', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-accept-bad-', async ({ entry }) => {
      await writeEntry(entry, ['START:', '    ret', '.end']);

      const res = await runCli([
        ...artifactlessArgs,
        '--rc=audit',
        '--contracts',
        '--accept-out',
        'MASK:Q',
        entry,
      ]);

      expect(res.code).toBe(2);
      expect(res.stderr).toContain('Invalid --accept-out value "MASK:Q"');
    });
  }, 20_000);

  it('rejects malformed --accept-out even without source rewriting', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-accept-bad-audit-',
      async ({ entry }) => {
        await writeEntry(entry, ['START:', '    ret', '.end']);

        const res = await runCli([
          ...artifactlessArgs,
          '--rc=audit',
          '--reg-report',
          '--accept-out',
          'MASK:A,',
          entry,
        ]);

        expect(res.code).toBe(2);
        expect(res.stderr).toContain('Invalid --accept-out value "MASK:A,"');
      },
    );
  }, 20_000);

  it('rejects malformed --accept-out when register-contracts is otherwise off', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-accept-bad-off-',
      async ({ entry }) => {
        await writeEntry(entry, ['START:', '    ret', '.end']);

        const res = await runCli([...artifactlessArgs, '--accept-out', 'MASK:A,', entry]);

        expect(res.code).toBe(2);
        expect(res.stderr).toContain('Invalid --accept-out value "MASK:A,"');
      },
    );
  }, 20_000);

  it('rejects malformed register-contracts interface contracts', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-interface-bad-',
      async ({ work, entry }) => {
        const iface = join(work, 'bad.asmi');
        await writeEntry(entry, ['START:', '    ret', '.end']);
        await writeFile(iface, ['extern MON', 'clobbers Q', 'end'].join('\n'), 'utf8');

        const res = await runCli([
          ...artifactlessArgs,
          '--rc=audit',
          '--reg-report',
          '--interface',
          iface,
          entry,
        ]);

        expect(res.code).toBe(2);
        expect(res.stderr).toContain('invalid register contracts interface line "clobbers Q"');
      },
    );
  }, 20_000);

  it('rejects malformed register-contracts interface contracts when register-contracts is otherwise off', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-interface-bad-off-',
      async ({ work, entry }) => {
        const iface = join(work, 'bad.asmi');
        await writeEntry(entry, ['START:', '    ret', '.end']);
        await writeFile(iface, ['extern MON', 'clobbers A, Q', 'end'].join('\n'), 'utf8');

        const res = await runCli([...artifactlessArgs, '--interface', iface, entry]);

        expect(res.code).toBe(2);
        expect(res.stderr).toContain('invalid register contracts interface line "clobbers A, Q"');
      },
    );
  }, 20_000);

  it('rejects register-contracts interfaces without the .asmi extension', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-interface-ext-',
      async ({ work, entry }) => {
        const iface = join(work, 'bad.asm');
        await writeEntry(entry, ['START:', '    ret', '.end']);
        await writeFile(iface, ['extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

        const res = await runCli([...artifactlessArgs, '--interface', iface, entry]);

        expect(res.code).toBe(1);
        expect(res.stderr).toContain(
          'Register contracts interface files must use the .asmi extension',
        );
      },
    );
  }, 20_000);

  it('rejects comments in register-contracts interface files', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-interface-comment-',
      async ({ work, entry }) => {
        const iface = join(work, 'bad.asmi');
        await writeEntry(entry, ['START:', '    ret', '.end']);
        await writeFile(iface, ['; comment', 'extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

        const res = await runCli([...artifactlessArgs, '--interface', iface, entry]);

        expect(res.code).toBe(2);
        expect(res.stderr).toContain('.asmi files do not permit comments');
      },
    );
  }, 20_000);

  it('writes a register-contracts interface artifact when requested', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcontracts-cli-interface-'));
    const entry = join(work, 'main.z80');
    await writeFile(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--register-contracts',
      'audit',
      '--emit-register-interface',
      entry,
    ]);
    expect(res.code).toBe(0);

    const interfacePath = join(work, 'main.asmi');
    expect(res.stdout.trim()).toBe(interfacePath);
    expect(await exists(interfacePath)).toBe(true);
    expect(await exists(join(work, 'main.hex'))).toBe(false);
    expect(await exists(join(work, 'main.bin'))).toBe(false);
    expect(await exists(join(work, 'main.d8.json'))).toBe(false);
    await expect(readFile(interfacePath, 'utf8')).resolves.toContain('extern HELPER');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('annotates source contracts in place and replaces stale compact blocks', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcontracts-cli-annotate-'));
    const entry = join(work, 'main.z80');
    const source = [
      'START:',
      '    call HELPER',
      '    ret',
      'SKIP:',
      '    ret',
      '',
      '; Helper prose stays untouched.',
      ';! clobbers A',
      'HELPER:',
      '    ld hl,$1000',
      '    ret',
      '',
      '; Empty prose stays untouched.',
      ';! clobbers BC',
      'EMPTY:',
      '.end',
    ].join('\n');
    await writeFile(entry, source, 'utf8');

    const first = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--register-contracts',
      'audit',
      '--annotate-register-contracts',
      entry,
    ]);
    expect(first.code).toBe(0);
    expect(first.stdout.trim()).toBe(entry);

    const annotated = await readFile(entry, 'utf8');
    expect(annotated).toContain(
      ['; Helper prose stays untouched.', ';! out HL; clobbers A', 'HELPER:'].join('\n'),
    );
    expect(annotated).not.toContain(';! out HL\nSTART:');
    expect(annotated).not.toContain(';! out HL\nSKIP:');
    expect(annotated).toContain(
      ['; Empty prose stays untouched.', ';! clobbers BC', 'EMPTY:'].join('\n'),
    );

    const second = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--register-contracts',
      'audit',
      '--annotate-register-contracts',
      entry,
    ]);
    expect(second.code).toBe(0);
    await expect(readFile(entry, 'utf8')).resolves.toContain(
      ['; Helper prose stays untouched.', ';! out HL', 'HELPER:'].join('\n'),
    );

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('accepts caller-output candidates while annotating source contracts', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-accept-', async ({ entry }) => {
      await writeEntry(entry, maskRoutineSource(['    ld d,a']));

      const res = await runCli([
        ...artifactlessArgs,
        '--rc',
        'audit',
        '--contracts',
        '--accept-out',
        'MASK:A',
        entry,
      ]);
      expect(res.code).toBe(0);

      const annotated = await readFile(entry, 'utf8');
      expect(annotated).toContain(maskRoutineOutContract);
      expect(annotated).not.toContain('; maybe-out A');
    });
  }, 20_000);

  it('inserts expects-out hints for high-confidence caller-output candidates with --fix', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-fix-', async ({ entry }) => {
      await writeEntry(entry, maskRoutineSource(['    nop', '    ld d,a']));

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--fix',
        entry,
      ]);
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(entry);

      const fixed = await readFile(entry, 'utf8');
      expect(fixed).toContain(
        [
          'START:',
          '    ld a,3',
          '    ; expects out A',
          '    call MASK',
          '    nop',
          '    ld d,a',
        ].join('\n'),
      );
      expect(fixed).not.toContain('; maybe-out A');
    });
  }, 20_000);

  it('keeps fix mode useful when stale source contracts already suppress the audit candidate', async () => {
    await withRegisterContractsFixture(
      'azm-regcontracts-cli-fix-stale-contract-',
      async ({ entry }) => {
        await writeEntry(entry, maskRoutineSource(['    ld d,a'], true));

        const res = await runCli([...artifactlessArgs, '--rc', 'audit', '--fix', entry]);
        expect(res.code).toBe(0);

        const fixed = await readFile(entry, 'utf8');
        expect(fixed).toContain(
          ['START:', '    ld a,3', '    ; expects out A', '    call MASK', '    ld d,a'].join('\n'),
        );
        expect(fixed).toContain(maskRoutineOutOnlyContract);
      },
    );
  }, 20_000);

  it('inserts expects-out hints for control-flow-reachable continuation reads with --fix', async () => {
    await withRegisterContractsFixture('azm-regcontracts-cli-fix-cfg-', async ({ entry }) => {
      await writeEntry(
        entry,
        maskRoutineSource(['    jr z,.done', '.use_mask:', '    ld d,a', '.done:']),
      );

      const res = await runCli([
        ...artifactlessArgs,
        '--register-contracts',
        'audit',
        '--fix',
        entry,
      ]);
      expect(res.code).toBe(0);

      const fixed = await readFile(entry, 'utf8');
      expect(fixed).toContain(
        ['START:', '    ld a,3', '    ; expects out A', '    call MASK', '    jr z,.done'].join(
          '\n',
        ),
      );
      expect(fixed).not.toContain('; maybe-out A');
    });
  }, 20_000);
});
