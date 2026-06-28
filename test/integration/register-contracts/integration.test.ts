import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  compile,
  defaultFormatWriters,
  type CompileNextFunctionOptions as CompilerOptions,
  type CompileResult,
} from '../../../src/index.js';
import type { Diagnostic } from '../../../src/model/diagnostic.js';
import type {
  RegisterContractsAnnotationsArtifact,
  RegisterContractsInterfaceArtifact,
  RegisterContractsReportArtifact,
} from '../../../src/outputs/types.js';

const noEmitOptions = {
  emitBin: false,
  emitHex: false,
  emitD8m: false,
} satisfies CompilerOptions;

function writeSourceFixture(prefix: string, lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const entry = join(dir, 'main.asm');
  writeFileSync(entry, lines.join('\n'), 'utf8');
  return entry;
}

async function compileRegisterContracts(
  entry: string,
  options: CompilerOptions,
): Promise<CompileResult> {
  return compile(entry, { ...noEmitOptions, ...options }, { formats: defaultFormatWriters });
}

function expectNoErrorDiagnostics(result: CompileResult): void {
  expect(
    result.diagnostics.filter((diagnostic: Diagnostic) => diagnostic.severity === 'error'),
  ).toEqual([]);
}

function reportArtifact(result: CompileResult): RegisterContractsReportArtifact | undefined {
  return result.artifacts.find(
    (artifact): artifact is RegisterContractsReportArtifact =>
      artifact.kind === 'register-contracts-report',
  );
}

function annotationsArtifact(
  result: CompileResult,
): RegisterContractsAnnotationsArtifact | undefined {
  return result.artifacts.find(
    (artifact): artifact is RegisterContractsAnnotationsArtifact =>
      artifact.kind === 'register-contracts-annotations',
  );
}

function writeConflictFixture(prefix: string): string {
  return writeSourceFixture(prefix, [
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
  ]);
}

function writeEntryConflictFixture(prefix: string): string {
  return writeSourceFixture(prefix, [
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
  ]);
}

function writeScopedPolicyFixture(prefix: string, legacyLines: string[] = []): {
  dir: string;
  entry: string;
  strictFile: string;
  legacyFile: string;
} {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const entry = join(dir, 'main.asm');
  const strictFile = join(dir, 'strict.asm');
  const legacyFile = join(dir, 'legacy.asm');
  writeFileSync(entry, ['.import "strict.asm"', '.import "legacy.asm"', '.end'].join('\n'), 'utf8');
  writeFileSync(
    strictFile,
    ['@START:', '    call LEGACY', '    ret'].join('\n'),
    'utf8',
  );
  writeFileSync(
    legacyFile,
    [...legacyLines, '@LEGACY:', '    ld de,$2000', '    ret'].join('\n'),
    'utf8',
  );
  return { dir, entry, strictFile, legacyFile };
}

describe('register-contracts integration', () => {
  it('emits a register-contracts report artifact in audit mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(entry, ['START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    const report = reportArtifact(res);
    expect(report?.text).toContain('AZM Register Contracts Report');
    expect(report?.text).toContain('Mode: audit');
  });

  it('uses semicolon-separated source contracts during strict analysis', async () => {
    const entry = writeSourceFixture('azm-regcontracts-compact-source-contract-', [
      'START:',
      '    ld a,1',
      '    call HELPER',
      '    ld e,a',
      '    ret',
      '',
      ';! in A; out A; clobbers F',
      'HELPER:',
      '    or a',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expectNoErrorDiagnostics(res);
  });

  it('uses bare register-contracts interface contracts for external calls', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-interface-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'mon3.asmi');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsInterfaces: [iface],
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('CALL MON_CLOBBER_DE may modify D,E'),
        severity: 'error',
      }),
    );
  });

  it('uses RST selector service contracts from interface files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-interface-service-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'monitor.asmi');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    ld c,16',
        '    rst $10',
        '    inc de',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      iface,
      ['service rst $10 C 16 SCAN_KEYS', 'in C', 'out A,carry,zero', 'clobbers DE', 'end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsInterfaces: [iface],
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('may modify D,E'),
      }),
    );
  });

  it('uses the MON-3 profile for RST boundaries in register reports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(entry, ['START:', '    rst $10', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsProfile: 'mon3',
    });

    const report = reportArtifact(res);
    expect(report?.text).toContain('Profile: mon3');
  });

  it('emits a register-contracts interface artifact when requested', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-interface-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterInterface: true,
    });

    expectNoErrorDiagnostics(res);
    const iface = res.artifacts.find(
      (a): a is RegisterContractsInterfaceArtifact => a.kind === 'register-contracts-interface',
    );
    expect(iface?.text).toContain('extern HELPER');
    expect(iface?.text).toContain('out A');
    expect(iface?.text).not.toContain(';');
    expect(iface?.text).not.toContain('@preserves');
    expect(iface?.text).not.toContain('carry,zero,sign,parity,halfCarry');
    expect(iface?.text).not.toMatch(/\bF\b/);
    expect(iface?.text).not.toContain('No inferred contracts were emitted');
  });

  it('proves strict stack discipline through known internal direct calls', async () => {
    const entry = writeSourceFixture('azm-regcontracts-strict-internal-call-', [
      '@START:',
      '    call WRAPPER',
      '    ret',
      '@WRAPPER:',
      '    call HELPER',
      '    ret',
      '@HELPER:',
      '    cp 0',
      '    ret z',
      '    xor a',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expectNoErrorDiagnostics(res);
    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('stack effect is unknown'),
      }),
    );
  });

  it('treats imported public @ routines as known internal routines in strict mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-import-public-'));
    const entry = join(dir, 'main.asm');
    const module = join(dir, 'keyboard.asm');
    writeFileSync(
      entry,
      ['.import "keyboard.asm"', '@START:', '    call ReadKey', '    ret', '.end'].join('\n'),
      'utf8',
    );
    writeFileSync(module, ['@ReadKey:', '    xor a', '    ret'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expectNoErrorDiagnostics(res);
    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('ReadKey'),
      }),
    );
  });

  it('analyzes imported private helpers reached through imported public routines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-import-private-helper-'));
    const entry = join(dir, 'main.asm');
    const module = join(dir, 'keyboard.asm');
    writeFileSync(
      entry,
      ['.import "keyboard.asm"', '@START:', '    call ReadKey', '    ret', '.end'].join('\n'),
      'utf8',
    );
    writeFileSync(
      module,
      ['@ReadKey:', '    call ScanMatrix', '    ret', 'ScanMatrix:', '    xor a', '    ret'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expectNoErrorDiagnostics(res);
    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('ScanMatrix'),
      }),
    );
  });

  it('reports imported private-label visibility before register-contract boundary diagnostics', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-import-private-visibility-'));
    const entry = join(dir, 'main.asm');
    const module = join(dir, 'keyboard.asm');
    writeFileSync(
      entry,
      ['.import "keyboard.asm"', '@START:', '    call ScanMatrix', '    ret', '.end'].join('\n'),
      'utf8',
    );
    writeFileSync(module, ['@ReadKey:', '    ret', 'ScanMatrix:', '    ret'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_SYMBOL',
        message: `symbol "ScanMatrix" is private to ${module}; export it with @ScanMatrix or keep the reference inside that file`,
        sourceName: entry,
        line: 3,
        column: 5,
      }),
    ]);
  });

  it('keeps strict stack discipline enforced inside imported public routines', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-import-stack-'));
    const entry = join(dir, 'main.asm');
    const module = join(dir, 'keyboard.asm');
    writeFileSync(
      entry,
      ['.import "keyboard.asm"', '@START:', '    call ReadKey', '    ret', '.end'].join('\n'),
      'utf8',
    );
    writeFileSync(module, ['@ReadKey:', '    push bc', '    ret'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining(
          'Register contracts cannot prove stack discipline for ReadKey',
        ),
        sourceName: module,
      }),
    );
  });

  it('emits register-contracts source annotation artifacts when requested', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-annotations-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterAnnotations: true,
    });

    expectNoErrorDiagnostics(res);
    const annotations = annotationsArtifact(res);
    expect(annotations?.files).toHaveLength(1);
    expect(annotations?.files[0]?.path).toBe(entry);
    expect(annotations?.files[0]?.text).toContain(
      ['; Helper prose.', ';! out HL', 'HELPER:'].join('\n'),
    );
  });

  it('emits source annotations before at-prefixed routine entries without prose comments', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-at-entry-annotation-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterAnnotations: true,
    });

    expectNoErrorDiagnostics(res);
    const annotations = annotationsArtifact(res);
    expect(annotations?.files[0]?.text).toContain([';! out HL', '@HELPER:'].join('\n'));
  });

  it('applies conditional jumps to at-prefixed entries as boundary summaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-at-conditional-jp-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    const report = reportArtifact(res);
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

  it('promotes direct caller data uses in source annotations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-annotation-candidates-'));
    const entry = join(dir, 'main.asm');
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
        ';!      in        A',
        ';!      maybe-out A',
        ';!      clobbers  A,C',
        'MASK:',
        '    ld a,$80',
        '    ld (hl),a',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterAnnotations: true,
    });

    expectNoErrorDiagnostics(res);
    const annotations = annotationsArtifact(res);
    expect(annotations?.files[0]?.text).toContain(
      ['; Mask prose.', ';! in A; out A; clobbers C', 'MASK:'].join('\n'),
    );
    expect(annotations?.files[0]?.text).not.toContain(';!      maybe-out A');
  });

  it('does not promote suppressed maybe-out output candidates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-suppressed-maybe-out-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        ';! rc-ignore-next output_candidate: reviewed legacy return',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        ';!      in        A',
        ';!      maybe-out A',
        ';!      clobbers  A,C',
        'MASK:',
        '    ld a,$80',
        '    ld (hl),a',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterAnnotations: true,
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    expectNoErrorDiagnostics(res);
    expect(annotationsArtifact(res)?.files[0]?.text).not.toContain('out A');
    expect(reportArtifact(res)?.json?.summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'MASK',
          valueRelations: [],
        }),
      ]),
    );
    expect(reportArtifact(res)?.json?.suppressedFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suppression: expect.objectContaining({
            findingKind: 'output_candidate',
            reason: 'reviewed legacy return',
          }),
          finding: expect.objectContaining({ kind: 'output_candidate' }),
        }),
      ]),
    );
  });

  it('reports caller-used written registers as output candidates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-report-candidates-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    const report = reportArtifact(res);
    expect(report?.text).toContain('Output candidates:');
    expect(report?.text).toContain(
      `MASK: A: CALL MASK writes A and caller reads it later; generated contracts promote this to \`out A\` automatically.`,
    );
  });

  it('auto-promotes direct continuation data reads into generated callee contracts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-auto-promote-data-output-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    ld e,a',
        '    ret',
        '',
        '; Mask prose.',
        ';!      in        A',
        ';!      maybe-out A',
        ';!      clobbers  A,C',
        'MASK:',
        '    ld c,a',
        '    rst 0',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      emitRegisterAnnotations: true,
    });

    expectNoErrorDiagnostics(res);
    const annotations = annotationsArtifact(res);
    expect(annotations?.files[0]?.text).toContain('; Mask prose.');
    expect(annotations?.files[0]?.text).toContain(';! in A; out A; clobbers C,F');
    expect(annotations?.files[0]?.text).not.toContain(';!      maybe-out A');
    expect(annotations?.files[0]?.text).not.toContain(';!      clobbers  A');
  });

  it('does not treat OR A as a data-output use when value-derived flags are dead', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-no-auto-promote-flag-test-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld a,3',
        '    call MASK',
        '    or a',
        '    ret',
        '',
        '; Mask prose.',
        ';!      in        A',
        ';!      maybe-out A',
        ';!      clobbers  A,C',
        'MASK:',
        '    ld c,a',
        '    rst 0',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      emitRegisterAnnotations: true,
    });

    expectNoErrorDiagnostics(res);
    const annotations = annotationsArtifact(res);
    expect(annotations?.files[0]?.text).not.toContain(';!      out       A');
  });

  it('promotes accepted output candidates in source annotations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-annotation-accept-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterAnnotations: true,
      acceptRegisterOutputCandidates: ['MASK:A'],
    });

    expectNoErrorDiagnostics(res);
    const annotations = annotationsArtifact(res);
    expect(annotations?.files[0]?.text).toContain(
      ['; Mask prose.', ';! in HL; out A', 'MASK:'].join('\n'),
    );
    expect(annotations?.files[0]?.text).not.toContain(';!      maybe-out A');
  });

  it('includes inferred called routine summaries in the report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-summary-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      ['START:', '    call HELPER', '    ret', 'HELPER:', '    ld a,1', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
    });

    const report = reportArtifact(res);
    expect(report?.text).toContain('Routine: HELPER');
    expect(report?.text).toContain('relation: A <= -');
  });

  it('warns on direct-call conflicts in warn mode', async () => {
    const entry = writeConflictFixture('azm-regcontracts-warn-');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'warn',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'warning',
        message: expect.stringContaining('CALL HELPER may modify D,E'),
      }),
    );
  });

  it('fails on direct-call conflicts in error mode', async () => {
    const entry = writeConflictFixture('azm-regcontracts-error-');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
      }),
    );
  });

  it('fails on entry routine conflicts without a synthetic BOOT caller in error mode', async () => {
    const entry = writeEntryConflictFixture('azm-regcontracts-entry-error-');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('CALL HELPER may modify D,E'),
      }),
    );
  });

  it('detects conflicts through consecutive global label aliases', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-alias-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('CALL ALIAS may modify D,E'),
      }),
    );
  });

  it('does not inherit a whole-routine summary when calling an internal local label', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-local-alias-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('CALL .entry may modify A'),
      }),
    );
    expectNoErrorDiagnostics(res);
  });

  it('includes direct-call conflicts in requested reports', async () => {
    const entry = writeConflictFixture('azm-regcontracts-report-conflict-');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'warn',
      emitRegisterReport: true,
    });

    const report = reportArtifact(res);
    expect(report?.text).toContain('Conflicts:');
    expect(report?.text).toContain('Findings:');
    expect(report?.text).toContain('definite_contract_violation');
    expect(report?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'definite_contract_violation',
          file: entry,
          line: 6,
          column: 5,
          callTarget: 'HELPER',
          carriers: ['D', 'E'],
        }),
      ]),
    );
    expect(report?.text).toContain('HELPER: D,E: CALL HELPER may modify D,E');
  });

  it('preserves imported source ownership metadata in report findings', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-report-source-ownership-'));
    const entry = join(dir, 'main.asm');
    const imported = join(dir, 'module.asm');
    writeFileSync(entry, ['.import "module.asm"', '.end'].join('\n'), 'utf8');
    writeFileSync(
      imported,
      [
        '@START:',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'warn',
      emitRegisterReport: true,
    });

    const report = reportArtifact(res);
    expect(report?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'definite_contract_violation',
          file: imported,
          sourceUnit: imported,
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
          callTarget: 'HELPER',
        }),
      ]),
    );
  });

  it('emits a structured JSON register-contracts report artifact', async () => {
    const entry = writeConflictFixture('azm-regcontracts-json-report-');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'warn',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    const report = reportArtifact(res);
    expect(report?.format).toBe('json');
    expect(report?.json).toMatchObject({
      format: 'azm-register-contracts-report',
      version: 1,
      entryFile: entry,
      mode: 'warn',
    });
    expect(report?.json?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'definite_contract_violation',
          routine: 'START',
          location: expect.objectContaining({
            file: entry,
            line: 6,
            column: 5,
          }),
          callTarget: 'HELPER',
          carriers: ['D', 'E'],
          remediation: expect.objectContaining({
            category: 'fix_call_or_contract',
          }),
        }),
      ]),
    );
    expect(report?.text).toContain('"format": "azm-register-contracts-report"');
  });

  it('reports register-contract baseline ratchet deltas', async () => {
    const entry = writeConflictFixture('azm-regcontracts-ratchet-');
    const baselinePath = join(dirname(entry), 'baseline.regcontracts.json');
    const baseline = {
      format: 'azm-register-contracts-report' as const,
      version: 1 as const,
      entryFile: entry,
      mode: 'audit' as const,
      summaries: [],
      findings: [
        {
          kind: 'missing_callee_contract' as const,
          location: { file: entry, line: 99, column: 1 },
          message: 'old fixed finding',
          callTarget: 'OLD',
          subject: 'CALL OLD',
          remediation: { category: 'add_contract' as const, hint: 'old' },
        },
      ],
      unknownCalls: [],
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
      registerContractsBaseline: baselinePath,
      registerContractsRatchet: true,
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('Register contract ratchet found new'),
      }),
    );
    expect(reportArtifact(res)?.json?.ratchet?.newFindings.length).toBeGreaterThan(0);
    expect(reportArtifact(res)?.json?.ratchet?.removedFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          finding: expect.objectContaining({ callTarget: 'OLD' }),
        }),
      ]),
    );
  });

  it('reports changed register-contract baseline findings', async () => {
    const entry = writeConflictFixture('azm-regcontracts-ratchet-changed-');
    const initial = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });
    const baseline = reportArtifact(initial)?.json;
    expect(baseline).toBeDefined();
    const baselinePath = join(dirname(entry), 'baseline.regcontracts.json');
    const changedBaseline = {
      ...baseline!,
      findings: baseline!.findings.map((finding, index) =>
        index === 0 ? { ...finding, message: 'previous diagnostic wording' } : finding,
      ),
    };
    writeFileSync(baselinePath, `${JSON.stringify(changedBaseline, null, 2)}\n`, 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
      registerContractsBaseline: baselinePath,
      registerContractsRatchet: true,
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Register contract ratchet found changed'),
      }),
    );
    expect(reportArtifact(res)?.json?.ratchet?.changedFindings.length).toBeGreaterThan(0);
  });

  it('reports moved register-contract baseline findings as changed', async () => {
    const entry = writeConflictFixture('azm-regcontracts-ratchet-moved-');
    const initial = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });
    const baseline = reportArtifact(initial)?.json;
    expect(baseline).toBeDefined();
    const baselinePath = join(dirname(entry), 'baseline-moved.regcontracts.json');
    const movedBaseline = {
      ...baseline!,
      findings: baseline!.findings.map((finding, index) =>
        index === 0
          ? { ...finding, location: { ...finding.location, line: finding.location.line + 1 } }
          : finding,
      ),
    };
    writeFileSync(baselinePath, `${JSON.stringify(movedBaseline, null, 2)}\n`, 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
      registerContractsBaseline: baselinePath,
      registerContractsRatchet: true,
    });

    expect(reportArtifact(res)?.json?.ratchet?.newFindings).toEqual([]);
    expect(reportArtifact(res)?.json?.ratchet?.removedFindings).toEqual([]);
    expect(reportArtifact(res)?.json?.ratchet?.changedFindings.length).toBeGreaterThan(0);
  });

  it('reports duplicate-key register-contract findings as new when baseline has fewer', async () => {
    const entry = writeSourceFixture('azm-regcontracts-ratchet-duplicate-', [
      'START:',
      '    ld de,$1000',
      '    call HELPER',
      '    inc de',
      '    ld de,$1000',
      '    call HELPER',
      '    inc de',
      '    ret',
      'HELPER:',
      '    ld de,$2000',
      '    ld (de),a',
      '    ret',
      '.end',
    ]);
    const current = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });
    const report = reportArtifact(current)?.json;
    expect(report?.findings.filter((finding) => finding.callTarget === 'HELPER').length).toBeGreaterThan(1);
    const baselinePath = join(dirname(entry), 'baseline-duplicate.regcontracts.json');
    writeFileSync(
      baselinePath,
      `${JSON.stringify({ ...report!, findings: [report!.findings[0]] }, null, 2)}\n`,
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
      registerContractsBaseline: baselinePath,
      registerContractsRatchet: true,
    });

    expect(reportArtifact(res)?.json?.ratchet?.newFindings.length).toBeGreaterThan(0);
  });

  it('applies scoped register-contract policy by physical file', async () => {
    const { dir, entry, strictFile } = writeScopedPolicyFixture(
      'azm-regcontracts-policy-boundary-',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
      registerContractsPolicy: {
        strict: [strictFile],
        audit: [join(dir, '*.asm')],
      },
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        sourceName: strictFile,
        message: expect.stringContaining('strict register-contract source calls audited LEGACY'),
      }),
    );
    expect(reportArtifact(res)?.json?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'external_interface_unknown',
          location: expect.objectContaining({ file: strictFile }),
          callTarget: 'LEGACY',
          routine: 'START',
        }),
      ]),
    );
  });

  it('reports audited source findings without failing scoped strict builds', async () => {
    const { dir, entry, strictFile, legacyFile } = writeScopedPolicyFixture(
      'azm-regcontracts-policy-audit-report-',
      [';! clobbers DE'],
    );
    writeFileSync(
      legacyFile,
      [
        ';! clobbers DE',
        '@LEGACY:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        '@HELPER:',
        '    ld de,$2000',
        '    ld (de),a',
        '    ret',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
      registerContractsPolicy: {
        strict: [strictFile],
        audit: [join(dir, '*.asm')],
      },
    });

    expectNoErrorDiagnostics(res);
    expect(reportArtifact(res)?.json?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'definite_contract_violation',
          location: expect.objectContaining({ file: legacyFile }),
          callTarget: 'HELPER',
          routine: 'LEGACY',
        }),
      ]),
    );
  });

  it('does not suppress normal unresolved-symbol errors in scoped off files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-policy-off-symbol-'));
    const entry = join(dir, 'main.asm');
    const offFile = join(dir, 'legacy.asm');
    writeFileSync(entry, ['.import "legacy.asm"', '.end'].join('\n'), 'utf8');
    writeFileSync(offFile, ['@LEGACY:', '    call MISSING', '    ret'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      emitRegisterReport: true,
      registerContractsPolicy: {
        audit: [join(dir, '*.asm')],
        off: [offFile],
      },
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_SYMBOL',
        sourceName: offFile,
        message: expect.stringContaining('Unresolved symbol "MISSING"'),
      }),
    );
  });

  it('accepts explicit contracts at strict-to-audit register-contract boundaries', async () => {
    const { entry, strictFile, legacyFile } = writeScopedPolicyFixture(
      'azm-regcontracts-policy-contract-',
      [';! clobbers DE'],
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsPolicy: {
        strict: [strictFile],
        audit: [legacyFile],
      },
    });

    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('strict register-contract source calls audited LEGACY'),
      }),
    );
    expectNoErrorDiagnostics(res);
  });

  it('treats explicit register-contract policy as enabling scoped analysis', async () => {
    const { entry, strictFile, legacyFile } = writeScopedPolicyFixture(
      'azm-regcontracts-policy-enables-analysis-',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'off',
      emitRegisterReport: true,
      registerContractsPolicy: {
        strict: [strictFile],
        audit: [legacyFile],
      },
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        sourceName: strictFile,
        message: expect.stringContaining('strict register-contract source calls audited LEGACY'),
      }),
    );
  });

  it('does not include register-contract findings in off-mode reports', async () => {
    const entry = writeConflictFixture('azm-regcontracts-off-report-findings-');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'off',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    const report = reportArtifact(res);
    expect(report?.text).toContain('Mode: off');
    expect(report?.text).toContain('Findings:\n  none');
    expect(report?.text).toContain('Unknown calls:\n  none');
  });

  it('suppresses the next local register-contract finding with an auditable reason', async () => {
    const entry = writeSourceFixture('azm-regcontracts-suppress-next-', [
      'START:',
      '    ld de,$1000',
      ';! rc-ignore-next definite_contract_violation: legacy monitor wrapper',
      '    call HELPER',
      '    inc de',
      '    ret',
      'HELPER:',
      '    ld de,$2000',
      '    ld (de),a',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    expectNoErrorDiagnostics(res);
    expect(reportArtifact(res)?.json?.findings).toEqual([
      expect.objectContaining({
        kind: 'output_candidate',
        location: expect.objectContaining({ line: 4 }),
      }),
    ]);
    expect(reportArtifact(res)?.json?.suppressedFindings).toEqual([
      expect.objectContaining({
        suppression: expect.objectContaining({
          findingKind: 'definite_contract_violation',
          reason: 'legacy monitor wrapper',
        }),
        finding: expect.objectContaining({
          kind: 'definite_contract_violation',
          callTarget: 'HELPER',
          location: expect.objectContaining({ line: 4 }),
        }),
      }),
    ]);
  });

  it('rejects malformed local register-contract suppressions in strict mode', async () => {
    const entry = writeSourceFixture('azm-regcontracts-bad-suppress-next-', [
      'START:',
      '    ld de,$1000',
      ';! rc-ignore-next definite_contract_violation',
      '    call HELPER',
      '    inc de',
      '    ret',
      'HELPER:',
      '    ld de,$2000',
      '    ld (de),a',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        line: 3,
        message: expect.stringContaining('Malformed register-contract suppression'),
      }),
    );
  });

  it('rejects malformed local suppressions in scoped strict source', async () => {
    const entry = writeSourceFixture('azm-regcontracts-bad-scoped-suppress-next-', [
      'START:',
      '    ld de,$1000',
      ';! rc-ignore-next definite_contract_violation',
      '    call HELPER',
      '    inc de',
      '    ret',
      'HELPER:',
      '    ld de,$2000',
      '    ld (de),a',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      registerContractsPolicy: {
        strict: [entry],
      },
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        line: 3,
        message: expect.stringContaining('Malformed register-contract suppression'),
      }),
    );
  });

  it('keeps suppressed output candidates out of active report sections', async () => {
    const entry = writeSourceFixture('azm-regcontracts-suppress-output-candidate-', [
      'START:',
      '    ld de,$1000',
      ';! rc-ignore-next output_candidate: reviewed legacy return',
      '    call HELPER',
      '    inc de',
      '    ret',
      'HELPER:',
      '    ld de,$2000',
      '    ld (de),a',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    expect(reportArtifact(res)?.json?.findings).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({
          kind: 'output_candidate',
          location: expect.objectContaining({ line: 4 }),
        }),
      ]),
    );
    expect(reportArtifact(res)?.json?.suppressedFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          suppression: expect.objectContaining({
            findingKind: 'output_candidate',
            reason: 'reviewed legacy return',
          }),
          finding: expect.objectContaining({ kind: 'output_candidate' }),
        }),
      ]),
    );
  });

  it('includes unknown direct-call boundaries in audit reports', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-unknown-report-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      ['MISSING_HELPER .equ $1234', 'START:', '    call MISSING_HELPER', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
    });

    const report = reportArtifact(res);
    expect(report?.text).toContain('Unknown calls:');
    expect(report?.text).toContain('MISSING_HELPER');
    expect(report?.text).not.toContain('Unknown calls:\n  none');
  });

  it('emits strict errors for unknown direct-call boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-unknown-strict-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      ['MISSING_HELPER .equ $1234', 'START:', '    call MISSING_HELPER', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('MISSING_HELPER'),
      }),
    );
  });

  it('emits strict errors for unbalanced routine stack discipline', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-strict-stack-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(entry, ['@START:', '    push bc', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining(
          'Register contracts cannot prove stack discipline for START',
        ),
      }),
    );
  });

  it('emits strict errors for conditional returns before stack restoration', async () => {
    const entry = writeSourceFixture('azm-regcontracts-strict-early-ret-stack-', [
      '@START:',
      '    call HELPER',
      '    ret',
      '@HELPER:',
      '    push bc',
      '    ret z',
      '    pop bc',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('stack is unbalanced'),
      }),
    );
  });

  it('uses MON-3 RST summaries as liveness boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-rst-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      ['START:', '    ld a,1', '    rst $10', '    push af', '    pop bc', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsProfile: 'mon3',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('RST_$10 may modify A,carry,zero,sign,parity,halfCarry'),
      }),
    );
  });

  it('uses the MON-3 API_SCANKEYS RST service as an output boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-scankeys-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'API_SCANKEYS .equ 16',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsProfile: 'mon3',
    });

    expectNoErrorDiagnostics(res);
  });

  it('matches MON-3 API_SCANKEYS service names without requiring underscore spelling', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-scankeys-alias-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'ApiScanKeys .equ 16',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsProfile: 'mon3',
    });

    expectNoErrorDiagnostics(res);
  });

  it('treats MON-3 dispatcher API 16 carry and zero as scanKeys outputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-scankeys-flags-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'ApiScanKeys .equ 16',
        'START:',
        '    ld c,ApiScanKeys',
        '    rst $10',
        '    ret nc',
        '    ld c,ApiScanKeys',
        '    rst $10',
        '    ret z',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsProfile: 'mon3',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    const report = res.artifacts.find((artifact) => artifact.kind === 'register-contracts-report');
    expect(report?.text).toContain('MON3_API_16_SCAN_KEYS');
  });

  it('keeps generic MON-3 RST behavior when the service load is not immediate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-generic-rst-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'API_SCANKEYS .equ 16',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsProfile: 'mon3',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('RST_$10 may modify A,zero'),
      }),
    );
  });

  it('uses known unconditional JP targets as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tail-jp-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('CALL WRAPPER may modify zero'),
      }),
    );
  });

  it('propagates nested unconditional JP tail-call summaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tail-jp-chain-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('CALL WRAPPER_A may modify zero'),
      }),
    );
  });

  it('emits strict errors for unknown direct-JP tail-call boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-unknown-tail-jp-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      ['MISSING_TAIL .equ $1234', 'START:', '    jp MISSING_TAIL', '.end'].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('JP MISSING_TAIL'),
      }),
    );
  });

  it('does not treat unconditional JR loops as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-jr-loop-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,0x1234',
        '    ld hl,TEXT',
        '    call LCD_STRING',
        '    ld a,d',
        '    ret',
        '; Keeps A,carry,zero,sign,parity,halfCarry,BC,DE,HL,IX,IY stable for the caller.',
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
        '    .db 0',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('CALL LCD_STRING may modify D,E'),
      }),
    );
  });

  it('does not treat local JP branches as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-local-jp-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).not.toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        message: expect.stringContaining('CALL LOCAL_BRANCH may modify D,E'),
      }),
    );
  });

  it('treats matching compact in and out on the same carrier as transformed output intent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-contract-'));
    const entry = join(dir, 'main.asm');
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
        ';!      in        DE',
        ';!      out       DE',
        ';!      clobbers  A',
        'NORMALISE:',
        '    ld de,$2000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expectNoErrorDiagnostics(res);
  });

  it('suppresses one ambiguous call with expects-out in error mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-hint-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'BOOT:',
        '    call START',
        '    ret',
        'START:',
        '    ld de,$1000',
        '    ; expects out DE',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expectNoErrorDiagnostics(res);
  });

  it('promotes source-level expects-out comments into generated callee contracts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-expects-out-promote-'));
    const entry = join(dir, 'main.asm');
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      emitRegisterAnnotations: true,
    });

    expectNoErrorDiagnostics(res);
    const annotations = annotationsArtifact(res);
    expect(annotations?.files[0]?.text).toContain(
      ['; Mask prose.', ';! out A; clobbers C', 'MASK:'].join('\n'),
    );
  });

  it('does not autofix suppressed output candidates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-suppressed-candidate-fix-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        ';! rc-ignore-next output_candidate: reviewed legacy return',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterAnnotations: true,
      fixRegisterContracts: true,
    });

    expectNoErrorDiagnostics(res);
    expect(annotationsArtifact(res)).toBeUndefined();
  });

  it('uses extern contracts for calls without routine bodies', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-extern-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'mon.asmi');
    writeFileSync(iface, ['extern MON_PRINT', 'clobbers DE', 'end'].join('\n'), 'utf8');
    writeFileSync(
      entry,
      [
        'MON_PRINT .equ 0x10',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsInterfaces: [iface],
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('CALL MON_PRINT may modify D,E'),
      }),
    );
  });

  it('treats pure compact out carriers as intentional returned values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-pure-out-'));
    const entry = join(dir, 'main.asm');
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
        ';!      out       HL',
        'MAKE_PTR:',
        '    ld hl,$2000',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expectNoErrorDiagnostics(res);
  });

  it('uses bodyless extern pure outputs to kill earlier live values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-extern-out-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'ptr.asmi');
    writeFileSync(iface, ['extern MAKE_PTR', 'out HL', 'end'].join('\n'), 'utf8');
    writeFileSync(
      entry,
      [
        'MAKE_PTR .equ 0x20',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      registerContractsInterfaces: [iface],
    });

    expectNoErrorDiagnostics(res);
  });

  it('treats different-register contract transforms as outputs and inputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-transform-out-'));
    const entry = join(dir, 'main.asm');
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
        ';!      in        DE',
        ';!      out       HL',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    const errors = res.diagnostics.filter((d: Diagnostic) => d.severity === 'error');
    expect(errors).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
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
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-flag-out-'));
    const entry = join(dir, 'main.asm');
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
        ';!      out       carry',
        'MAKE_CARRY:',
        '    or a',
        '    ret',
        'TARGET:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expectNoErrorDiagnostics(res);
  });

  it('uses known direct-call summaries when inferring caller clobbers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-interprocedural-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'START:',
        '    ld de,$1000',
        '    call MAKER',
        '    inc de',
        '    ret',
        ';!      out       A',
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

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expectNoErrorDiagnostics(res);
  });
});
