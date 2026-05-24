import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RegisterCareReportArtifact } from '../../src/outputs/types.js';
import { describe, expect, it } from 'vitest';

import { compile, defaultFormatWriters } from '../../src/index.js';

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function reportArtifact(
  result: Awaited<ReturnType<typeof compile>>,
): RegisterCareReportArtifact | undefined {
  return result.artifacts.find(
    (artifact): artifact is RegisterCareReportArtifact => artifact.kind === 'register-care-report',
  );
}

describe('stage-14 register-care report summaries', () => {
  it('includes inferred routine summaries for local called routines', async () => {
    await withTempDir('azm-next-regcare-summary-local-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        ['START:', '    call HELPER', '    ld a,3', '    ret', 'HELPER:', '    ld de,$1000', '    ret', '.end'].join(
          '\n',
        ),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerCare: 'audit',
          emitRegisterReport: true,
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      const report = reportArtifact(result);
      expect(report?.text).toContain('Routine: HELPER');
      expect(report?.text).toContain('reads:');
      expect(report?.text).toContain('relation: D,E <= -');
    });
  });

  it('merges external interface contracts into routine summaries', async () => {
    await withTempDir('azm-next-regcare-summary-iface-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'mon3.asmi');
      await writeFile(
        entry,
        ['START:', '    call MASK', '    ret', 'MASK:', '    ret', '.end'].join('\n'),
        'utf8',
      );
      await writeFile(
        iface,
        ['extern MASK', 'clobbers DE', 'out D', 'end'].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerCare: 'audit',
          emitRegisterReport: true,
          registerCareInterfaces: [iface],
        },
        { formats: defaultFormatWriters },
      );

      expect(result.diagnostics).toEqual([]);
      const report = reportArtifact(result);
      expect(report?.text).toContain('Routine: MASK');
      expect(report?.text).toMatch(/relation: D <= -/);
    });
  });
});
