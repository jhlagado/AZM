import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compile,
  defaultFormatWriters,
  loadProgram,
  type CompileNextFunctionOptions as CompilerOptions,
} from '../../../src/index.js';
import type { BinArtifact, D8mArtifact } from '../../../src/outputs/types.js';
import type { Diagnostic } from '../../../src/model/diagnostic.js';
import { buildRegisterContractsProgramModel } from '../../../src/register-contracts/programModel.js';
import { buildSummaries } from '../../../src/register-contracts/summaries.js';
import { getZ80InstructionEffect } from '../../../src/z80/effects.js';
import { withTempSource } from '../../helpers/temp_source.js';

const binOnlyOptions = {
  emitBin: true,
  emitHex: false,
  emitD8m: false,
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

function instructionHead(instruction: { instruction: { mnemonic: string } }): string {
  return instruction.instruction.mnemonic.toLowerCase();
}

async function withOpFixture<T>(
  source: string,
  callback: (entry: string, diagnostics: Diagnostic[]) => Promise<T>,
): Promise<T> {
  const diagnostics: Diagnostic[] = [];
  return withTempSource('azm-op-regcontracts-', 'asm', source, (entry) =>
    callback(entry, diagnostics),
  );
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
  routines: ReturnType<typeof buildRegisterContractsProgramModel>['routines'],
  name: string,
) {
  const routine = routines.find((item) => item.name === name);
  expect(routine).toBeDefined();
  return buildSummaries([routine!], new Map()).find((summary) => summary.name === name);
}

describe('op expansion and register-contracts', () => {
  it('expands an op call site into ordinary Z80 instructions in the object file', async () => {
    await withOpFixture(clearAOpSource, async (entry) => {
      const res = await compile(entry, binOnlyOptions, { formats: defaultFormatWriters });
      expectNoErrorDiagnostics(res.diagnostics);
      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      expect(Array.from(bin!.bytes)).toContain(0xaf);
    });
  });

  it('does not treat expanded op instructions as call boundaries in the register-contracts program model', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterContractsProgramModel(items);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const heads = main!.instructions.map(instructionHead);
      expect(heads).toContain('xor');
      expect(heads).not.toContain('clear_a');
      expect(heads).not.toContain('call');
      expect(main!.instructions.find((instruction) => instructionHead(instruction) === 'xor')).toMatchObject({
        file: entry,
        sourceUnit: entry,
        sourceRelation: 'entry',
        sourceUnitRelation: 'entry',
      });
    });
  });

  it('models imported op-expanded instructions at the call-site source location', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcontracts-imported-'));
    const entry = join(dir, 'main.asm');
    const ops = join(dir, 'ops.asm');
    writeFileSync(ops, ['op clear_a()', '  xor a', 'end', ''].join('\n'), 'utf8');
    writeFileSync(
      entry,
      ['.import "ops.asm"', '', 'main:', '  clear_a', '  ret', ''].join('\n'),
      'utf8',
    );

    const loaded = await loadProgram({ entryFile: entry });
    expectNoErrorDiagnostics(loaded.diagnostics);
    expect(loaded.loadedProgram).toBeDefined();
    const items = loaded.loadedProgram!.program.files[0]?.items ?? [];
    const model = buildRegisterContractsProgramModel(items);
    const main = model.routines.find((routine) => routine.name === 'main');

    expect(main).toBeDefined();
    expect(main!.instructions.map(instructionHead)).toEqual(['xor', 'ret']);
    expect(main!.instructions[0]).toMatchObject({
      file: entry,
      sourceUnit: entry,
      sourceRelation: 'entry',
      sourceUnitRelation: 'entry',
    });
  });

  it('classifies imported op-expanded tail jumps using the call-site source file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcontracts-imported-jp-'));
    const entry = join(dir, 'main.asm');
    const ops = join(dir, 'ops.asm');
    writeFileSync(ops, ['op jump_target()', '  jp TARGET', 'end', ''].join('\n'), 'utf8');
    writeFileSync(
      entry,
      ['.import "ops.asm"', '', '@START:', '  jump_target', 'TARGET:', '  ret', ''].join('\n'),
      'utf8',
    );

    const loaded = await loadProgram({ entryFile: entry });
    expectNoErrorDiagnostics(loaded.diagnostics);
    expect(loaded.loadedProgram).toBeDefined();
    const items = loaded.loadedProgram!.program.files[0]?.items ?? [];
    const model = buildRegisterContractsProgramModel(items);

    expect(model.directBoundaries).toEqual([]);
  });

  it('keeps imported op-expanded labels inside the call-site routine', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcontracts-imported-label-'));
    const entry = join(dir, 'main.asm');
    const ops = join(dir, 'ops.asm');
    writeFileSync(ops, ['op skip_a()', 'loop:', '  xor a', 'end', ''].join('\n'), 'utf8');
    writeFileSync(
      entry,
      ['.import "ops.asm"', '', 'main:', '  skip_a', '  ret', ''].join('\n'),
      'utf8',
    );

    const loaded = await loadProgram({ entryFile: entry });
    expectNoErrorDiagnostics(loaded.diagnostics);
    expect(loaded.loadedProgram).toBeDefined();
    const items = loaded.loadedProgram!.program.files[0]?.items ?? [];
    const model = buildRegisterContractsProgramModel(items);
    const main = model.routines.find((routine) => routine.name === 'main');

    expect(model.routines.map((routine) => routine.name)).toEqual(['main']);
    expect(main?.instructions.map(instructionHead)).toEqual(['xor', 'ret']);
    expect(main?.instructions[0]).toMatchObject({
      file: entry,
      sourceUnit: entry,
      sourceRelation: 'entry',
      sourceUnitRelation: 'entry',
    });
  });

  it('keeps imported op-expanded labels after emitted instructions inside the call-site routine', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcontracts-imported-label-after-'));
    const entry = join(dir, 'main.asm');
    const ops = join(dir, 'ops.asm');
    writeFileSync(ops, ['op foo()', '  xor a', 'loop:', '  inc a', 'end', ''].join('\n'), 'utf8');
    writeFileSync(entry, ['.import "ops.asm"', '', 'main:', '  foo', '  ret', ''].join('\n'), 'utf8');

    const loaded = await loadProgram({ entryFile: entry });
    expectNoErrorDiagnostics(loaded.diagnostics);
    expect(loaded.loadedProgram).toBeDefined();
    const items = loaded.loadedProgram!.program.files[0]?.items ?? [];
    const model = buildRegisterContractsProgramModel(items);
    const main = model.routines.find((routine) => routine.name === 'main');

    expect(model.routines.map((routine) => routine.name)).toEqual(['main']);
    expect(main?.instructions.map(instructionHead)).toEqual(['xor', 'inc', 'ret']);
  });

  it('keeps imported op-local label D8 symbols attributed to the op definition', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-op-regcontracts-d8-label-'));
    const entry = join(dir, 'main.asm');
    const ops = join(dir, 'ops.asm');
    writeFileSync(ops, ['op skip_a()', 'loop:', '  jr loop', 'end', ''].join('\n'), 'utf8');
    writeFileSync(entry, ['.import "ops.asm"', '.org $8000', 'main:', '  skip_a', '  ret', ''].join('\n'), 'utf8');

    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: true, sourceRoot: dir },
      { formats: defaultFormatWriters },
    );
    expectNoErrorDiagnostics(res.diagnostics);
    const d8 = res.artifacts.find((artifact): artifact is D8mArtifact => artifact.kind === 'd8m');
    const opLabel = d8?.json.symbols.find((symbol) => symbol.name.startsWith('__azm_op_skip_a_loop_'));

    expect(opLabel).toMatchObject({
      file: 'ops.asm',
      line: 2,
    });
  });

  it('analyzes op call sites from post-expansion instructions', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterContractsProgramModel(items);
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
      const model = buildRegisterContractsProgramModel(items);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      expect(main!.instructions.map(instructionHead)).toEqual(['ld', 'ld', 'ret']);
      expect(model.directCalls).toEqual([]);
      const summary = routineSummary(model.routines, 'main');
      expect(summary?.valueRelations).toEqual(expect.arrayContaining([{ out: ['B'], from: [] }]));
    });
  });

  it('keeps register-contracts op expansion aligned with the emitted lowered stream', async () => {
    await withOpFixture(clearAOpSource, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterContractsProgramModel(items);
      const main = model.routines.find((routine) => routine.name === 'main');
      expect(main).toBeDefined();
      const registerContractsStream = main!.instructions.map(instructionHead);

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

      expect(registerContractsStream).toEqual(emittedStream);
      expect(registerContractsStream).toEqual(['xor', 'ret']);
    });
  });

  it('summarizes stack effects from .asm op expansion', async () => {
    const source = ['op save_hl()', '  push hl', 'end', '', 'main:', '  save_hl', '  ret', ''].join(
      '\n',
    );
    await withOpFixture(source, async (entry, diagnostics) => {
      const loaded = await loadOpFixture(entry, diagnostics);
      const items = loaded.program.files[0]?.items ?? [];
      const model = buildRegisterContractsProgramModel(items);
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
