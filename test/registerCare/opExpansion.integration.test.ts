import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import { buildRegisterCareProgramModel } from '../../src/registerCare/programModel.js';
import { inferRoutineSummary } from '../../src/registerCare/summary.js';
import { loadProgram } from '../../src/moduleLoader.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';

function writeOpFixture(ext: 'azm' | 'zax'): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcare-'));
  const entry = join(dir, `entry.${ext}`);
  const codeBody =
    ext === 'azm'
      ? ['main:', '  clear_a', '  ret', '']
      : [
          'section code text at $0000',
          'export func main()',
          '  clear_a',
          '  ret',
          'end',
          'end',
          '',
        ];
  writeFileSync(
    entry,
    ['op clear_a()', '  xor a', 'end', '', ...codeBody].join('\n'),
    'utf8',
  );
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('op expansion and register-care', () => {
  it('expands an op call site into ordinary Z80 instructions in the object file', async () => {
    const { entry, cleanup } = writeOpFixture('zax');
    try {
      const res = await compile(
        entry,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toContain(0xaf);
    } finally {
      cleanup();
    }
  });

  it('does not treat op invocation as a call boundary in the register-care program model', async () => {
    const { entry, cleanup } = writeOpFixture('azm');
    const diagnostics: Diagnostic[] = [];
    try {
      const loaded = await loadProgram(entry, diagnostics, { sourceMode: 'azm' });
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(loaded).toBeDefined();
      const model = buildRegisterCareProgramModel(loaded!.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map((item) => item.head)).toContain('clear_a');
      expect(main!.instructions.map((item) => item.head)).not.toContain('call');
    } finally {
      cleanup();
    }
  });

  it('currently analyzes op call sites from source, not post-expansion instructions', async () => {
    const { entry, cleanup } = writeOpFixture('azm');
    const diagnostics: Diagnostic[] = [];
    try {
      const loaded = await loadProgram(entry, diagnostics, { sourceMode: 'azm' });
      expect(loaded).toBeDefined();
      const model = buildRegisterCareProgramModel(loaded!.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const summary = inferRoutineSummary(main!);
      expect(summary.mayWrite).not.toContain('A');
    } finally {
      cleanup();
    }
  });
});
