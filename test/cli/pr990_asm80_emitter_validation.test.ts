import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { Asm80Artifact, HexArtifact } from '../../src/formats/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type HexMap = Map<number, number>;

/**
 * Some environments (notably certain CI images) expose an unrelated `asm80` on PATH that
 * answers `-h` but does not implement the ZAX/ASM80 CLI or two-operand ALU syntax. Skip
 * verification when the probe assemble fails so macOS CI does not flake on the wrong tool.
 */
function verifyAsm80Cli(executable: string): boolean {
  const probeDir = mkdtempSync(join(tmpdir(), 'zax-asm80-probe-'));
  try {
    const probeAsm = join(probeDir, 'probe.z80');
    const probeHex = join(probeDir, 'probe.hex');
    writeFileSync(
      probeAsm,
      ['org 0', '; two-operand form used in ZAX lowered output', 'sub a, b', ''].join('\n'),
      'utf8',
    );
    const r = spawnSync(executable, ['-m', 'Z80', '-t', 'hex', '-o', probeHex, probeAsm], {
      encoding: 'utf8',
    });
    return r.status === 0;
  } finally {
    try {
      rmSync(probeDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function findAsm80(): string | undefined {
  const envPath = process.env.ASM80 ?? process.env.ASM80_PATH;
  const candidate = envPath && envPath.trim().length > 0 ? envPath.trim() : 'asm80';
  const help = spawnSync(candidate, ['-h'], { encoding: 'utf8' });
  if (help.error && (help.error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
  if (!verifyAsm80Cli(candidate)) return undefined;
  return candidate;
}

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
        `[asm80-verify] ${label} mismatch at $${addr
          .toString(16)
          .toUpperCase()
          .padStart(4, '0')}: expected=${hex(exp)} actual=${hex(act)}`,
      );
    }
  }
}

describe('ASM80 emitter', () => {
  it('assembles emitted ASM80 into bytes that match direct HEX output', async () => {
    const asm80 = findAsm80();
    if (!asm80) return;

    const fixtures = [
      // Raw asm basics / labels / constants
      join(__dirname, '..', 'fixtures', 'pr24_isa_core.zax'),
      join(__dirname, '..', 'fixtures', 'pr37_forward_label_call.zax'),
      join(__dirname, '..', 'fixtures', 'pr4_enum.zax'),
      // Typed/global storage
      join(__dirname, '..', 'fixtures', 'pr405_byte_global_scalar_symbols.zax'),
      join(__dirname, '..', 'fixtures', 'pr406_word_global_scalar_accessors.zax'),
      join(__dirname, '..', 'fixtures', 'pr713_packed_top_level_arrays.zax'),
      // Frame-related lowering
      join(__dirname, '..', 'fixtures', 'pr330_frame_access_positive.zax'),
      join(__dirname, '..', 'fixtures', 'pr406_word_frame_scalar_accessors.zax'),
      join(__dirname, '..', 'fixtures', 'pr952_raw_ix_slot_offsets_ok.zax'),
      // Alias cases
      join(__dirname, '..', 'fixtures', 'pr980_local_alias_raw_scalar.zax'),
      join(__dirname, '..', 'fixtures', 'pr980_local_alias_raw_aggregate.zax'),
      // Sections and placement
      join(__dirname, '..', 'fixtures', 'pr9_section_code_at.zax'),
      join(__dirname, '..', 'fixtures', 'pr585_named_section_order_root.zax'),
      // Startup init
      join(__dirname, '..', 'fixtures', 'pr577_startup_init_main.zax'),
      // Comments present (byte output unchanged)
      join(__dirname, '..', 'fixtures', 'pr991_comment_preservation.zax'),
      // Raw data directives
      join(__dirname, '..', 'fixtures', 'pr786_raw_data_lowering.zax'),
    ];

    for (const entry of fixtures) {
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
      expect(res.diagnostics).toEqual([]);

      const hex = res.artifacts.find((a): a is HexArtifact => a.kind === 'hex');
      const asm80Artifact = res.artifacts.find((a): a is Asm80Artifact => a.kind === 'asm80');
      expect(hex).toBeDefined();
      expect(asm80Artifact).toBeDefined();

      const tempDir = await mkdtemp(join(tmpdir(), 'zax-asm80-'));
      const asmPath = join(tempDir, 'program.z80');
      const outHex = join(tempDir, 'program.hex');
      await writeFile(asmPath, asm80Artifact!.text, 'utf8');

      const result = spawnSync(asm80, ['-m', 'Z80', '-t', 'hex', '-o', outHex, asmPath], {
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        throw new Error(
          [
            '[asm80-verify] asm80 failed',
            `entry=${entry}`,
            `status=${result.status}`,
            result.stderr ?? '',
          ].join('\n'),
        );
      }

      const asmHexText = await readFile(outHex, 'utf8');
      const directMap = parseIntelHex(hex!.text);
      const asmMap = parseIntelHex(asmHexText);
      assertSameHexMap(entry, directMap, asmMap);
    }
  });
});
