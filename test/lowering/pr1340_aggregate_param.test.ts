import { describe, it } from 'vitest';
import { join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectNoErrors } from '../helpers/diagnostics.js';

describe('PR1340 aggregate record parameters as addr-width at call sites', () => {
  it('compiles recursive search with TreeNode parameter and typed calls', async () => {
    const entry = join(__dirname, '..', 'fixtures', 'pr1340_aggregate_param.zax');
    const res = await compile(entry, {}, { formats: defaultFormatWriters });
    expectNoErrors(res.diagnostics);
  });
});
