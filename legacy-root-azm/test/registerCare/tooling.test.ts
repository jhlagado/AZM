import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeRegisterCareForTools,
  loadProgram,
  type RegisterCareCandidateDiagnostic,
} from '../../src/api-tooling.js';

describe('register-care tooling API', () => {
  it('returns LSP-ready output candidate diagnostics and code actions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-tools-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    call COPY',
        '    nop',
        '    inc de',
        '    ret',
        'COPY:',
        '    ld hl,Source',
        '    ld de,Dest',
        '    ld bc,4',
        '    ldir',
        '    ret',
        'Source:',
        '    db 1,2,3,4',
        'Dest:',
        '    ds 4',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const loaded = await loadProgram({ entryFile: entry });
    expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    if (!loaded.loadedProgram) throw new Error('expected loaded program');

    const result = analyzeRegisterCareForTools(loaded.loadedProgram, { mode: 'audit' });

    expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    expect(result.outputCandidates).toEqual([
      expect.objectContaining({
        file: entry,
        line: 3,
        column: 1,
        routine: 'COPY',
        carriers: ['D', 'E'],
        autoFixable: true,
      }),
    ]);
    expect(result.candidateDiagnostics).toEqual([
      expect.objectContaining<Partial<RegisterCareCandidateDiagnostic>>({
        kind: 'register-care-output-candidate',
        severity: 'info',
        file: entry,
        line: 3,
        column: 1,
        routine: 'COPY',
        carriers: ['D', 'E'],
        autoFixable: true,
        codeAction: {
          title: 'Confirm COPY output DE',
          kind: 'quickfix',
          edit: {
            file: entry,
            line: 3,
            column: 1,
            text: '; expects out DE\n',
          },
        },
      }),
    ]);
    expect(result.codeActions).toEqual([
      {
        title: 'Confirm COPY output DE',
        kind: 'quickfix',
        edit: {
          file: entry,
          line: 3,
          column: 1,
          text: '; expects out DE\n',
        },
      },
    ]);
  });

  it('does not request caller confirmation for inferred terminal outputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-tools-inferred-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    ld d,a',
        '    ret',
        'MASK:',
        '    ld c,a',
        '    ld a,$80',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const loaded = await loadProgram({ entryFile: entry });
    expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);
    if (!loaded.loadedProgram) throw new Error('expected loaded program');

    const result = analyzeRegisterCareForTools(loaded.loadedProgram, { mode: 'audit' });

    expect(result.outputCandidates).toEqual([]);
    expect(result.candidateDiagnostics).toEqual([]);
    expect(result.codeActions).toEqual([]);
  });
});
