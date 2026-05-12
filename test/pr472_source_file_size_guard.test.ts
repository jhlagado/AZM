import { readFile } from 'node:fs/promises';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

async function currentLineCount(file: string): Promise<number> {
  const text = await readFile(file, 'utf8');
  if (text.length === 0) return 0;
  const normalized = text.endsWith('\n') ? text.slice(0, -1) : text;
  if (normalized.length === 0) return 0;
  return normalized.split('\n').length;
}

async function currentHardCapCeiling(file: string): Promise<number | null> {
  const allowlistText = await readFile('scripts/source-file-size-allowlist.json', 'utf8');
  const allowlist = JSON.parse(allowlistText) as {
    hardCap?: Record<string, number>;
  };
  return allowlist.hardCap?.[file] ?? null;
}

function normalizeGuardOutput(text: string): string {
  return text.replaceAll('\\', '/');
}

describe('PR472: source file size guard', () => {
  it('reports current oversized files deterministically in warn-only mode', async () => {
    const { stdout } = await execFileAsync('node', ['scripts/check-source-file-sizes.mjs'], {
      cwd: process.cwd(),
    });
    const asmInstructionLoweringLines = await currentLineCount('src/lowering/asmInstructionLowering.ts');
    const emitLines = await currentLineCount('src/lowering/emit.ts');
    const emitCeiling = await currentHardCapCeiling('src/lowering/emit.ts');
    const parserLines = await currentLineCount('src/frontend/parser.ts');
    const parserCeiling = await currentHardCapCeiling('src/frontend/parser.ts');
    const encodeLines = await currentLineCount('src/z80/encode.ts');
    const normalizedStdout = normalizeGuardOutput(stdout);
    const hasOversizedFiles =
      asmInstructionLoweringLines > 750 || emitLines > 750 || parserLines > 750 || encodeLines > 750;

    if (hasOversizedFiles) {
      expect(normalizedStdout).toContain('source-file-size-guard: soft>750, hard>1000');
    } else {
      expect(normalizedStdout).toContain('source-file-size-guard: ok (soft 750, hard 1000)');
    }
    if (asmInstructionLoweringLines > 750) {
      expect(normalizedStdout).toContain(
        `src/lowering/asmInstructionLowering.ts: ${asmInstructionLoweringLines}`,
      );
    } else {
      expect(normalizedStdout).not.toContain(
        `src/lowering/asmInstructionLowering.ts: ${asmInstructionLoweringLines}`,
      );
    }
    if (emitLines > 1000) {
      if (emitCeiling !== null) {
        expect(normalizedStdout).toContain(
          `src/lowering/emit.ts: ${emitLines} (ceiling ${emitCeiling})`,
        );
      } else {
        expect(normalizedStdout).toContain(`src/lowering/emit.ts: ${emitLines} (ceiling ${emitLines})`);
      }
    } else if (emitLines > 750) {
      expect(normalizedStdout).toContain(`src/lowering/emit.ts: ${emitLines}`);
    } else {
      expect(normalizedStdout).not.toContain(`src/lowering/emit.ts: ${emitLines}`);
    }
    if (parserLines > 750) {
      if (parserLines > 1000) {
        if (parserCeiling !== null) {
          expect(normalizedStdout).toContain(
            `src/frontend/parser.ts: ${parserLines} (ceiling ${parserCeiling})`,
          );
        } else {
          expect(normalizedStdout).toContain(
            `src/frontend/parser.ts: ${parserLines} (ceiling ${parserLines})`,
          );
        }
      } else {
        expect(normalizedStdout).toContain(`src/frontend/parser.ts: ${parserLines}`);
      }
    } else {
      expect(normalizedStdout).not.toContain(`src/frontend/parser.ts: ${parserLines}`);
    }
    if (encodeLines > 750) {
      expect(normalizedStdout).toContain(`src/z80/encode.ts: ${encodeLines}`);
    } else {
      expect(normalizedStdout).not.toContain(`src/z80/encode.ts: ${encodeLines}`);
    }
  });

  it('enforce mode passes in the current tree because hard-cap breaches are allowlisted', async () => {
    await expect(
      execFileAsync('node', ['scripts/check-source-file-sizes.mjs', '--enforce-hard-cap'], {
        cwd: process.cwd(),
      }),
    ).resolves.toMatchObject({ stderr: '' });
  });

  it('enforce mode fails when an allowlisted hard-cap file grows past its ceiling', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'zax-size-guard-'));
    const fixtureRoot = join(tempRoot, 'workspace');
    const fixtureSrc = join(fixtureRoot, 'src');
    const oversizedFile = join(fixtureSrc, 'oversized.ts');
    const allowlistFile = join(fixtureRoot, 'allowlist.json');
    const scriptPath = resolve(process.cwd(), 'scripts/check-source-file-sizes.mjs');
    const oversizedText = `${Array.from({ length: 1002 }, () => 'export const x = 1;').join('\n')}\n`;

    await mkdir(fixtureSrc, { recursive: true });
    await writeFile(oversizedFile, oversizedText);
    await writeFile(
      allowlistFile,
      JSON.stringify({ hardCap: { 'src/oversized.ts': 1001 } }, null, 2),
    );

    try {
      await expect(
        execFileAsync(
          'node',
          [
            scriptPath,
            '--root',
            fixtureSrc,
            '--allowlist-file',
            allowlistFile,
            '--enforce-hard-cap',
          ],
          { cwd: fixtureRoot },
        ),
      ).rejects.toMatchObject({ code: 1 });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
