import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type {
  RegisterCareInterfaceArtifact,
  RegisterCareReportArtifact,
} from '../../src/formats/types.js';

function writeConflictFixture(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const entry = join(dir, 'main.z80');
  writeFileSync(
    entry,
    [
      'BOOT:',
      '    call START',
      '    ret',
      'START:',
      '    ld de,$1000',
      '    call HELPER',
      '    inc de',
      '    ret',
      'HELPER:',
      '    ld de,$2000',
      '    ret',
      '.end',
    ].join('\n'),
    'utf8',
  );
  return entry;
}

describe('register-care integration', () => {
  it('emits a register-care report artifact in audit mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('AZM Register-Care Report');
    expect(report?.text).toContain('Mode: audit');
  });

  it('emits a register-care interface artifact when requested', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-interface-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterInterface: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const iface = res.artifacts.find(
      (a): a is RegisterCareInterfaceArtifact => a.kind === 'register-care-interface',
    );
    expect(iface?.text).toContain('; AZM register-care interface');
    expect(iface?.text).toContain('; Generated from inferred routine summaries.');
    expect(iface?.text).toContain(';! @proc       HELPER');
    expect(iface?.text).toContain(';! @clobbers   {A}');
    expect(iface?.text).toContain(';! @preserves  {B,C,D,E,H,L,F}');
    expect(iface?.text).not.toContain('No inferred contracts were emitted');
  });

  it('includes inferred called routine summaries in the report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-summary-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('Routine: HELPER');
    expect(report?.text).toContain('writes: A');
  });

  it('warns on direct-call conflicts in warn mode', async () => {
    const entry = writeConflictFixture('azm-regcare-warn-');

    const res = await compile(
      entry,
      { emitBin: false, emitHex: false, emitD8m: false, emitListing: false, registerCare: 'warn' },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        severity: 'warning',
        message: expect.stringContaining('CALL HELPER may modify D,E'),
      }),
    );
  });

  it('fails on direct-call conflicts in error mode', async () => {
    const entry = writeConflictFixture('azm-regcare-error-');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        severity: 'error',
      }),
    );
  });

  it('includes direct-call conflicts in requested reports', async () => {
    const entry = writeConflictFixture('azm-regcare-report-conflict-');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'warn',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('Conflicts:');
    expect(report?.text).toContain('HELPER: D,E: CALL HELPER may modify D,E');
  });

  it('treats matching @in and @out on the same carrier as transformed output intent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-contract-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    ld de,$1000',
        '    call NORMALISE',
        '    inc de',
        '    ret',
        ';! @proc NORMALISE',
        ';! @in {DE} raw',
        ';! @out {DE} normalized',
        ';! @clobbers {A,F}',
        ';! @end',
        'NORMALISE:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('suppresses one ambiguous call with @expect-out in error mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-hint-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    ld de,$1000',
        '    ;! @expect-out {DE} normalized',
        '    call HELPER',
        '    inc de',
        '    ret',
        'HELPER:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('uses extern contracts for calls without routine bodies', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-extern-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'MON_PRINT: equ 0x10',
        ';! @extern MON_PRINT',
        ';! @clobbers {DE}',
        ';! @end',
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    ld de,$1000',
        '    call MON_PRINT',
        '    inc de',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        severity: 'error',
        message: expect.stringContaining('CALL MON_PRINT may modify D,E'),
      }),
    );
  });

  it('treats pure @out carriers as intentional returned values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-pure-out-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    call MAKE_PTR',
        '    inc hl',
        '    ret',
        ';! @proc MAKE_PTR',
        ';! @out {HL} pointer',
        ';! @end',
        'MAKE_PTR:',
        '    ld hl,$2000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('uses bodyless extern pure outputs to kill earlier live values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-extern-out-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'MAKE_PTR: equ 0x20',
        ';! @extern MAKE_PTR',
        ';! @out {HL} pointer',
        ';! @end',
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    call CLOBBER_HL',
        '    call MAKE_PTR',
        '    inc hl',
        '    ret',
        'CLOBBER_HL:',
        '    ld hl,$3000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('treats different-register contract transforms as outputs and inputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-transform-out-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    call CLOBBER_DE',
        '    call MAKE_PTR',
        '    inc hl',
        '    ret',
        ';! @proc MAKE_PTR',
        ';! @in {DE} raw',
        ';! @out {HL} pointer',
        ';! @end',
        'MAKE_PTR:',
        '    ld h,d',
        '    ld l,e',
        '    ret',
        'CLOBBER_DE:',
        '    ld de,$3000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    const errors = res.diagnostics.filter((d) => d.severity === 'error');
    expect(errors).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        message: expect.stringContaining('CALL CLOBBER_DE may modify D,E'),
      }),
    );
    expect(errors).not.toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('CALL MAKE_PTR may modify H,L'),
      }),
    );
  });

  it('treats flag contract outputs as intentional returned values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-flag-out-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    call MAKE_CARRY',
        '    call c,TARGET',
        '    ret',
        ';! @proc MAKE_CARRY',
        ';! @out {carry} carry_out',
        ';! @end',
        'MAKE_CARRY:',
        '    or a',
        '    ret',
        'TARGET:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });
});
