import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

function writeTempAsm(source: string): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'azm-address-of-'));
  const entry = join(dir, 'entry.asm');
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('PR287 explicit address-of operator (@place)', () => {
  it('rejects @place in assembly instructions as ordinary unsupported operand syntax', async () => {
    const { entry, cleanup } = writeTempAsm(['org $1000', 'b:', '  db 0', 'main:', '  ld hl,@b', '  ret', ''].join('\n'));
    try {
      const res = await compile(
        entry,
        { emitBin: false, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );

      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: 'Unsupported operand: @b',
      });
    } finally {
      cleanup();
    }
  });

  it('rejects invalid @ targets as ordinary unsupported operand syntax', async () => {
    const { entry, cleanup } = writeTempAsm(['main:', '  ld hl,@', '  ld hl,@(3 + 2)', '  ld hl,@3', ''].join('\n'));
    try {
      const res = await compile(entry, {}, { formats: defaultFormatWriters });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: 'Unsupported operand: @',
      });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: 'Unsupported operand: @(3 + 2)',
      });
      expectDiagnostic(res.diagnostics, {
        severity: 'error',
        message: 'Unsupported operand: @3',
      });
    } finally {
      cleanup();
    }
  });
});
