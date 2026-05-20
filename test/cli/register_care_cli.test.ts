import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, runCli } from '../helpers/cli.js';

describe('register-care cli', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('writes a register-care report artifact in audit mode', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-'));
    const entry = join(work, 'main.z80');
    await writeFile(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
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

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('accepts short register-care switches', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-short-'));
    const entry = join(work, 'main.z80');
    await writeFile(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
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

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('loads bare register-care contract files with --interface', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-interface-'));
    const entry = join(work, 'main.z80');
    const iface = join(work, 'lib.asmi');
    await writeFile(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    call LIB_CLOBBER_DE',
        '    inc de',
        '    ret',
        'LIB_CLOBBER_DE:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );
    await writeFile(iface, ['extern LIB_CLOBBER_DE', 'clobbers  DE', 'end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--rc=error',
      '--reg-report',
      '--interface',
      iface,
      entry,
    ]);

    expect(res.code).toBe(1);
    expect(res.stderr).toContain('CALL LIB_CLOBBER_DE may modify D,E');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects malformed --accept-out values', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-accept-bad-'));
    const entry = join(work, 'main.z80');
    await writeFile(entry, ['START:', '    ret', '.end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--rc=audit',
      '--contracts',
      '--accept-out',
      'MASK:Q',
      entry,
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Invalid --accept-out value "MASK:Q"');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects malformed --accept-out even without source rewriting', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-accept-bad-audit-'));
    const entry = join(work, 'main.z80');
    await writeFile(entry, ['START:', '    ret', '.end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--rc=audit',
      '--reg-report',
      '--accept-out',
      'MASK:A,',
      entry,
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Invalid --accept-out value "MASK:A,"');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects malformed --accept-out when register-care is otherwise off', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-accept-bad-off-'));
    const entry = join(work, 'main.z80');
    await writeFile(entry, ['START:', '    ret', '.end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--accept-out',
      'MASK:A,',
      entry,
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Invalid --accept-out value "MASK:A,"');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects malformed register-care interface contracts', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-interface-bad-'));
    const entry = join(work, 'main.z80');
    const iface = join(work, 'bad.asmi');
    await writeFile(entry, ['START:', '    ret', '.end'].join('\n'), 'utf8');
    await writeFile(iface, ['extern MON', 'clobbers Q', 'end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--rc=audit',
      '--reg-report',
      '--interface',
      iface,
      entry,
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('invalid register-care interface line "clobbers Q"');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects malformed register-care interface contracts when register-care is otherwise off', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-interface-bad-off-'));
    const entry = join(work, 'main.z80');
    const iface = join(work, 'bad.asmi');
    await writeFile(entry, ['START:', '    ret', '.end'].join('\n'), 'utf8');
    await writeFile(iface, ['extern MON', 'clobbers A, Q', 'end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--interface',
      iface,
      entry,
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('invalid register-care interface line "clobbers A, Q"');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects register-care interfaces without the .asmi extension', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-interface-ext-'));
    const entry = join(work, 'main.z80');
    const iface = join(work, 'bad.asm');
    await writeFile(entry, ['START:', '    ret', '.end'].join('\n'), 'utf8');
    await writeFile(iface, ['extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--interface',
      iface,
      entry,
    ]);

    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Register-care interface files must use the .asmi extension');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects comments in register-care interface files', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-interface-comment-'));
    const entry = join(work, 'main.z80');
    const iface = join(work, 'bad.asmi');
    await writeFile(entry, ['START:', '    ret', '.end'].join('\n'), 'utf8');
    await writeFile(iface, ['; comment', 'extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--interface',
      iface,
      entry,
    ]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('.asmi files do not permit comments');

    await rm(work, { recursive: true, force: true });
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
      ['; Helper prose stays untouched.', ';!      out       HL', 'HELPER:'].join('\n'),
    );
    expect(annotated).not.toContain(';!      out       HL\nSTART:');
    expect(annotated).not.toContain(';!      out       HL\nSKIP:');
    expect(annotated).not.toContain(';!      clobbers  A\nHELPER:');
    expect(annotated).toContain('; Empty prose stays untouched.\nEMPTY:');
    expect(annotated).not.toContain(';!      clobbers  BC\nEMPTY:');

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
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-accept-'));
    const entry = join(work, 'main.z80');
    await writeFile(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        'MASK:',
        '    ld c,a',
        '    ld a,$80',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--rc',
      'audit',
      '--contracts',
      '--accept-out',
      'MASK:A',
      entry,
    ]);
    expect(res.code).toBe(0);

    const annotated = await readFile(entry, 'utf8');
    expect(annotated).toContain(
      ['; Mask prose.', ';!      out       A', ';!      clobbers  C', 'MASK:'].join('\n'),
    );
    expect(annotated).not.toContain('; maybe-out A');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('promotes high-confidence caller-output candidates with short --fix', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-fix-'));
    const entry = join(work, 'main.z80');
    await writeFile(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    nop',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        'MASK:',
        '    ld c,a',
        '    ld a,$80',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--fix',
      entry,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(entry);

    const fixed = await readFile(entry, 'utf8');
    expect(fixed).toContain(
      ['START:', '    ld a,3', '    call MASK', '    nop', '    ld d,a'].join('\n'),
    );
    expect(fixed).not.toContain('; expects out A');
    expect(fixed).toContain(
      ['; Mask prose.', ';!      out       A', ';!      clobbers  C', 'MASK:'].join('\n'),
    );
    expect(fixed).not.toContain('; maybe-out A');

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('keeps fix mode useful when stale source contracts already suppress the audit candidate', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-fix-stale-contract-'));
    const entry = join(work, 'main.z80');
    await writeFile(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        ';!      out       A',
        ';!      clobbers  C',
        'MASK:',
        '    ld c,a',
        '    ld a,$80',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--rc',
      'audit',
      '--fix',
      entry,
    ]);
    expect(res.code).toBe(0);

    const fixed = await readFile(entry, 'utf8');
    expect(fixed).toContain(['START:', '    ld a,3', '    call MASK', '    ld d,a'].join('\n'));
    expect(fixed).not.toContain('; expects out A');
    expect(fixed).toContain(
      ['; Mask prose.', ';!      out       A', ';!      clobbers  C', 'MASK:'].join('\n'),
    );

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('promotes caller-output candidates read through a local branch path', async () => {
    const work = await mkdtemp(join(tmpdir(), 'azm-regcare-cli-fix-cfg-'));
    const entry = join(work, 'main.z80');
    await writeFile(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    jr z,.done',
        '.use_mask:',
        '    ld d,a',
        '.done:',
        '    ret',
        '',
        '; Mask prose.',
        'MASK:',
        '    ld c,a',
        '    ld a,$80',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await runCli([
      '--nobin',
      '--nohex',
      '--nod8m',
      '--nolist',
      '--register-care',
      'audit',
      '--fix',
      entry,
    ]);
    expect(res.code).toBe(0);

    const fixed = await readFile(entry, 'utf8');
    expect(fixed).toContain(['START:', '    ld a,3', '    call MASK', '    jr z,.done'].join('\n'));
    expect(fixed).not.toContain('; expects out A');
    expect(fixed).toContain(
      ['; Mask prose.', ';!      out       A', ';!      clobbers  C', 'MASK:'].join('\n'),
    );

    await rm(work, { recursive: true, force: true });
  }, 20_000);
});
