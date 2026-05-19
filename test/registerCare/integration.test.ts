import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type {
  RegisterCareAnnotationsArtifact,
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
      '    ld (de),a',
      '    ret',
      '.end',
    ].join('\n'),
    'utf8',
  );
  return entry;
}

function writeEntryConflictFixture(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const entry = join(dir, 'main.z80');
  writeFileSync(
    entry,
    [
      'START:',
      '    ld de,$1000',
      '    call HELPER',
      '    inc de',
      '    ret',
      'HELPER:',
      '    ld de,$2000',
      '    ld (de),a',
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

  it('uses bare AZMI interface contracts for external calls', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-azmi-'));
    const entry = join(dir, 'main.z80');
    const iface = join(dir, 'mon3.azmi');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    call MON_CLOBBER_DE',
        '    inc de',
        '    ret',
        'MON_CLOBBER_DE:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(iface, ['extern MON_CLOBBER_DE', 'clobbers  DE', 'end'].join('\n'), 'utf8');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'error',
        registerCareInterfaces: [iface],
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        message: expect.stringContaining('CALL MON_CLOBBER_DE may modify D,E'),
        severity: 'error',
      }),
    );
  });

  it('uses the MON-3 profile for RST boundaries in register reports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-mon3-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(entry, ['START:', '    rst $10', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'audit',
        emitRegisterReport: true,
        registerCareProfile: 'mon3',
      },
      { formats: defaultFormatWriters },
    );

    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('Profile: mon3');
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
    expect(iface?.text).toContain('extern HELPER');
    expect(iface?.text).toContain('out       A');
    expect(iface?.text).not.toContain('@preserves');
    expect(iface?.text).not.toContain('carry,zero,sign,parity,halfCarry');
    expect(iface?.text).not.toMatch(/\bF\b/);
    expect(iface?.text).not.toContain('No inferred contracts were emitted');
  });

  it('emits register-care source annotation artifacts when requested', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-annotations-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    call HELPER',
        '    ret',
        '',
        '; Helper prose.',
        'HELPER:',
        '    ld hl,$1000',
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
        registerCare: 'audit',
        emitRegisterAnnotations: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const annotations = res.artifacts.find(
      (a): a is RegisterCareAnnotationsArtifact => a.kind === 'register-care-annotations',
    );
    expect(annotations?.files).toHaveLength(1);
    expect(annotations?.files[0]?.path).toBe(entry);
    expect(annotations?.files[0]?.text).toContain(
      [
        '; Helper prose.',
        ';!      out       HL',
        'HELPER:',
      ].join('\n'),
    );
  });

  it('emits source annotations before at-prefixed routine entries without prose comments', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-at-entry-annotation-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        '@START:',
        '    call HELPER',
        '    ret',
        '',
        '@HELPER:',
        '    ld hl,$1000',
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
        registerCare: 'audit',
        emitRegisterAnnotations: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const annotations = res.artifacts.find(
      (a): a is RegisterCareAnnotationsArtifact => a.kind === 'register-care-annotations',
    );
    expect(annotations?.files[0]?.text).toContain(
      [
        ';!      out       HL',
        '@HELPER:',
      ].join('\n'),
    );
  });

  it('applies conditional jumps to at-prefixed entries as boundary summaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-at-conditional-jp-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        '@START:',
        '    jp z,HELPER',
        '    ret',
        '',
        '@HELPER:',
        '    ld hl,$1000',
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
        registerCare: 'audit',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain(
      [
        'Routine: START',
        '  reads: zero',
        '  writes: -',
        '  preserves: A,B,C,D,E,IXH,IXL,IYH,IYL,carry,zero,sign,parity,halfCarry',
        '  stack: balanced',
        '  relation: H,L <= -',
      ].join('\n'),
    );
  });

  it('marks caller-used written registers as output candidates in source annotations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-annotation-candidates-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        'MASK:',
        '    ld a,$80',
        '    ld (hl),a',
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
        registerCare: 'audit',
        emitRegisterAnnotations: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const annotations = res.artifacts.find(
      (a): a is RegisterCareAnnotationsArtifact => a.kind === 'register-care-annotations',
    );
    expect(annotations?.files[0]?.text).toContain(
      [
        '; Mask prose.',
        ';!      in        HL',
        ';!      maybe-out A',
        ';!      clobbers  A',
        'MASK:',
      ].join('\n'),
    );
  });

  it('reports caller-used written registers as output candidates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-report-candidates-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        '    call MASK',
        '    ld d,a',
        '    ret',
        'MASK:',
        '    ld a,$80',
        '    ld (hl),a',
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
        registerCare: 'audit',
        emitRegisterReport: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const report = res.artifacts.find(
      (a): a is RegisterCareReportArtifact => a.kind === 'register-care-report',
    );
    expect(report?.text).toContain('Output candidates:');
    expect(report?.text).toContain(
      `${entry}:4:1: MASK: A: CALL MASK writes A and caller reads it later; generated contracts promote this to \`out A\` automatically.`,
    );
  });

  it('promotes accepted output candidates in source annotations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-annotation-accept-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        'MASK:',
        '    ld a,$80',
        '    ld (hl),a',
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
        registerCare: 'audit',
        emitRegisterAnnotations: true,
        acceptRegisterOutputCandidates: ['MASK:A'],
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const annotations = res.artifacts.find(
      (a): a is RegisterCareAnnotationsArtifact => a.kind === 'register-care-annotations',
    );
    expect(annotations?.files[0]?.text).toContain(
      [
        '; Mask prose.',
        ';!      in        HL',
        ';!      out       A',
        'MASK:',
      ].join('\n'),
    );
    expect(annotations?.files[0]?.text).not.toContain(';!      maybe-out A');
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
    expect(report?.text).toContain('relation: A <= -');
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

  it('fails on entry routine conflicts without a synthetic BOOT caller in error mode', async () => {
    const entry = writeEntryConflictFixture('azm-regcare-entry-error-');

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
        message: expect.stringContaining('CALL HELPER may modify D,E'),
      }),
    );
  });

  it('detects conflicts through consecutive global label aliases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-alias-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'ALIAS:',
        'HELPER:',
        '    ld de,$2000',
        '    ld (de),a',
        '    ret',
        'START:',
        '    ld de,$1000',
        '    call ALIAS',
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
        message: expect.stringContaining('CALL ALIAS may modify D,E'),
      }),
    );
  });

  it('does not inherit a whole-routine summary when calling an internal local label', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-local-alias-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,1',
        '    ld ($2000),a',
        '.entry:',
        '    ret',
        'CALLER:',
        '    ld a,2',
        '    call .entry',
        '    inc a',
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

    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        severity: 'error',
        message: expect.stringContaining('CALL .entry may modify A'),
      }),
    );
    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('does not apply local-label contracts to the enclosing global routine summary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-local-contract-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        ';! @proc .entry',
        ';! @preserves {A}',
        ';! @end',
        'START:',
        '    ld a,1',
        '    ld ($2000),a',
        '.entry:',
        '    ret',
        'CALLER:',
        '    ld a,2',
        '    call START',
        '    inc a',
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
        message: expect.stringContaining('CALL START may modify A'),
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

  it('includes unknown direct-call boundaries in audit reports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-unknown-report-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['MISSING_HELPER equ $1234', 'START:', '    call MISSING_HELPER', '    ret', '.end'].join(
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
    expect(report?.text).toContain('Unknown calls:');
    expect(report?.text).toContain('MISSING_HELPER');
    expect(report?.text).not.toContain('Unknown calls:\n  none');
  });

  it('emits strict warnings for unknown direct-call boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-unknown-strict-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['MISSING_HELPER equ $1234', 'START:', '    call MISSING_HELPER', '    ret', '.end'].join(
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
        registerCare: 'strict',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareUnknownBoundary,
        severity: 'warning',
        message: expect.stringContaining('MISSING_HELPER'),
      }),
    );
  });

  it('uses MON-3 RST summaries as liveness boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-mon3-rst-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['START:', '    ld a,1', '    rst $10', '    push af', '    pop bc', '    ret', '.end'].join(
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
        registerCare: 'error',
        registerCareProfile: 'mon3',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        severity: 'error',
        message: expect.stringContaining('RST_$10 may modify A,carry,zero,sign,parity,halfCarry'),
      }),
    );
  });

  it('uses the MON-3 API_SCANKEYS RST service as an output boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-mon3-scankeys-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'API_SCANKEYS equ 16',
        'START:',
        '    ld c,API_SCANKEYS',
        '    rst $10',
        '    jr nz,DONE',
        '    ld e,a',
        '    jr nc,DONE',
        '    inc e',
        'DONE:',
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
        registerCareProfile: 'mon3',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('matches MON-3 API_SCANKEYS service names without requiring underscore spelling', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-mon3-scankeys-alias-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'ApiScanKeys equ 16',
        'START:',
        '    ld c,ApiScanKeys',
        '    rst $10',
        '    jr nz,DONE',
        '    ld e,a',
        '    jr nc,DONE',
        '    inc e',
        'DONE:',
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
        registerCareProfile: 'mon3',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  });

  it('keeps generic MON-3 RST behavior when the service load is not immediate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-mon3-generic-rst-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'API_SCANKEYS equ 16',
        'START:',
        '    ld c,API_SCANKEYS',
        '    nop',
        '    rst $10',
        '    jr nz,DONE',
        '    ld e,a',
        'DONE:',
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
        registerCareProfile: 'mon3',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        severity: 'error',
        message: expect.stringContaining('RST_$10 may modify A,zero'),
      }),
    );
  });

  it('uses known unconditional JP targets as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-tail-jp-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,1',
        '    call WRAPPER',
        '    jr nz,DONE',
        'DONE:',
        '    ret',
        'WRAPPER:',
        '    ld a,2',
        '    jp FLAG_CALLEE',
        'FLAG_CALLEE:',
        '    xor a',
        '    jr z,FLAG_DONE',
        'FLAG_DONE:',
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
        message: expect.stringContaining('CALL WRAPPER may modify zero'),
      }),
    );
  });

  it('propagates nested unconditional JP tail-call summaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-tail-jp-chain-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,1',
        '    call WRAPPER_A',
        '    jr nz,DONE',
        'DONE:',
        '    ret',
        'WRAPPER_A:',
        '    jp WRAPPER_B',
        'WRAPPER_B:',
        '    jp FLAG_CALLEE',
        'FLAG_CALLEE:',
        '    xor a',
        '    jr z,FLAG_DONE',
        'FLAG_DONE:',
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
        message: expect.stringContaining('CALL WRAPPER_A may modify zero'),
      }),
    );
  });

  it('emits strict warnings for unknown direct-JP tail-call boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-unknown-tail-jp-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      ['MISSING_TAIL equ $1234', 'START:', '    jp MISSING_TAIL', '.end'].join('\n'),
      'utf8',
    );

    const res = await compile(
      entry,
      {
        emitBin: false,
        emitHex: false,
        emitD8m: false,
        emitListing: false,
        registerCare: 'strict',
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareUnknownBoundary,
        severity: 'warning',
        message: expect.stringContaining('JP MISSING_TAIL'),
      }),
    );
  });

  it('does not treat unconditional JR loops as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-jr-loop-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,0x1234',
        '    ld hl,TEXT',
        '    call LCD_STRING',
        '    ld a,d',
        '    ret',
        '; Keeps @preserves A,carry,zero,sign,parity,halfCarry,BC,DE,HL,IX,IY stable for the caller.',
        'LCD_BUSY:',
        '    push af',
        'LCD_BUSY_LOOP:',
        '    in a,(1)',
        '    rlca',
        '    jr c,LCD_BUSY_LOOP',
        '    pop af',
        '    ret',
        'LCD_STRING:',
        '    ld a,(hl)',
        '    inc hl',
        '    or a',
        '    ret z',
        '    call LCD_BUSY',
        '    jr LCD_STRING',
        'TEXT:',
        '    db 0',
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

    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        message: expect.stringContaining('CALL LCD_STRING may modify D,E'),
      }),
    );
  });

  it('does not treat local JP branches as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-local-jp-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,0x1234',
        '    call LOCAL_BRANCH',
        '    inc de',
        '    ret',
        'LOCAL_BRANCH:',
        '    jp .done',
        '.done:',
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

    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        id: DiagnosticIds.RegisterCareConflict,
        message: expect.stringContaining('CALL LOCAL_BRANCH may modify D,E'),
      }),
    );
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
        ';! @clobbers {A}',
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

  it('uses AZMDoc comments before a routine label as the routine contract', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-azmdoc-'));
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
        '; Normalises the candidate coordinate in place.',
        '; Raw coordinate enters as @in DE raw_coord.',
        '; Normalized coordinate returns in @out DE normalized_coord.',
        '; Scratch use is @clobbers A.',
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

  it('promotes source-level expects-out comments into generated callee contracts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-expects-out-promote-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    ; expects out A',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        'MASK:',
        '    ld c,a',
        '    ld a,$80',
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
        emitRegisterAnnotations: true,
      },
      { formats: defaultFormatWriters },
    );

    expect(res.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const annotations = res.artifacts.find(
      (a): a is RegisterCareAnnotationsArtifact => a.kind === 'register-care-annotations',
    );
    expect(annotations?.files[0]?.text).toContain(
      [
        '; Mask prose.',
        ';!      out       A',
        ';!      clobbers  C',
        'MASK:',
      ].join('\n'),
    );
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
        '    ld (de),a',
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

  it('uses known direct-call summaries when inferring caller clobbers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcare-interprocedural-'));
    const entry = join(dir, 'main.z80');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    call MAKER',
        '    inc de',
        '    ret',
        '; Returns @out A as a produced byte.',
        'GET_A:',
        '    ld a,1',
        '    ret',
        'MAKER:',
        '    call GET_A',
        '    ld b,a',
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
