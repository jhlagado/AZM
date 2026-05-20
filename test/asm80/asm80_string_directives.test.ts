import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { parseClassicLine } from '../../src/frontend/asm80/classicLine.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Asm80Artifact, BinArtifact, D8mArtifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');
const classicParserPath = join(repoRoot, 'src', 'frontend', 'asm80', 'parseClassicSource.ts');
const classicAsm80Available = existsSync(classicParserPath);
const classicModuleLoweringAvailable = true;
const describeClassicCompile = classicModuleLoweringAvailable ? describe : describe.skip;

describe('ASM80 string directive recognition (.cstr/.pstr/.istr)', () => {
  it('recognizes classic string directives as raw data lines', () => {
    expect(parseClassicLine('/classic.z80', '.cstr "OK"', 1, 0)).toEqual({
      kind: 'rawData',
      directive: 'cstr',
      valuesText: '"OK"',
    });
    expect(parseClassicLine('/classic.z80', 'pstr_label: .pstr "OK"', 2, 0)).toEqual({
      kind: 'rawData',
      label: 'pstr_label',
      directive: 'pstr',
      valuesText: '"OK"',
    });
    expect(parseClassicLine('/classic.z80', 'istr_label: .istr "OK"', 3, 0)).toEqual({
      kind: 'rawData',
      label: 'istr_label',
      directive: 'istr',
      valuesText: '"OK"',
    });
  });
});

describeClassicCompile('ASM80 string directives (.cstr/.pstr/.istr)', () => {
  it('emits null-terminated, length-prefixed, and high-bit-terminated strings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-string-'));
    const entry = join(dir, 'string-directives.z80');
    writeFileSync(
      entry,
      ['.org 0100H', 'cstr_label:', '  .cstr "OK"', 'pstr_label:', '  .pstr "OK"', 'istr_label:', '  .istr "OK"'].join(
        '\n',
      ),
      'utf8',
    );
    const res = await compile(entry, { emitAsm80: true }, { formats: defaultFormatWriters });
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const asm80 = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(d8m).toBeDefined();
    expect(bin).toBeDefined();
    expect(asm80).toBeDefined();
    if (!d8m || !bin || !asm80) throw new Error('missing artifacts');

    const bytes = [...bin.bytes.slice(0, 8)];
    expect(bytes).toEqual([0x4f, 0x4b, 0x00, 0x02, 0x4f, 0x4b, 0x4f, 0xcb]);
    expect(asm80.text).toContain('DB $4F, $4B, $00');
    expect(asm80.text).toContain('DB $02, $4F, $4B');
    expect(asm80.text).toContain('DB $4F, $CB');
  });
});

if (!classicAsm80Available || !classicModuleLoweringAvailable) {
  describe('ASM80 string directives (.cstr/.pstr/.istr)', () => {
    it.todo('BLOCKED: enable compile assertion when classic module parsing/lowering emits raw data');
  });
}
