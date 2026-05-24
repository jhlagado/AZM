import { describe, expect, it } from 'vitest';

import {
  compile,
  defaultFormatWriters,
  loadProgram,
  type CompileNextFunctionOptions as CompilerOptions,
} from '../../../src/index.js';
import type { BinArtifact } from '../../../src/outputs/types.js';
import type { Diagnostic } from '../../../src/model/diagnostic.js';
import { buildRegisterCareProgramModel } from '../../../src/register-care/programModel.js';
import { buildSummaries } from '../../../src/register-care/summaries.js';
import { getZ80InstructionEffect } from '../../../src/z80/effects.js';
import { withTempSource } from '../../helpers/temp_source.js';

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

function instructionHead(
  instruction: { instruction: { mnemonic: string } },
): string {
  return instruction.instruction.mnemonic.toLowerCase();
}

async function withOpFixture<T>(
  source: string,
  callback: (entry: string, diagnostics: Diagnostic[]) => Promise<T>,
): Promise<T> {
  const diagnostics: Diagnostic[] = [];
  return withTempSource('azm-op-regcare-', 'asm', source, (entry) => callback(entry, diagnostics));
}

function expectNoErrorDiagnostics(diagnostics: readonly Diagnostic[]): void {
  expect(diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
}

async function loadOpFixture(entry: string, diagnostics: Diagnostic[]) {
  const loaded = await loadProgram({ entryFile: entry });
  diagnostics.push(...loaded.diagnostics);
  expectNoErrorDiagnostics(diagnostics);
  expect(loaded.loadedProgram).toBeDefined();
  return loaded.loadedProgram!;
}

function routineSummary(
  routines: ReturnType<typeof buildRegisterCareProgramModel>['routines'],
  name: string,
) {
  const routine = routines.find((item) => item.name === name);
  expect(routine).toBeDefined();
  return buildSummaries([routine!], new Map()).find((summary) => summary.name === name);
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
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterCareProgramModel(items);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const heads = main!.instructions.map(instructionHead);
      expect(heads).toContain('xor');
      expect(heads).not.toContain('clear_a');
      expect(heads).not.toContain('call');
    });
  });

  it('analyzes op call sites from post-expansion instructions', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterCareProgramModel(items);
      const summary = routineSummary(model.routines, 'main');
      expect(summary?.valueRelations).toEqual(
        expect.arrayContaining([
          { out: ['A'], from: [] },
          { out: ['zero'], from: [] },
        ]),
      );
      expect(summary?.mayWrite).toEqual(expect.arrayContaining(['sign']));
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
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterCareProgramModel(items);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map(instructionHead)).toEqual(['ld', 'ld', 'ret']);
      expect(model.directCalls).toEqual([]);
      const summary = routineSummary(model.routines, 'main');
      expect(summary?.valueRelations).toEqual(
        expect.arrayContaining([{ out: ['B'], from: [] }]),
      );
    });
  });

  it('keeps register-care op expansion aligned with the emitted lowered stream', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterCareProgramModel(items);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const registerCareStream = main!.instructions.map(instructionHead);

      const emitted = await compile(
        entry,
        { ...binOnlyOptions, emitBin: false, emitAsm80: true },
        { formats: defaultFormatWriters },
      );
      expectNoErrorDiagnostics(emitted.diagnostics);
      const asm80 = emitted.artifacts.find(
        (artifact): artifact is { kind: 'asm80'; text: string } => artifact.kind === 'asm80',
      );
      expect(asm80).toBeDefined();
      const emittedStream = instructionHeadsFromAsm80(asm80!.text);

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
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterCareProgramModel(items);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map(instructionHead)).toEqual(['push', 'ret']);

      const stackKinds = main!.instructions.map(
        (item) => getZ80InstructionEffect(item.instruction).stack.kind,
      );
      expect(stackKinds).toContain('push');
      expect(stackKinds.filter((kind) => kind === 'push').length).toBeGreaterThan(
        stackKinds.filter((kind) => kind === 'pop').length,
      );
    });
  });
});

function instructionHeadsFromAsm80(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith(';'))
    .filter((line) => !line.endsWith(':'))
    .filter((line) => !/^ORG\b/i.test(line))
    .map((line) => line.split(/\s+/, 1)[0]!.toLowerCase());
}
