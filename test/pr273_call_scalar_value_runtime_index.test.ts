import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { compile } from '../src/compile.js';
import { defaultFormatWriters } from '../src/formats/index.js';
import { expectDiagnostic } from './helpers/diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR273: typed call arg value semantics vs direct ea budget', () => {
  it('reports the direct call-site ea budget for runtime-indexed named-section data args', async () => {
    const entry = join(__dirname, 'fixtures', 'pr273_call_scalar_runtime_index_value_ok.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      messageIncludes:
        'Direct call-site ea argument for "sink" must be runtime-atom-free in v0.2',
    });
  });

  it('still rejects runtime call-site address ea args that must remain atom-free in v0.2', async () => {
    const entry = join(__dirname, 'fixtures', 'pr273_call_address_runtime_index_reject.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });

    expect(res.artifacts).toEqual([]);
    expect(res.diagnostics).toHaveLength(1);
    expectDiagnostic(res.diagnostics, {
      messageIncludes:
        'Direct call-site ea argument for "takeAddr" must be runtime-atom-free in v0.2',
    });
  });
});
