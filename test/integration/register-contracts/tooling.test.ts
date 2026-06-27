import { mkdtempSync, writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeRegisterContractsForTools,
  loadProgram,
  type RegisterContractsCandidateDiagnostic,
} from '../../../src/index.js';

describe('register-contracts tooling API', () => {
  it('returns LSP-ready output candidate diagnostics and code actions', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tools-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    call COPY',
        '    inc de',
        '    ret',
        'COPY:',
        '    ld hl,Source',
        '    ld de,Dest',
        '    ld bc,4',
        '    ldir',
        '    ret',
        'Source:',
        '    .db 1,2,3,4',
        'Dest:',
        '    .ds 4',
        '.end',
      ].join('\n'),
      'utf8',
    );

    try {
      const loaded = await loadProgram({ entryFile: entry });
      expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual(
        [],
      );
      if (!loaded.loadedProgram) throw new Error('expected loaded program');

      const result = analyzeRegisterContractsForTools(loaded.loadedProgram, { mode: 'audit' });

      expect(result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual(
        [],
      );
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'definite_contract_violation',
            file: entry,
            line: 3,
            column: 5,
            callTarget: 'COPY',
            carriers: ['D', 'E'],
          }),
          expect.objectContaining({
            kind: 'output_candidate',
            file: entry,
            line: 3,
            column: 5,
            routine: 'COPY',
            carriers: ['D', 'E'],
            autoFixable: true,
          }),
        ]),
      );
      expect(result.outputCandidates).toEqual([
        expect.objectContaining({
          file: entry,
          line: 3,
          column: 5,
          routine: 'COPY',
          carriers: ['D', 'E'],
          autoFixable: true,
        }),
      ]);
      expect(result.candidateDiagnostics).toEqual([
        expect.objectContaining<Partial<RegisterContractsCandidateDiagnostic>>({
          kind: 'register-contracts-output-candidate',
          severity: 'info',
          file: entry,
          line: 3,
          column: 5,
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
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not request caller confirmation for inferred terminal outputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tools-inferred-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    ret',
        'MASK:',
        '    ld c,a',
        '    ld a,$80',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    try {
      const loaded = await loadProgram({ entryFile: entry });
      expect(loaded.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual(
        [],
      );
      if (!loaded.loadedProgram) throw new Error('expected loaded program');

      const result = analyzeRegisterContractsForTools(loaded.loadedProgram, { mode: 'audit' });

      expect(result.outputCandidates).toEqual([]);
      expect(result.candidateDiagnostics).toEqual([]);
      expect(result.codeActions).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
