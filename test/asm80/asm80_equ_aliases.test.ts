import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Asm80Artifact, BinArtifact } from '../../src/formats/types.js';

describe('ASM80 classic EQU aliases', () => {
  it('resolves classic equates used as absolute memory operands', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-equ-abs-mem-'));
    const entry = join(dir, 'equ-abs-mem.z80');
    writeFileSync(
      entry,
      ['.org 0100H', 'BUF: .equ 0900H', 'ld hl,(BUF)', '.binfrom 0100H', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x2a, 0x00, 0x09]);
  });

  it('resolves classic equ aliases to exact labels after DS reservations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-ds-equ-alias-'));
    const entry = join(dir, 'ds-equ-alias.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ld (GAME_OVER_KEY_GATE_LO),hl',
        'GAME_OVER_KEY_GATE:',
        'ds 2',
        'GAME_OVER_KEY_GATE_LO equ GAME_OVER_KEY_GATE',
        'CODE:',
        'ld hl,(GAME_OVER_KEY_GATE_LO)',
        'TARGET:',
        'db 0',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([
      0x22,
      0x03,
      0x40,
      0x00,
      0x00,
      0x2a,
      0x03,
      0x40,
      0x00,
    ]);
  });

  it('resolves classic equ aliases declared before their target label', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-forward-equ-target-'));
    const entry = join(dir, 'forward-equ-target.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET',
        'ld hl,(ALIAS)',
        'TARGET:',
        'db 0',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x2a, 0x03, 0x40, 0x00]);
  });

  it('resolves compound classic equ aliases through forward aliases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-compound-forward-equ-'));
    const entry = join(dir, 'compound-forward-equ.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET',
        'ALIAS_PLUS equ ALIAS+1',
        'ld hl,(ALIAS_PLUS)',
        'TARGET:',
        'db 0,0',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x2a, 0x04, 0x40, 0x00, 0x00]);
  });

  it('resolves repeated aliases inside a classic equ expression', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-repeated-forward-equ-'));
    const entry = join(dir, 'repeated-forward-equ.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET',
        'SUM equ ALIAS+ALIAS',
        'dw SUM',
        'TARGET:',
        'db 0AAH',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x04, 0x80, 0xaa]);
  });

  it('preserves current-location context for deferred classic equ aliases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-forward-equ-current-'));
    const entry = join(dir, 'forward-equ-current.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET+($-$)',
        'ld hl,(ALIAS)',
        'TARGET:',
        'db 0',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x2a, 0x03, 0x40, 0x00]);
  });

  it('rejects labels that shadow unresolved classic equ aliases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-equ-shadow-'));
    const entry = join(dir, 'equ-shadow.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET',
        'ld hl,(ALIAS)',
        'ALIAS:',
        'db 0',
        'TARGET:',
        'db 0',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(
      res.diagnostics.some(
        (d) => d.severity === 'error' && d.message.includes('Duplicate symbol name "ALIAS"'),
      ),
    ).toBe(true);
  });

  it('resolves forward classic equ aliases in word data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-forward-equ-dw-'));
    const entry = join(dir, 'forward-equ-dw.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET',
        'dw ALIAS',
        'TARGET:',
        'db 0AAH',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x02, 0x40, 0xaa]);
  });

  it('keeps forward classic equ aliases self-contained in emitted asm80', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-forward-equ-asm80-'));
    const entry = join(dir, 'forward-equ-asm80.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET',
        'dw ALIAS',
        'TARGET:',
        'db 0AAH',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, { emitAsm80: true }, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const asm80 = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(asm80).toBeDefined();
    if (!asm80) throw new Error('missing asm80 artifact');
    expect(asm80.text).toContain('ALIAS EQU $4002');
    expect(asm80.text).toContain('DW ALIAS');
  });

  it('resolves forward classic equ aliases in byte data', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'zax-asm80-forward-equ-db-'));
    const entry = join(dir, 'forward-equ-db.asm');
    writeFileSync(
      entry,
      [
        'org 4000H',
        'ALIAS equ TARGET',
        'db ALIAS',
        'TARGET:',
        'db 0AAH',
        'binfrom 4000H',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();
    if (!bin) throw new Error('missing bin artifact');
    expect([...bin.bytes]).toEqual([0x01, 0xaa]);
  });
});
