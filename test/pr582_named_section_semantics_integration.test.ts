import { describe, expect, it } from 'vitest';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Diagnostic } from '../src/diagnosticTypes.js';
import { compile } from '../src/compile.js';
import { parseProgram } from '../src/frontend/parser.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { buildEnv } from '../src/semantics/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR582 named section semantics integration', () => {
  it('accepts main inside a named code section when requireMain is enabled', async () => {
    const entry = join(__dirname, 'fixtures', 'pr582_main_in_named_section.zax');
    const res = await compile(entry, { requireMain: true }, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([]);
    expect(res.artifacts.length).toBeGreaterThan(0);
  });

  it('does not treat main inside a named data section as satisfying requireMain', async () => {
    const entry = join(__dirname, 'fixtures', 'pr582_main_in_named_data_section.zax');
    const res = await compile(entry, { requireMain: true }, { formats: defaultFormatWriters });

    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: 'Program must define a callable "main" entry function.',
      }),
    ]);
    expect(res.artifacts).toEqual([]);
  });

  it('builds env for consts and types declared inside named sections', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr582_section_env.zax',
      [
        'section data assets at $2000',
        '  const COUNT = 3',
        '  type WordPtr addr',
        'end',
      ].join('\n'),
      diagnostics,
    );
    expect(diagnostics).toEqual([]);

    const env = buildEnv(program, diagnostics);

    expect(diagnostics).toEqual([]);
    expect(env.consts.get('COUNT')).toBe(3);
    expect(env.types.has('WordPtr')).toBe(true);
  });
});
