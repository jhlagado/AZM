import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from '../helpers/cli/build.js';
import { exists, runCli } from '../helpers/cli/index.js';

async function withRegisterCareFixture<T>(
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

const artifactlessArgs = ['--nobin', '--nohex', '--nod8m', '--nolist'];
const maskRoutineOutContract = [
  '; Mask prose.',
  ';!      out       A',
  ';!      clobbers  C',
  'MASK:',
].join('\n');

function maskRoutineSource(startBody: string[], existingContract = false): string[] {
  return [
    'START:',
    '    ld a,3',
    '    call MASK',
    ...startBody,
    '    ret',
    '',
    '; Mask prose.',
    ...(existingContract ? [';!      out       A', ';!      clobbers  C'] : []),
    'MASK:',
    '    ld c,a',
    '    ld a,$80',
    '    ret',
    '.end',
  ];
}

describe('register-care cli', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('writes a register-care report artifact in audit mode', async () => {
    await withRegisterCareFixture('azm-regcare-cli-', async ({ work, entry }) => {
      await writeEntry(entry, ['START:', '    nop', '    ret', '.end']);

      const res = await runCli([
        ...artifactlessArgs,
        '--register-care',
        'audit',
        '--emit-register-report',
        entry,
      ]);
      expect(res.code).toBe(0);

      const reportPath = join(work, 'main.regcare.txt');
      expect(res.stdout.trim()).toBe(reportPath);
      expect(await exists(reportPath)).toBe(true);
      expect(await exists(join(work, 'main.hex'))).toBe(false);
      await expect(readFile(reportPath, 'utf8')).resolves.toContain('AZM Register-Care Report');
    });
  }, 20_000);

  it('accepts short register-care switches', async () => {
    await withRegisterCareFixture('azm-regcare-cli-short-', async ({ work, entry }) => {
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

      const reportPath = join(work, 'main.regcare.txt');
      expect(res.stdout.trim()).toBe(reportPath);
      await expect(readFile(reportPath, 'utf8')).resolves.toContain('AZM Register-Care Report');
    });
  }, 20_000);

  it('loads bare register-care contract files with --interface', async () => {
    await withRegisterCareFixture('azm-regcare-cli-interface-', async ({ work, entry }) => {
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
    });
  }, 20_000);

  it('rejects malformed --accept-out values', async () => {
    await withRegisterCareFixture('azm-regcare-cli-accept-bad-', async ({ entry }) => {
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
    await withRegisterCareFixture('azm-regcare-cli-accept-bad-audit-', async ({ entry }) => {
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
    });
  }, 20_000);

  it('rejects malformed --accept-out when register-care is otherwise off', async () => {
    await withRegisterCareFixture('azm-regcare-cli-accept-bad-off-', async ({ entry }) => {
      await writeEntry(entry, ['START:', '    ret', '.end']);

      const res = await runCli([...artifactlessArgs, '--accept-out', 'MASK:A,', entry]);

      expect(res.code).toBe(2);
      expect(res.stderr).toContain('Invalid --accept-out value "MASK:A,"');
    });
  }, 20_000);

  it('rejects malformed register-care interface contracts', async () => {
    await withRegisterCareFixture('azm-regcare-cli-interface-bad-', async ({ work, entry }) => {
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
      expect(res.stderr).toContain('invalid register-care interface line "clobbers Q"');
    });
  }, 20_000);

  it('rejects malformed register-care interface contracts when register-care is otherwise off', async () => {
    await withRegisterCareFixture('azm-regcare-cli-interface-bad-off-', async ({ work, entry }) => {
      const iface = join(work, 'bad.asmi');
      await writeEntry(entry, ['START:', '    ret', '.end']);
      await writeFile(iface, ['extern MON', 'clobbers A, Q', 'end'].join('\n'), 'utf8');

      const res = await runCli([...artifactlessArgs, '--interface', iface, entry]);

      expect(res.code).toBe(2);
      expect(res.stderr).toContain('invalid register-care interface line "clobbers A, Q"');
    });
  }, 20_000);

  it('rejects register-care interfaces without the .asmi extension', async () => {
    await withRegisterCareFixture('azm-regcare-cli-interface-ext-', async ({ work, entry }) => {
      const iface = join(work, 'bad.asm');
      await writeEntry(entry, ['START:', '    ret', '.end']);
      await writeFile(iface, ['extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

      const res = await runCli([...artifactlessArgs, '--interface', iface, entry]);

      expect(res.code).toBe(1);
      expect(res.stderr).toContain('Register-care interface files must use the .asmi extension');
    });
  }, 20_000);

  it('rejects comments in register-care interface files', async () => {
    await withRegisterCareFixture('azm-regcare-cli-interface-comment-', async ({ work, entry }) => {
      const iface = join(work, 'bad.asmi');
      await writeEntry(entry, ['START:', '    ret', '.end']);
      await writeFile(iface, ['; comment', 'extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

      const res = await runCli([...artifactlessArgs, '--interface', iface, entry]);

      expect(res.code).toBe(2);
      expect(res.stderr).toContain('.asmi files do not permit comments');
    });
  }, 20_000);

  it('writes a register-care interface artifact when requested', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-interface-'));
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
      '--nolist',
      '--register-care',
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
    expect(await exists(join(work, 'main.lst'))).toBe(false);
    await expect(readFile(interfacePath, 'utf8')).resolves.toContain('extern HELPER');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('annotates source contracts in place and replaces stale compact blocks', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-annotate-'));
    const entry = join(work, 'main.z80');
    const source = [
      'START:',
      '    call HELPER',
      '    ret',
      'SKIP:',
      '    ret',
      '',
      '; Helper prose stays untouched.',
      ';!      clobbers  A',
      'HELPER:',
      '    ld hl,$1000',
      '    ret',
      '',
      '; Empty prose stays untouched.',
      ';!      clobbers  BC',
      'EMPTY:',
      '.end',
    ].join('\n');
    await writeFile(entry, source, 'utf8');

    const first = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--annotate-register-contracts',
      entry,
    ]);
    expect(first.code).toBe(0);
    expect(first.stdout.trim()).toBe(entry);

    const annotated = await readFile(entry, 'utf8');
    expect(annotated).toContain(
      ['; Helper prose stays untouched.', ';!      out       HL', ';!      clobbers  A', 'HELPER:'].join(
        '\n',
      ),
    );
    expect(annotated).not.toContain(';!      out       HL\nSTART:');
    expect(annotated).not.toContain(';!      out       HL\nSKIP:');
    expect(annotated).toContain(
      ['; Empty prose stays untouched.', ';!      clobbers  BC', 'EMPTY:'].join('\n'),
    );

    const second = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--annotate-register-contracts',
      entry,
    ]);
    expect(second.code).toBe(0);
    await expect(readFile(entry, 'utf8')).resolves.toBe(annotated);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('accepts caller-output candidates while annotating source contracts', async () => {
    await withRegisterCareFixture('azm-regcare-cli-accept-', async ({ entry }) => {
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
    await withRegisterCareFixture('azm-regcare-cli-fix-', async ({ entry }) => {
      await writeEntry(entry, maskRoutineSource(['    nop', '    ld d,a']));

      const res = await runCli([...artifactlessArgs, '--register-care', 'audit', '--fix', entry]);
      expect(res.code).toBe(0);
      expect(res.stdout.trim()).toBe(entry);

      const fixed = await readFile(entry, 'utf8');
      expect(fixed).toContain(
        ['START:', '    ld a,3', '    ; expects out A', '    call MASK', '    nop', '    ld d,a'].join(
          '\n',
        ),
      );
      expect(fixed).not.toContain('; maybe-out A');
    });
  }, 20_000);

  it('keeps fix mode useful when stale source contracts already suppress the audit candidate', async () => {
    await withRegisterCareFixture('azm-regcare-cli-fix-stale-contract-', async ({ entry }) => {
      await writeEntry(entry, maskRoutineSource(['    ld d,a'], true));

      const res = await runCli([...artifactlessArgs, '--rc', 'audit', '--fix', entry]);
      expect(res.code).toBe(0);

      const fixed = await readFile(entry, 'utf8');
      expect(fixed).toContain(
        ['START:', '    ld a,3', '    ; expects out A', '    call MASK', '    ld d,a'].join('\n'),
      );
      expect(fixed).toContain(maskRoutineOutContract);
    });
  }, 20_000);

  it('inserts expects-out hints for control-flow-reachable continuation reads with --fix', async () => {
    await withRegisterCareFixture('azm-regcare-cli-fix-cfg-', async ({ entry }) => {
      await writeEntry(
        entry,
        maskRoutineSource(['    jr z,.done', '.use_mask:', '    ld d,a', '.done:']),
      );

      const res = await runCli([...artifactlessArgs, '--register-care', 'audit', '--fix', entry]);
      expect(res.code).toBe(0);

      const fixed = await readFile(entry, 'utf8');
      expect(fixed).toContain(
        ['START:', '    ld a,3', '    ; expects out A', '    call MASK', '    jr z,.done'].join('\n'),
      );
      expect(fixed).not.toContain('; maybe-out A');
    });
  }, 20_000);
});
