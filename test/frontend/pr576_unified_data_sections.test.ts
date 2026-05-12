import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { D8mArtifact } from '../../src/formats/types.js';
import { expectDiagnostic } from '../helpers/diagnostics/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR576 unified data declarations inside data sections', () => {
  it('parses direct declarations in data sections and rejects them in code sections', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr576_sections.zax',
      [
        'section data vars',
        '  count: byte',
        'end',
        'section code boot',
        '  temp: byte',
        'end',
      ].join('\n'),
      diagnostics,
    );

    const dataSection = program.files[0]?.items[0];
    expect(dataSection).toMatchObject({
      kind: 'NamedSection',
      section: 'data',
    });
    if (!dataSection || dataSection.kind !== 'NamedSection') {
      throw new Error('expected data section');
    }
    expect(dataSection.items[0]).toMatchObject({
      kind: 'DataDecl',
      name: 'count',
      initializer: { kind: 'InitZero' },
    });

    expect(diagnostics).toHaveLength(1);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      message: 'Data declarations are only permitted inside data sections.',
      line: 5,
      column: 1,
    });
  });

  it('lowers direct data declarations in named data sections', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr576_named_data_decls.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const d8m = res.artifacts.find((a): a is D8mArtifact => a.kind === 'd8m');
    expect(d8m).toBeDefined();
    const symbols = d8m!.json.symbols as Array<{ name: string; address: number }>;
    expect(symbols.find((s) => s.name === 'counter')?.address).toBe(0x4000);
    expect(symbols.find((s) => s.name === 'message')?.address).toBe(0x4001);
    expect(symbols.find((s) => s.name === 'flag')?.address).toBe(0x4004);
  });
});
