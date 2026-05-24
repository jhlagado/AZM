import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { compile } from '../../src/api-compile.js';
import { defaultFormatWriters } from '../../src/outputs/index.js';
import type { Asm80Artifact, HexArtifact } from '../../src/outputs/types.js';
import { resolveVerifiedAsm80Executable } from '../helpers/asm80_acceptance.js';

const fixtureDir = join(import.meta.dirname, '..', 'fixtures');

type HexMap = Map<number, number>;

function parseIntelHex(text: string): HexMap {
  const map = new Map<number, number>();
  let base = 0;
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  for (const line of lines) {
    if (!line.startsWith(':')) continue;
    const len = Number.parseInt(line.slice(1, 3), 16);
    const addr = Number.parseInt(line.slice(3, 7), 16);
    const type = Number.parseInt(line.slice(7, 9), 16);
    const data = line.slice(9, 9 + len * 2);
    if (type === 0x00) {
      for (let i = 0; i < len; i++) {
        const byte = Number.parseInt(data.slice(i * 2, i * 2 + 2), 16);
        map.set(base + addr + i, byte);
      }
    } else if (type === 0x04) {
      base = Number.parseInt(data, 16) << 16;
    } else if (type === 0x01) {
      break;
    }
  }
  return map;
}

function assertSameHexMap(label: string, expected: HexMap, actual: HexMap): void {
  const allKeys = new Set<number>([...expected.keys(), ...actual.keys()]);
  const sorted = [...allKeys].sort((a, b) => a - b);
  for (const addr of sorted) {
    const exp = expected.get(addr);
    const act = actual.get(addr);
    if (exp !== act) {
      const hex = (v: number | undefined) =>
        v === undefined ? '<none>' : `$${v.toString(16).toUpperCase().padStart(2, '0')}`;
      throw new Error(
        `[asm80-roundtrip] ${label} mismatch at $${addr
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}: expected=${hex(exp)} actual=${hex(act)}`,
      );
    }
  }
}

const ROUNDTRIP_FIXTURES = [
  'pr24_isa_core.asm',
  'pr37_forward_label_call.asm',
  'pr713_packed_top_level_arrays.asm',
  'pr991_comment_preservation.asm',
] as const;

const asm80ForRoundtrip = resolveVerifiedAsm80Executable();
const describeRoundtrip = asm80ForRoundtrip ? describe : describe.skip;

describeRoundtrip('ASM80 external round-trip (PR990 coverage)', () => {
  it('assembles emitted ASM80 into bytes that match direct HEX output', async () => {
    const asm80 = asm80ForRoundtrip!;

    for (const fixture of ROUNDTRIP_FIXTURES) {
      const entry = join(fixtureDir, fixture);
      const res = await compile(
        entry,
        {
          emitHex: true,
          emitBin: false,
          emitD8m: false,
          emitListing: false,
          emitAsm80: true,
        },
        { formats: defaultFormatWriters },
      );
      expect(res.diagnostics, fixture).toEqual([]);

      const hex = res.artifacts.find((a): a is HexArtifact => a.kind === 'hex');
      const asm80Artifact = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
      expect(hex, fixture).toBeDefined();
      expect(asm80Artifact, fixture).toBeDefined();

      const tempDir = await mkdtemp(join(tmpdir(), 'azm-asm80-'));
      const asmPath = join(tempDir, 'program.z80');
      const outHex = join(tempDir, 'program.hex');
      await writeFile(asmPath, asm80Artifact!.text, 'utf8');

      const result = spawnSync(asm80, ['-m', 'Z80', '-t', 'hex', '-o', 'program.hex', 'program.z80'], {
        cwd: tempDir,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(
          [
            '[asm80-roundtrip] asm80 failed',
            `fixture=${fixture}`,
            `status=${result.status}`,
            result.stderr ?? '',
            '--- emitted asm80 ---',
            asm80Artifact!.text,
          ].join('\n'),
        );
      }

      const asmHexText = await readFile(outHex, 'utf8');
      const directMap = parseIntelHex(hex!.text);
      const asmMap = parseIntelHex(asmHexText);
      assertSameHexMap(fixture, directMap, asmMap);
    }
  });
});
