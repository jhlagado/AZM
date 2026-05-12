import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStartupInitRegion } from '../src/lowering/startupInit.js';
import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import type { BinArtifact, D8mArtifact } from '../src/formats/types.js';
import type { PlacedNamedSectionContribution } from '../src/lowering/sectionPlacement.js';
import type { NamedSectionContributionSink } from '../src/lowering/sectionContributions.js';
import { createNonBankedSectionKey } from '../src/sectionKeys.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fakeSink(
  section: 'code' | 'data',
  name: string,
  bytes: Array<[number, number]>,
  startupInitActions: NamedSectionContributionSink['startupInitActions'] = [],
): NamedSectionContributionSink {
  const created = createNonBankedSectionKey(section, name);
  if (!created) {
    throw new Error(`Invalid section key test fixture: ${section} ${name}`);
  }

  const node = {
    kind: 'NamedSection' as const,
    span: { file: 'x', start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } },
    section,
    name,
    items: [],
  };
  return {
    anchor: {
      keyId: created.keyId,
      key: created.key,
      node,
      moduleIndex: 0,
      itemIndex: 0,
      order: 0,
    },
    contribution: {
      key: created.key,
      keyId: created.keyId,
      node,
      moduleIndex: 0,
      itemIndex: 0,
      order: 0,
    },
    bytes: new Map(bytes),
    offset: bytes.length === 0 ? 0 : Math.max(...bytes.map(([o]) => o)) + 1,
    pendingSymbols: [],
    fixups: [],
    rel8Fixups: [],
    sourceSegments: [],
    currentSourceTag: undefined,
    startupInitActions,
  };
}

describe('PR577 startup init region', () => {
  it('builds deterministic copy entries and blob bytes for writable data sections', () => {
    const placed: PlacedNamedSectionContribution[] = [
      {
        sink: fakeSink(
          'data',
          'vars',
          [[0, 1], [1, 2], [3, 4]],
          [
            { kind: 'copy', offset: 0, length: 2 },
            { kind: 'zero', offset: 2, length: 1 },
            { kind: 'copy', offset: 3, length: 1 },
          ],
        ),
        baseAddress: 0x4000,
      },
      { sink: fakeSink('code', 'boot', [[0, 0xc9]]), baseAddress: 0x1000 },
    ];

    const region = buildStartupInitRegion(placed);
    expect(region.copyEntries).toEqual([
      { kind: 'copy', destination: 0x4000, sourceOffset: 0, length: 2 },
      { kind: 'copy', destination: 0x4003, sourceOffset: 2, length: 1 },
    ]);
    expect(region.zeroEntries).toEqual([
      { kind: 'zero', destination: 0x4002, length: 1 },
    ]);
    expect(region.blob).toEqual([1, 2, 4]);
    expect(region.encoded).toEqual([
      0x02, 0x00,
      0x00, 0x40, 0x00, 0x00, 0x02, 0x00,
      0x03, 0x40, 0x02, 0x00, 0x01, 0x00,
      0x01, 0x00,
      0x02, 0x40, 0x01, 0x00,
      0x01, 0x02, 0x04,
    ]);
  });

  it('emits a compiler-owned init region for named data sections', async () => {
    const entry = join(__dirname, 'fixtures', 'pr577_startup_init_main.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(bin).toBeDefined();
    expect(d8m).toBeDefined();
    const bytes = Array.from(bin!.bytes);
    expect(bytes.slice(0, 6)).toEqual([0x00, 0x61, 0x62, 0x63, 0x01, 0x00]);

    const generator = d8m!.json.generator as { entrySymbol?: string; entryAddress?: number };
    expect(generator.entrySymbol).toBe('__zax_startup');
    expect(generator.entryAddress).toBeGreaterThan(0x4010);
    const entryOffset = (generator.entryAddress ?? 0) - 0x4000;
    expect(bytes[entryOffset]).toBe(0x21);

    expect(bytes.slice(-24)).toEqual([
      0x02, 0x00,
      0x01, 0x40, 0x00, 0x00, 0x03, 0x00,
      0x04, 0x40, 0x03, 0x00, 0x02, 0x00,
      0x01, 0x00,
      0x00, 0x40, 0x01, 0x00,
      0x61, 0x62, 0x63, 0x01,
    ]);
  });
});
