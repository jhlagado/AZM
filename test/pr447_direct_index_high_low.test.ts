import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact } from '../src/formats/types.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';
import {
  compilePlacedProgram,
  flattenLoweredInstructions,
  isReg,
} from './helpers/lowered_program.js';

type IndexedFamily = {
  prefix: number;
  lanes: readonly ['IXH', 'IXL'] | readonly ['IYH', 'IYL'];
  regs: readonly string[];
};

type IndexedLane = 'IXH' | 'IXL' | 'IYH' | 'IYL';

const indexedFamilies: readonly IndexedFamily[] = [
  { prefix: 0xdd, lanes: ['IXH', 'IXL'], regs: ['A', 'B', 'C', 'D', 'E', 'IXH', 'IXL'] },
  { prefix: 0xfd, lanes: ['IYH', 'IYL'], regs: ['A', 'B', 'C', 'D', 'E', 'IYH', 'IYL'] },
];

const regCode = new Map<string, number>([
  ['B', 0],
  ['C', 1],
  ['D', 2],
  ['E', 3],
  ['H', 4],
  ['L', 5],
  ['A', 7],
  ['IXH', 4],
  ['IXL', 5],
  ['IYH', 4],
  ['IYL', 5],
]);

async function compileSource(source: string) {
  const dir = await mkdtemp(join(tmpdir(), 'zax-pr447-'));
  const entry = join(dir, 'main.zax');
  await writeFile(entry, source, 'utf8');
  const res = await compile(
    entry,
    { emitBin: true, emitHex: false, emitListing: false, emitD8m: false },
    { formats: defaultFormatWriters },
  );
  return { entry, res };
}

function buildProgram(lines: readonly string[]): string {
  return `export func main(): AF, BC, DE, HL\n${lines.map((line) => `  ${line}`).join('\n')}\nend\n`;
}

describe('PR447: direct IXH/IXL/IYH/IYL forms', () => {
  it('accepts the full directly encodable load matrix for the supported families', async () => {
    const lines: string[] = [];
    const expected: number[] = [];

    for (const family of indexedFamilies) {
      const familyLanes = new Set<IndexedLane>(family.lanes);
      for (const dst of family.regs) {
        for (const src of family.regs) {
          const touchesLane =
            familyLanes.has(dst as IndexedLane) || familyLanes.has(src as IndexedLane);
          if (!touchesLane) continue;

          lines.push(`ld ${dst.toLowerCase()}, ${src.toLowerCase()}`);
          expected.push(
            family.prefix,
            0x40 + ((regCode.get(dst)! & 0x07) << 3) + (regCode.get(src)! & 0x07),
          );
        }
      }
    }
    expected.push(0xc9);

    const { entry, res } = await compileSource(buildProgram(lines));
    expectNoDiagnostics(res.diagnostics);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    expect(bin).toBeDefined();

    expect(Array.from(bin!.bytes)).toEqual(expected);

    const lowered = await compilePlacedProgram(entry);
    expect(lowered.diagnostics).toEqual([]);
    const instrs = flattenLoweredInstructions(lowered.program);
    expect(instrs.some((ins) => ins.head === 'push')).toBe(false);
    expect(instrs.some((ins) => ins.head === 'pop')).toBe(false);
    expect(
      instrs.some(
        (ins) => ins.head === 'ex' && isReg(ins.operands[0], 'DE') && isReg(ins.operands[1], 'HL'),
      ),
    ).toBe(false);
  });

  it('rejects the explicit unsupported edge of the first slice', async () => {
    const lines = [
      'ld h, ixh',
      'ld l, ixl',
      'ld ixh, h',
      'ld ixl, l',
      'ld h, iyh',
      'ld l, iyl',
      'ld iyh, h',
      'ld iyl, l',
      'ld ixh, iyh',
      'ld ixl, iyl',
      'ld iyh, ixh',
      'ld iyl, ixl',
    ];

    const { res } = await compileSource(buildProgram(lines));
    expectDiagnostic(res.diagnostics, {
      message: 'ld with IX*/IY* does not support legacy H/L counterpart operands',
    });
    expectDiagnostic(res.diagnostics, {
      message: 'ld between IX* and IY* byte registers is not supported',
    });
    expect(res.diagnostics).toHaveLength(lines.length);
  });
});
