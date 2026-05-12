import { beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { ensureCliBuilt } from '../helpers/cliBuild.js';
import { exists, runCli } from '../helpers/cli.js';

describe('cli contract matrix', () => {
  beforeAll(async () => {
    await ensureCliBuilt();
  }, 180_000);

  it('prints help text and exits 0', async () => {
    const res = await runCli(['--help']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('zax [options] <entry.zax>');
    expect(res.stdout).toContain('--output <file>');
    expect(res.stderr).toBe('');
  });

  it('prints version and exits 0', async () => {
    const res = await runCli(['--version']);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(res.stderr).toBe('');
  });

  it('requires exactly one entry and enforces entry-last ordering', async () => {
    const resNoEntry = await runCli([]);
    expect(resNoEntry.code).toBe(2);
    expect(resNoEntry.stderr).toContain('Expected exactly one <entry.zax> argument');

    const work = await mkdtemp(join(tmpdir(), 'zax-cli-multi-entry-'));
    const entryA = join(work, 'a.zax');
    const entryB = join(work, 'b.zax');
    await writeFile(entryA, 'export func main()\n  nop\nend\n', 'utf8');
    await writeFile(entryB, 'export func other()\n  nop\nend\n', 'utf8');

    const resMultiple = await runCli([entryA, entryB]);
    expect(resMultiple.code).toBe(2);
    expect(resMultiple.stderr).toContain('must be last');

    await rm(work, { recursive: true, force: true });
  });

  it('rejects missing values for --output/--type/--include/--case-style/--op-stack-policy', async () => {
    const outMissing = await runCli(['--output']);
    expect(outMissing.code).toBe(2);
    expect(outMissing.stderr).toContain('--output expects a value');

    const typeMissing = await runCli(['--type']);
    expect(typeMissing.code).toBe(2);
    expect(typeMissing.stderr).toContain('--type expects a value');

    const includeMissing = await runCli(['--include']);
    expect(includeMissing.code).toBe(2);
    expect(includeMissing.stderr).toContain('--include expects a value');

    const caseStyleMissing = await runCli(['--case-style']);
    expect(caseStyleMissing.code).toBe(2);
    expect(caseStyleMissing.stderr).toContain('--case-style expects a value');

    const opStackPolicyMissing = await runCli(['--op-stack-policy']);
    expect(opStackPolicyMissing.code).toBe(2);
    expect(opStackPolicyMissing.stderr).toContain('--op-stack-policy expects a value');
  }, 20_000);

  it(
    'rejects unsupported type tokens and output/type extension mismatches',
    async () => {
      const work = await mkdtemp(join(tmpdir(), 'zax-cli-type-'));
      const entry = join(work, 'main.zax');
      await writeFile(entry, 'export func main()\n  nop\nend\n', 'utf8');

      const unsupported = await runCli(['--type=rom', entry]);
      expect(unsupported.code).toBe(2);
      expect(unsupported.stderr).toContain('Unsupported --type "rom"');

      const badHexExt = await runCli(['--type', 'hex', '-o', join(work, 'out.bin'), entry]);
      expect(badHexExt.code).toBe(2);
      expect(badHexExt.stderr).toContain('--output must end with ".hex"');

      const badBinExt = await runCli(['--type', 'bin', '-o', join(work, 'out.hex'), entry]);
      expect(badBinExt.code).toBe(2);
      expect(badBinExt.stderr).toContain('--output must end with ".bin"');

      await rm(work, { recursive: true, force: true });
    },
    15_000,
  );

  it('rejects unsupported --op-stack-policy mode tokens', async () => {
    const fixture = join(__dirname, '..', 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const res = await runCli(['--op-stack-policy=strict', fixture]);

    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unsupported --op-stack-policy "strict"');
  });

  it('forwards --op-stack-policy to compile (warn keeps exit 0, error upgrades to exit 1)', async () => {
    const fixture = join(__dirname, '..', 'fixtures', 'pr271_op_stack_policy_delta_warn.zax');
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-op-stack-policy-'));
    const warnOut = join(work, 'warn.hex');
    const errorOut = join(work, 'error.hex');

    const warnRes = await runCli(['--op-stack-policy=warn', '--output', warnOut, fixture]);
    expect(warnRes.code).toBe(0);
    expect(warnRes.stderr).toContain('warning: [ZAX315]');
    expect(await exists(warnOut)).toBe(true);

    const errorRes = await runCli(['--op-stack-policy=error', '--output', errorOut, fixture]);
    expect(errorRes.code).toBe(1);
    expect(errorRes.stderr).toContain('error: [ZAX315]');
    expect(await exists(errorOut)).toBe(false);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects suppression of the selected primary output type', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-primary-suppress-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n  nop\nend\n', 'utf8');

    const noBin = await runCli(['--type', 'bin', '--nobin', '-o', join(work, 'out.bin'), entry]);
    expect(noBin.code).toBe(2);
    expect(noBin.stderr).toContain('--type bin requires BIN output to be enabled');

    const noHex = await runCli(['--type', 'hex', '--nohex', '-o', join(work, 'out.hex'), entry]);
    expect(noHex.code).toBe(2);
    expect(noHex.stderr).toContain('--type hex requires HEX output to be enabled');

    await rm(work, { recursive: true, force: true });
  });

  it('uses entry stem as default primary output for --type bin and writes siblings', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-default-bin-'));
    const entry = join(work, 'main.zax');
    await writeFile(entry, 'export func main()\n  nop\nend\n', 'utf8');

    const res = await runCli(['--type', 'bin', entry]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(join(work, 'main.bin'));

    expect(await exists(join(work, 'main.bin'))).toBe(true);
    expect(await exists(join(work, 'main.hex'))).toBe(true);
    expect(await exists(join(work, 'main.d8.json'))).toBe(true);
    expect(await exists(join(work, 'main.lst'))).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('returns exit code 1 and no artifacts when diagnostics contain errors', async () => {
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-error-exit-'));
    const entry = join(work, 'broken.zax');
    await writeFile(entry, 'func main(: void\nend\n', 'utf8');

    const outHex = join(work, 'out.hex');
    const res = await runCli(['-o', outHex, entry]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('error:');

    expect(await exists(join(work, 'out.hex'))).toBe(false);
    expect(await exists(join(work, 'out.bin'))).toBe(false);
    expect(await exists(join(work, 'out.d8.json'))).toBe(false);
    expect(await exists(join(work, 'out.lst'))).toBe(false);

    await rm(work, { recursive: true, force: true });
  }, 20_000);

  it('rejects retired --type-padding-warn', async () => {
    const res = await runCli(['--type-padding-warn']);
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('Unknown option "--type-padding-warn"');
  });

  it('forwards --raw-typed-call-warn to compile', async () => {
    const fixture = join(__dirname, '..', 'fixtures', 'pr278_raw_call_typed_target_warning.zax');
    const work = await mkdtemp(join(tmpdir(), 'zax-cli-raw-typed-call-warn-'));
    const offOut = join(work, 'off.hex');
    const onOut = join(work, 'on.hex');

    const offRes = await runCli(['--output', offOut, fixture]);
    expect(offRes.code).toBeLessThanOrEqual(1);
    expect(offRes.stderr).not.toContain('[ZAX316]');
    expect(await exists(offOut)).toBe(true);

    const onRes = await runCli(['--raw-typed-call-warn', '--output', onOut, fixture]);
    expect(onRes.code).toBe(0);
    expect(onRes.stderr).toContain('warning: [ZAX316]');
    expect(onRes.stderr).toContain('Raw call targets typed callable');
    expect(await exists(onOut)).toBe(true);

    await rm(work, { recursive: true, force: true });
  }, 20_000);
});
