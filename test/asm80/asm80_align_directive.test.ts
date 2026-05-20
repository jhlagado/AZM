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

function getBinBase(d8m: D8mArtifact): number {
  const segments = d8m.json.segments as Array<{ start: number; end: number }>;
  return Math.min(...segments.map((segment) => segment.start));
}

describe('ASM80 .align directive recognition', () => {
  it('recognizes .align as an alignment directive line', () => {
    expect(parseClassicLine('/classic.z80', '.align 4', 1, 0)).toEqual({
      kind: 'align',
      exprText: '4',
    });
  });
});

describeClassicCompile('ASM80 .align directive', () => {
  it('advances the current output address to the next alignment boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-asm80-align-'));
    const entry = join(dir, 'align-directive.z80');
    writeFileSync(entry, ['.org 0101H', '.db 0AAH', '.align 4', '.db 055H'].join('\n'), 'utf8');
    const res = await compile(
      entry,
      { sourceMode: 'asm80', emitAsm80: true },
      { formats: defaultFormatWriters },
    );
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const asm80 = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
    expect(d8m).toBeDefined();
    expect(bin).toBeDefined();
    expect(asm80).toBeDefined();
    if (!d8m || !bin || !asm80) throw new Error('missing artifacts');

    const base = getBinBase(d8m);
    expect(bin.bytes[0x0101 - base]).toBe(0xaa);
    expect(bin.bytes[0x0104 - base]).toBe(0x55);
    expect(asm80.text).toContain('DS $02, $00');
  });
});

if (!classicAsm80Available || !classicModuleLoweringAvailable) {
  describe('ASM80 .align directive', () => {
    it.todo('BLOCKED: enable compile assertion when classic module parsing/lowering emits aligned data');
  });
}
