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
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstruction,
} from '../helpers/lowered_program.js';

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
  writeFileSync(entry, ['op clear_a()', '  xor a', 'end', '', ...codeBody].join('\n'), 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('op expansion and register-care', () => {
  it('expands an op call site into ordinary Z80 instructions in the object file', async () => {
    const { entry, cleanup } = writeOpFixture('azm');
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

  it('does not treat expanded op instructions as call boundaries in the register-care program model', async () => {
    const { entry, cleanup } = writeOpFixture('azm');
    const diagnostics: Diagnostic[] = [];
    try {
      const loaded = await loadProgram(entry, diagnostics, { sourceMode: 'azm' });
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(loaded).toBeDefined();
      const model = buildRegisterCareProgramModel(loaded!.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map((item) => item.head)).toContain('xor');
      expect(main!.instructions.map((item) => item.head)).not.toContain('clear_a');
      expect(main!.instructions.map((item) => item.head)).not.toContain('call');
    } finally {
      cleanup();
    }
  });

  it('analyzes op call sites from post-expansion instructions', async () => {
    const { entry, cleanup } = writeOpFixture('azm');
    const diagnostics: Diagnostic[] = [];
    try {
      const loaded = await loadProgram(entry, diagnostics, { sourceMode: 'azm' });
      expect(loaded).toBeDefined();
      const model = buildRegisterCareProgramModel(loaded!.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const summary = inferRoutineSummary(main!);
      expect(summary.valueRelations).toContainEqual({ out: ['A'], from: [] });
      expect(summary.valueRelations).toContainEqual({ out: ['zero'], from: [] });
      expect(summary.mayWrite).toContain('sign');
    } finally {
      cleanup();
    }
  });

  it('infers inline register transfer effects from expanded ops', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcare-'));
    const entry = join(dir, 'entry.azm');
    const source = [
      'op copy_a_to_b()',
      '  ld b,a',
      'end',
      '',
      'main:',
      '  ld a,7',
      '  copy_a_to_b',
      '  ret',
      '',
    ].join('\n');
    const diagnostics: Diagnostic[] = [];
    try {
      writeFileSync(entry, source, 'utf8');
      const loaded = await loadProgram(entry, diagnostics, { sourceMode: 'azm' });
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(loaded).toBeDefined();
      const model = buildRegisterCareProgramModel(loaded!.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map((item) => item.head)).toEqual(['ld', 'ld', 'ret']);
      expect(model.directCallTargets).toEqual([]);
      const summary = inferRoutineSummary(main!);
      expect(summary.mayWrite).toContain('A');
      expect(summary.valueRelations).toContainEqual({ out: ['B'], from: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps register-care op expansion aligned with the emitted lowered stream', async () => {
    const { entry, cleanup } = writeOpFixture('azm');
    const diagnostics: Diagnostic[] = [];
    try {
      const loaded = await loadProgram(entry, diagnostics, { sourceMode: 'azm' });
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(loaded).toBeDefined();

      const model = buildRegisterCareProgramModel(loaded!.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const registerCareStream = main!.instructions.map((instruction) => instruction.head);

      const lowered = await compilePlacedProgram(entry);
      expect(lowered.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      const emittedStream = flattenLoweredInstructions(lowered.program)
        .map(formatLoweredInstruction)
        .filter((line) => !line.startsWith('@raw'))
        .map((line) => line.split(/\s+/, 1)[0]!.toLowerCase());

      expect(registerCareStream).toEqual(emittedStream);
      expect(registerCareStream).toEqual(['xor', 'ret']);
    } finally {
      cleanup();
    }
  });

  it('summarizes stack effects from native AZM op expansion', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcare-'));
    const entry = join(dir, 'entry.azm');
    const source = [
      'op save_hl()',
      '  push hl',
      'end',
      '',
      'main:',
      '  save_hl',
      '  ret',
      '',
    ].join('\n');
    const diagnostics: Diagnostic[] = [];
    try {
      writeFileSync(entry, source, 'utf8');
      const loaded = await loadProgram(entry, diagnostics, { sourceMode: 'azm' });
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(loaded).toBeDefined();
      const model = buildRegisterCareProgramModel(loaded!.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map((item) => item.head)).toEqual(['push', 'ret']);

      const summary = inferRoutineSummary(main!);
      expect(summary.stackBalanced).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
