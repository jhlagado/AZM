import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RegisterCareAnnotationsArtifact } from '../../src/outputs/types.js';
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

describe('stage 14 register-care compile API slice', () => {
  it('returns an error diagnostic for .asmi interface extension mismatch', async () => {
    await withTempDir('azm-next-regcare-compile-ext-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'lib.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

      const result = await compile(entry, {
        registerCareInterfaces: [iface],
        emitRegisterReport: true,
      }, {
        formats: defaultFormatWriters,
      });

      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_REGISTER_CARE',
          message: 'Register-care interface files must use the .asmi extension',
          sourceName: iface,
        },
      ]);
      expect(result.artifacts).toEqual([]);
    });
  });

  it('throws on malformed --accept-out values before assembly', async () => {
    await withTempDir('azm-next-regcare-compile-accept-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');

      await expect(
        compile(
          entry,
          {
            acceptRegisterOutputCandidates: ['MASK:A,'],
            registerCare: 'audit',
          },
          { formats: defaultFormatWriters },
        ),
      ).rejects.toThrow('Invalid --accept-out value "MASK:A,"');
    });
  });

  it('throws on malformed interface contract lines', async () => {
    await withTempDir('azm-next-regcare-compile-interface-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'lib.asmi');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers A, Q', 'end'].join('\n'), 'utf8');

      await expect(
        compile(
          entry,
          {
            registerCare: 'audit',
            registerCareInterfaces: [iface],
            emitRegisterInterface: true,
          },
          { formats: defaultFormatWriters },
        ),
      ).rejects.toThrow('invalid register-care interface line "clobbers A, Q"');
    });
  });

  it('emits register-care annotation artifacts when requested', async () => {
    await withTempDir('azm-next-regcare-compile-annotations-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'mon3.asmi');
      await writeFile(
        entry,
        [
          'START:',
          '    call MASK',
          '    ret',
          '',
          '; Helper prose.',
          'MASK:',
          '    ld a, $80',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );
      await writeFile(
        iface,
        ['extern MASK', 'out A', 'end'].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerCare: 'audit',
          emitRegisterAnnotations: true,
          registerCareInterfaces: [iface],
          registerCareProfile: 'mon3',
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toHaveLength(0);
      const annotations = result.artifacts.find(
        (artifact): artifact is RegisterCareAnnotationsArtifact =>
          artifact.kind === 'register-care-annotations',
      );
      expect(annotations).toBeDefined();
      const annotationArtifact = annotations!;
      expect(annotationArtifact).toMatchObject({
        kind: 'register-care-annotations',
      });
      expect(annotationArtifact.files).toHaveLength(1);
      expect(annotationArtifact.files[0]!.path).toBe(entry);
      expect(annotationArtifact.files[0]!.text).toContain(
        ['; Helper prose.', ';!      out       A'].join('\n'),
      );
      expect(annotationArtifact.files[0]!.text).toContain(';!      out       A');
      expect(annotationArtifact.files[0]!.text).toContain('MASK:');

      const onDisk = await readFile(entry, 'utf8');
      expect(onDisk).toContain('MASK:');
      expect(onDisk).not.toContain(';!      out       A');
    });
  });

  it('promotes accepted output candidates to annotations', async () => {
    await withTempDir('azm-next-regcare-compile-accept-annotations-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'START:',
          '    call MASK',
          '    ret',
          '',
          '; Helper prose.',
          'MASK:',
          '    ld a, $80',
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );

      const result = await compile(
        entry,
        {
          registerCare: 'audit',
          emitRegisterAnnotations: true,
          acceptRegisterOutputCandidates: ['MASK:A'],
        },
        {
          formats: defaultFormatWriters,
        },
      );

      expect(result.diagnostics).toHaveLength(0);
      const annotations = result.artifacts.find(
        (artifact): artifact is RegisterCareAnnotationsArtifact =>
          artifact.kind === 'register-care-annotations',
      );
      expect(annotations).toBeDefined();
      const annotationArtifact = annotations!;
      expect(annotationArtifact.files).toHaveLength(1);
      expect(annotationArtifact.files[0]!.text).toContain(';!      out       A');
    });
  });
});
