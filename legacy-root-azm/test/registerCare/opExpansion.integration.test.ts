import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';
import type { CompilerOptions } from '../../src/pipeline.js';
import { buildRegisterCareProgramModel } from '../../src/registerCare/programModel.js';
import { inferRoutineSummary } from '../../src/registerCare/summary.js';
import { loadProgram } from '../../src/sourceLoader.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  formatLoweredInstruction,
} from '../helpers/lowered_program.js';
import { withTempSource } from '../helpers/temp_source.js';

const binOnlyOptions = {
  emitBin: true,
  emitHex: false,
  emitD8m: false,
  emitListing: false,
} satisfies CompilerOptions;

const clearAOpSource = [
  'op clear_a()',
  '  xor a',
  'end',
  '',
  'main:',
  '  clear_a',
  '  ret',
  '',
].join('\n');

async function withOpFixture<T>(
  source: string,
  callback: (entry: string, diagnostics: Diagnostic[]) => Promise<T>,
): Promise<T> {
  const diagnostics: Diagnostic[] = [];
  return withTempSource('azm-op-regcare-', 'asm', source, (entry) => callback(entry, diagnostics));
}

function expectNoErrorDiagnostics(diagnostics: Diagnostic[]): void {
  expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
}

async function loadOpFixture(entry: string, diagnostics: Diagnostic[]) {
  const loaded = await loadProgram(entry, diagnostics, {});
  expectNoErrorDiagnostics(diagnostics);
  expect(loaded).toBeDefined();
  return loaded!;
}

describe('op expansion and register-care', () => {
  it('expands an op call site into ordinary Z80 instructions in the object file', async () => {
    await withOpFixture(clearAOpSource, async (entry) => {
      const res = await compile(entry, binOnlyOptions, { formats: defaultFormatWriters });
      expectNoErrorDiagnostics(res.diagnostics);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toContain(0xaf);
    });
  });

  it('does not treat expanded op instructions as call boundaries in the register-care program model', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const model = buildRegisterCareProgramModel(loaded.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map((item) => item.head)).toContain('xor');
      expect(main!.instructions.map((item) => item.head)).not.toContain('clear_a');
      expect(main!.instructions.map((item) => item.head)).not.toContain('call');
    });
  });

  it('analyzes op call sites from post-expansion instructions', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const model = buildRegisterCareProgramModel(loaded.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const summary = inferRoutineSummary(main!);
      expect(summary.valueRelations).toContainEqual({ out: ['A'], from: [] });
      expect(summary.valueRelations).toContainEqual({ out: ['zero'], from: [] });
      expect(summary.mayWrite).toContain('sign');
    });
  });

  it('infers inline register transfer effects from expanded ops', async () => {
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

    await withOpFixture(source, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const model = buildRegisterCareProgramModel(loaded.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map((item) => item.head)).toEqual(['ld', 'ld', 'ret']);
      expect(model.directCallTargets).toEqual([]);
      const summary = inferRoutineSummary(main!);
      expect(summary.mayWrite).toContain('A');
      expect(summary.valueRelations).toContainEqual({ out: ['B'], from: [] });
    });
  });

  it('keeps register-care op expansion aligned with the emitted lowered stream', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);

      const model = buildRegisterCareProgramModel(loaded.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const registerCareStream = main!.instructions.map((instruction) => instruction.head);

      const lowered = await compilePlacedProgram(entry);
      expectNoErrorDiagnostics(lowered.diagnostics);
      const emittedStream = flattenLoweredInstructions(lowered.program)
        .map(formatLoweredInstruction)
        .filter((line) => !line.startsWith('@raw'))
        .map((line) => line.split(/\s+/, 1)[0]!.toLowerCase());

      expect(registerCareStream).toEqual(emittedStream);
      expect(registerCareStream).toEqual(['xor', 'ret']);
    });
  });

  it('summarizes stack effects from .asm op expansion', async () => {
    const source = ['op save_hl()', '  push hl', 'end', '', 'main:', '  save_hl', '  ret', ''].join(
      '\n',
    );
    await withOpFixture(source, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const model = buildRegisterCareProgramModel(loaded.program);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map((item) => item.head)).toEqual(['push', 'ret']);

      const summary = inferRoutineSummary(main!);
      expect(summary.stackBalanced).toBe(false);
    });
  });
});
