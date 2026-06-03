import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compactSpawnError,
  runAsm80BinaryReference,
  sourceStem,
} from '../../../scripts/dev/asm80ReferenceTools.mjs';

describe('asm80 reference tools', () => {
  it('derives source stems from asm80 source paths', () => {
    expect(sourceStem('/tmp/mon3.z80')).toBe('mon3');
    expect(sourceStem('/tmp/tetro.asm')).toBe('tetro');
  });

  it('compacts spawn stderr and stdout to a short diagnostic', () => {
    expect(
      compactSpawnError({
        stdout: ' first line \n second line ',
        stderr: ' third line \n fourth line \n fifth line ',
      }),
    ).toBe('first line | second line | third line | fourth line');
  });

  it('returns a failure result when the asm80 executable cannot be spawned', () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-reference-test-'));
    const source = join(dir, 'main.z80');
    writeFileSync(source, '.org 0\n', 'utf8');

    expect(runAsm80BinaryReference(source, join(dir, 'missing-asm80'))).toMatchObject({
      ok: false,
    });
  });
});
