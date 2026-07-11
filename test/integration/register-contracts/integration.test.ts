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
  RegisterContractsInferenceArtifact,
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

function inferenceArtifact(result: CompileResult): RegisterContractsInferenceArtifact | undefined {
  return result.artifacts.find(
    (artifact): artifact is RegisterContractsInferenceArtifact =>
      artifact.kind === 'register-contracts-inference',
  );
}

function writeConflictFixture(prefix: string): string {
  return writeSourceFixture(prefix, [
    '.routine',
    'BOOT:',
    '    call START',
    '    ret',
    '.routine',
    'START:',
    '    ld de,$1000',
    '    call HELPER',
    '    inc de',
    '    ret',
    '.routine',
    'HELPER:',
    '    ld de,$2000',
    '    ld (de),a',
    '    ret',
    '.end',
  ]);
}

function writeEntryConflictFixture(prefix: string): string {
  return writeSourceFixture(prefix, [
    '.routine',
    'START:',
    '    ld de,$1000',
    '    call HELPER',
    '    inc de',
    '    ret',
    '.routine',
    'HELPER:',
    '    ld de,$2000',
    '    ld (de),a',
    '    ret',
    '.end',
  ]);
}

function writeScopedPolicyFixture(
  prefix: string,
  legacyLines: string[] = [],
): {
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
    ['.routine', '@START:', '    call LEGACY', '    ret'].join('\n'),
    'utf8',
  );
  writeFileSync(
    legacyFile,
    [
      ...legacyLines,
      ...(legacyLines.some((line) => line.startsWith('.routine')) ? [] : ['.routine']),
      '@LEGACY:',
      '    ld de,$2000',
      '    ret',
    ].join('\n'),
    'utf8',
  );
  return { dir, entry, strictFile, legacyFile };
}

describe('register-contracts integration', () => {
  it('emits a register-contracts report artifact in audit mode', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(entry, ['.routine', 'START:', '    nop', '    ret', '.end'].join('\n'), 'utf8');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    const report = reportArtifact(res);
    expect(report?.text).toContain('AZM Register Contracts Report');
    expect(report?.text).toContain('Mode: audit');
  });

  it('uses single-line routine contracts during strict analysis', async () => {
    const entry = writeSourceFixture('azm-regcontracts-compact-source-contract-', [
      '.routine',
      'START:',
      '    ld a,1',
      '    call HELPER',
      '    ld e,a',
      '    ret',
      '',
      '.routine in A out A clobbers F',
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
        '.routine',
        '@START:',
        '    ld de,$1000',
        '    call MON_CLOBBER_DE',
        '    inc de',
        '    ret',
        '.routine',
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
        'TARGET .equ $9000',
        '.routine',
        '@START:',
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
    writeFileSync(
      entry,
      ['.routine', 'START:', '    rst $10', '    ret', '.end'].join('\n'),
      'utf8',
    );

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
      [
        '.routine',
        'START:',
        '    call HELPER',
        '    ret',
        '.routine',
        'HELPER:',
        '    ld a,1',
        '    ret',
        '.end',
      ].join('\n'),
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

  it('emits inferred register contracts as JSON for human review', async () => {
    const entry = writeConflictFixture('azm-regcontracts-inference-json-');

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterInference: true,
    });

    expectNoErrorDiagnostics(res);
    const inference = inferenceArtifact(res);
    expect(inference?.format).toBe('json');
    expect(inference?.json).toMatchObject({
      format: 'azm-register-contracts-inference',
      version: 1,
    });
    expect(inference?.json?.routines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'HELPER',
          confidence: expect.any(String),
          callerImpact: expect.objectContaining({
            outputCandidateCount: expect.any(Number),
          }),
        }),
      ]),
    );
  });

  it('emits caller-impact evidence when inference runs without audit mode', async () => {
    const entry = writeSourceFixture('azm-regcontracts-inference-candidates-', [
      '.routine',
      'START:',
      '    call HELPER',
      '    ld c,a',
      '    ret',
      '.routine',
      'HELPER:',
      '    ld a,1',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      emitRegisterInference: true,
    });

    expectNoErrorDiagnostics(res);
    const inference = inferenceArtifact(res);
    const helper = inference?.json?.routines.find((routine) => routine.name === 'HELPER');
    expect(helper?.callerImpact).toEqual({
      outputCandidateCount: 1,
      outputCandidateCarriers: ['A'],
    });
  });

  it('emits one inference row for coalesced routine aliases', async () => {
    const entry = writeSourceFixture('azm-regcontracts-inference-alias-', [
      '.routine',
      'ALIAS:',
      'HELPER:',
      '    ld a,1',
      '    ret',
      '.routine',
      'START:',
      '    call HELPER',
      '    ld c,a',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      emitRegisterInference: true,
    });

    expectNoErrorDiagnostics(res);
    const routines = inferenceArtifact(res)?.json?.routines;
    const names = routines?.map((routine) => routine.name);
    expect(names?.filter((name) => name === 'ALIAS')).toHaveLength(1);
    expect(names).not.toContain('HELPER');
    expect(routines?.find((routine) => routine.name === 'ALIAS')?.callerImpact).toEqual({
      outputCandidateCount: 1,
      outputCandidateCarriers: ['A'],
    });
  });

  it('proves strict stack discipline through known internal direct calls', async () => {
    const entry = writeSourceFixture('azm-regcontracts-strict-internal-call-', [
      '.routine',
      '@START:',
      '    call WRAPPER',
      '    ret',
      '.routine',
      '@WRAPPER:',
      '    call HELPER',
      '    ret',
      '.routine',
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
      ['.import "keyboard.asm"', '.routine', '@START:', '    call ReadKey', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );
    writeFileSync(module, ['.routine', '@ReadKey:', '    xor a', '    ret'].join('\n'), 'utf8');

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
      ['.import "keyboard.asm"', '.routine', '@START:', '    call ReadKey', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );
    writeFileSync(
      module,
      [
        '.routine',
        '@ReadKey:',
        '    call ScanMatrix',
        '    ret',
        '.routine',
        'ScanMatrix:',
        '    xor a',
        '    ret',
      ].join('\n'),
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
      [
        '.import "keyboard.asm"',
        '.routine',
        '@START:',
        '    call ScanMatrix',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      module,
      ['.routine', 'ScanMatrix:', '    ret', '.routine', '@ReadKey:', '    ret'].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expect(res.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        code: 'AZMN_SYMBOL',
        message: `symbol "ScanMatrix" is private to ${module}; export it with @ScanMatrix or keep the reference inside that file`,
        sourceName: entry,
        line: 4,
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
      ['.import "keyboard.asm"', '.routine', '@START:', '    call ReadKey', '    ret', '.end'].join(
        '\n',
      ),
      'utf8',
    );
    writeFileSync(module, ['.routine', '@ReadKey:', '    push bc', '    ret'].join('\n'), 'utf8');

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
        '.routine',
        'START:',
        '    call HELPER',
        '    ret',
        '',
        '; Helper prose.',
        '.routine',
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
      ['; Helper prose.', '.routine out HL', 'HELPER:'].join('\n'),
    );
  });

  it('emits source annotations before at-prefixed routine entries without prose comments', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-at-entry-annotation-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        '@START:',
        '    call HELPER',
        '    ret',
        '',
        '.routine',
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
    expect(annotations?.files[0]?.text).toContain(['.routine out HL', '@HELPER:'].join('\n'));
  });

  it('applies conditional jumps to at-prefixed entries as boundary summaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-at-conditional-jp-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        '@START:',
        '    jp z,HELPER',
        '    ret',
        '',
        '.routine',
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
        '  writes: H,L',
        '  preserves: A,B,C,D,E,IXH,IXL,IYH,IYL,carry,zero,sign,parity,halfCarry',
        '  stack: balanced',
      ].join('\n'),
    );
  });

  it('promotes direct caller data uses in source annotations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-annotation-candidates-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        '.routine in A maybe-out A clobbers A,C',
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
      ['; Mask prose.', '.routine in A out A clobbers C', 'MASK:'].join('\n'),
    );
    expect(annotations?.files[0]?.text).not.toContain('maybe-out A');
  });

  it('does not promote suppressed maybe-out output candidates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-suppressed-maybe-out-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        '.rcignore output_candidate "reviewed legacy return"',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        '.routine in A maybe-out A clobbers A,C',
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
    expect(annotationsArtifact(res)?.files[0]?.text).toContain(
      '.routine in A maybe-out A clobbers A,C',
    );
    expect(annotationsArtifact(res)?.files[0]?.text).not.toContain('.routine in A out A');
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
        '.routine',
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '.routine',
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
        '.routine',
        'START:',
        '    ld a,3',
        '    call MASK',
        '    ld e,a',
        '    ret',
        '',
        '; Mask prose.',
        '.routine in A maybe-out A clobbers A,C,B,D,E,H,L,IX,IY,F',
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
    expect(annotations?.files[0]?.text).toContain('.routine in A out A clobbers BC,DE,HL,IX,IY,F');
    expect(annotations?.files[0]?.text).not.toContain('maybe-out A');
  });

  it('does not treat OR A as a data-output use when value-derived flags are dead', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-no-auto-promote-flag-test-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld a,3',
        '    call MASK',
        '    or a',
        '    ret',
        '',
        '; Mask prose.',
        '.routine in A maybe-out A clobbers A,C,B,D,E,H,L,IX,IY,F',
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
    expect(annotations?.files[0]?.text).not.toContain('.routine in A out A');
  });

  it('promotes accepted output candidates in source annotations', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-annotation-accept-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld a,3',
        '    ld hl,$2000',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        '.routine',
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
      ['; Mask prose.', '.routine in HL out A', 'MASK:'].join('\n'),
    );
    expect(annotations?.files[0]?.text).not.toContain('maybe-out A');
  });

  it('includes inferred called routine summaries in the report', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-summary-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    call HELPER',
        '    ret',
        '.routine',
        'HELPER:',
        '    ld a,1',
        '    ret',
        '.end',
      ].join('\n'),
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
        '.routine',
        'ALIAS:',
        'HELPER:',
        '    ld de,$2000',
        '    ld (de),a',
        '    ret',
        '.routine',
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
        '.routine',
        'START:',
        '    ld a,1',
        '    ld ($2000),a',
        '.entry:',
        '    ret',
        '.routine',
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
          line: 8,
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
        '.routine',
        '@START:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        '.routine',
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
            line: 8,
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
      '.routine',
      'START:',
      '    ld de,$1000',
      '    call HELPER',
      '    inc de',
      '    ld de,$1000',
      '    call HELPER',
      '    inc de',
      '    ret',
      '.routine',
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
    expect(
      report?.findings.filter((finding) => finding.callTarget === 'HELPER').length,
    ).toBeGreaterThan(1);
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
      ['.routine clobbers DE'],
    );
    writeFileSync(
      legacyFile,
      [
        '.routine clobbers DE',
        '@LEGACY:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        '.routine',
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
    writeFileSync(
      offFile,
      ['.routine', '@LEGACY:', '    call MISSING', '    ret'].join('\n'),
      'utf8',
    );

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
      ['.routine clobbers DE'],
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
      '.routine',
      'START:',
      '    ld de,$1000',
      '.rcignore definite_contract_violation "legacy monitor wrapper"',
      '    call HELPER',
      '    inc de',
      '    ret',
      '.routine',
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
        location: expect.objectContaining({ line: 5 }),
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
          location: expect.objectContaining({ line: 5 }),
        }),
      }),
    ]);
  });

  it('rejects malformed local register-contract suppressions in strict mode', async () => {
    const entry = writeSourceFixture('azm-regcontracts-bad-suppress-next-', [
      '.routine',
      'START:',
      '    ld de,$1000',
      '.rcignore definite_contract_violation',
      '    call HELPER',
      '    inc de',
      '    ret',
      '.routine',
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
        code: 'AZMN_PARSE',
        line: 4,
        message: expect.stringContaining('.rcignore'),
      }),
    );
  });

  it('rejects malformed local suppressions in scoped strict source', async () => {
    const entry = writeSourceFixture('azm-regcontracts-bad-scoped-suppress-next-', [
      '.routine',
      'START:',
      '    ld de,$1000',
      '.rcignore definite_contract_violation',
      '    call HELPER',
      '    inc de',
      '    ret',
      '.routine',
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
        code: 'AZMN_PARSE',
        line: 4,
        message: expect.stringContaining('.rcignore'),
      }),
    );
  });

  it('keeps suppressed output candidates out of active report sections', async () => {
    const entry = writeSourceFixture('azm-regcontracts-suppress-output-candidate-', [
      '.routine',
      'START:',
      '    ld de,$1000',
      '.rcignore output_candidate "reviewed legacy return"',
      '    call HELPER',
      '    inc de',
      '    ret',
      '.routine',
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
      [
        'MISSING_HELPER .equ $1234',
        '.routine',
        'START:',
        '    call MISSING_HELPER',
        '    ret',
        '.end',
      ].join('\n'),
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
      [
        'MISSING_HELPER .equ $1234',
        '.routine',
        'START:',
        '    call MISSING_HELPER',
        '    ret',
        '.end',
      ].join('\n'),
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
    writeFileSync(
      entry,
      ['.routine', '@START:', '    push bc', '    ret', '.end'].join('\n'),
      'utf8',
    );

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
      '.routine',
      '@START:',
      '    call HELPER',
      '    ret',
      '.routine',
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
      [
        '.routine',
        'START:',
        '    ld a,1',
        '    rst $10',
        '    push af',
        '    pop bc',
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
        '.routine',
        'START:',
        '    ld c,API_SCANKEYS',
        '    rst $10',
        '    jr nz,DONE',
        '    ld e,a',
        '    jr nc,DONE',
        '    inc e',
        '.routine',
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

  it('uses the MON-3 API_RANDOM RST service as an output boundary', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-random-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'API_RANDOM .equ 49',
        '.routine',
        'START:',
        '    ld c,API_RANDOM',
        '    rst $10',
        '    ld e,a',
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

  it('treats B as clobbered by the MON-3 API_RANDOM RST service', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-random-clobber-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld b,7',
        '    ld c,49',
        '    rst $10',
        '    push bc',
        '    pop de',
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
        message: expect.stringContaining('may modify B, but the pre-call value is used later'),
      }),
    );
  });

  it('matches MON-3 API_SCANKEYS service names without requiring underscore spelling', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-scankeys-alias-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'ApiScanKeys .equ 16',
        '.routine',
        'START:',
        '    ld c,ApiScanKeys',
        '    rst $10',
        '    jr nz,DONE',
        '    ld e,a',
        '    jr nc,DONE',
        '    inc e',
        '.routine',
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
        '.routine',
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
        '.routine',
        'START:',
        '    ld c,API_SCANKEYS',
        '    nop',
        '    rst $10',
        '    jr nz,DONE',
        '    ld e,a',
        '.routine',
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

  it('models MON-3 bank-call RST service as consuming the caller stack frame', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-bank-call-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'MON_BANK_CALL .equ $53',
        '.routine',
        'START:',
        '    ld a,$12',
        '    push hl',
        '    push de',
        '    push af',
        '    ld b,$01',
        '    ld hl,TARGET',
        '    ld c,MON_BANK_CALL',
        '    rst $10',
        '    jr c,DONE',
        '    ld e,a',
        '.routine',
        'DONE:',
        '    ret',
        '.routine',
        'TARGET:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsProfile: 'mon3',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    const report = reportArtifact(res);
    expect(report?.text).toContain('MON3_API_83_BANK_CALL');
    expect(report?.text).toContain('stack: balanced');
  });

  it('rejects MON-3 bank-call stack frames with the wrong saved register shape', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-mon3-bank-call-bad-frame-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        'MON_BANK_CALL .equ $53',
        '.routine',
        'START:',
        '    push bc',
        '    push de',
        '    push af',
        '    ld b,$01',
        '    ld hl,TARGET',
        '    ld c,MON_BANK_CALL',
        '    rst $10',
        '    ret',
        '.routine',
        'TARGET:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsProfile: 'mon3',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('stack is unbalanced'),
      }),
    );
  });

  it('models configured TecMate expansion RST service ranges as returning A and carry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tecmate-expansion-service-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'tecmate.asmi');
    writeFileSync(
      entry,
      [
        'SVC_BASE .equ $60',
        '.routine',
        'START:',
        '    ld c,SVC_BASE',
        '    rst $10',
        '    jr c,DONE',
        '    ld e,a',
        '.routine',
        'DONE:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      iface,
      [
        'service rst $10 C >= $60 TECMATE_EXPANSION_SERVICE',
        'in C',
        'out A,carry',
        'clobbers B,C,D,E,H,L,zero,sign,parity,halfCarry',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsProfile: 'mon3',
      registerContractsInterfaces: [iface],
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    expect(reportArtifact(res)?.text).toContain('TECMATE_EXPANSION_SERVICE');
  });

  it('uses conservative configured TecMate expansion RST service ranges for clobber checks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tecmate-expansion-clobber-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'tecmate.asmi');
    writeFileSync(
      entry,
      [
        'SVC_BASE .equ $60',
        '.routine',
        'START:',
        '    ld hl,$1234',
        '    ld c,SVC_BASE',
        '    rst $10',
        '    ld a,h',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      iface,
      [
        'service rst $10 C >= $60 TECMATE_EXPANSION_SERVICE',
        'in C',
        'out A,carry',
        'clobbers B,C,D,E,H,L,zero,sign,parity,halfCarry',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsProfile: 'mon3',
      registerContractsInterfaces: [iface],
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('RST_$10 may modify H'),
      }),
    );
  });

  it('proves stack balance when local dispatcher arms pop a shared entry frame', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-stack-dispatcher-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        '@START:',
        '    push hl',
        '    push de',
        '    push af',
        '    cp 1',
        '    jp z,_armOne',
        '    pop af',
        '    pop de',
        '    pop hl',
        '    ret',
        '_armOne:',
        '    pop af',
        '    pop de',
        '    pop hl',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsProfile: 'mon3',
    });

    expectNoErrorDiagnostics(res);
  });

  it('proves stack balance when local dispatch arms restore before tail-jumping', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-stack-tail-dispatch-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'extern.asmi');
    writeFileSync(
      entry,
      [
        'TARGET .equ $9000',
        '.routine',
        '@START:',
        '    push af',
        '    cp 1',
        '    jr z,_probe',
        '    pop af',
        '    jp TARGET',
        '_probe:',
        '    pop af',
        '    jp TARGET',
        '.end',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      iface,
      ['extern TARGET', 'clobbers A,carry,zero,sign,parity,halfCarry', 'end'].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsInterfaces: [iface],
    });

    expectNoErrorDiagnostics(res);
  });

  it('reports stack imbalance when only one branch arm restores a pushed frame', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-stack-asymmetric-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        '@START:',
        '    push af',
        '    jr z,_skipRestore',
        '    pop af',
        '_skipRestore:',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );

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

  it('prefers exact configured RST service contracts over configured ranges during inference', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-exact-over-range-'));
    const entry = join(dir, 'main.asm');
    const iface = join(dir, 'tecmate.asmi');
    writeFileSync(
      entry,
      [
        'SVC_BASE .equ $60',
        '.routine',
        '@START:',
        '    ld h,$12',
        '    call CALL_SERVICE',
        '    ld a,h',
        '    ret',
        '.routine',
        'CALL_SERVICE:',
        '    ld c,SVC_BASE',
        '    rst $10',
        '    ret',
        '.end',
      ].join('\n'),
      'utf8',
    );
    writeFileSync(
      iface,
      [
        'service rst $10 C $60 TFS_MOUNT',
        'in C',
        'out A,carry',
        'preserves B,C,D,E,H,L',
        'end',
        'service rst $10 C >= $60 TECMATE_EXPANSION_SERVICE',
        'in C',
        'out A,carry',
        'clobbers B,C,D,E,H,L,zero,sign,parity,halfCarry',
        'end',
      ].join('\n'),
      'utf8',
    );

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      registerContractsInterfaces: [iface],
    });

    expectNoErrorDiagnostics(res);
  });

  it('uses known unconditional JP targets as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tail-jp-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld a,1',
        '    call WRAPPER',
        '    jr nz,_done',
        '_done:',
        '    ret',
        '.routine',
        'WRAPPER:',
        '    ld a,2',
        '    jp FLAG_CALLEE',
        '.routine',
        'FLAG_CALLEE:',
        '    xor a',
        '    jr z,_flagDone',
        '_flagDone:',
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
        '.routine',
        'START:',
        '    ld a,1',
        '    call WRAPPER_A',
        '    jr nz,_done',
        '_done:',
        '    ret',
        '.routine',
        'WRAPPER_A:',
        '    jp WRAPPER_B',
        '.routine',
        'WRAPPER_B:',
        '    jp FLAG_CALLEE',
        '.routine',
        'FLAG_CALLEE:',
        '    xor a',
        '    jr z,_flagDone',
        '_flagDone:',
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

  it('propagates known unconditional JR tail-call summaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-tail-jr-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld a,1',
        '    call WRAPPER',
        '    jr nz,_done',
        '_done:',
        '    ret',
        '.routine',
        'WRAPPER:',
        '    ld a,2',
        '    jr FLAG_CALLEE',
        '.routine',
        'FLAG_CALLEE:',
        '    xor a',
        '    jr z,_flagDone',
        '_flagDone:',
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

  it.each(['jp', 'jr'])(
    'does not infer unreachable writes after an unconditional %s tail',
    async (tailMnemonic) => {
      const entry = writeSourceFixture('azm-regcontracts-tail-dead-code-', [
        '.routine',
        'WRAPPER:',
        `    ${tailMnemonic} CALLEE`,
        '_dead:',
        '    ld b,1',
        '    ret',
        '.routine',
        'CALLEE:',
        '    ret',
        '.end',
      ]);

      const res = await compileRegisterContracts(entry, {
        registerContracts: 'audit',
        emitRegisterReport: true,
        registerContractsReportFormat: 'json',
      });

      expectNoErrorDiagnostics(res);
      expect(reportArtifact(res)?.json?.summaries).toContainEqual(
        expect.objectContaining({
          name: 'WRAPPER',
          mayWrite: expect.not.arrayContaining(['B']),
          valueRelations: expect.not.arrayContaining([
            expect.objectContaining({ out: expect.arrayContaining(['B']) }),
          ]),
        }),
      );
    },
  );

  it.each(['jp', 'jr'])(
    'retains the local fallback path that bypasses an unconditional %s tail',
    async (tailMnemonic) => {
      const entry = writeSourceFixture('azm-regcontracts-tail-bypass-', [
        '.routine',
        'WRAPPER:',
        '    jr z,_fallback',
        `    ${tailMnemonic} CALLEE`,
        '_fallback:',
        '    ld b,1',
        '    ret',
        '.routine',
        'CALLEE:',
        '    ret',
        '.end',
      ]);

      const res = await compileRegisterContracts(entry, {
        registerContracts: 'audit',
        emitRegisterReport: true,
        registerContractsReportFormat: 'json',
      });

      expectNoErrorDiagnostics(res);
      expect(reportArtifact(res)?.json?.summaries).toContainEqual(
        expect.objectContaining({
          name: 'WRAPPER',
          mayWrite: expect.arrayContaining(['B']),
          preserved: expect.not.arrayContaining(['B']),
        }),
      );
    },
  );

  it.each(['jp', 'jr'])(
    'uses explicit extern contracts for conditional %s tails',
    async (tailMnemonic) => {
      const dir = mkdtempSync(join(tmpdir(), `azm-regcontracts-extern-${tailMnemonic}-tail-`));
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'extern.asmi');
      writeFileSync(
        entry,
        [
          'TARGET .equ $0008',
          '.routine',
          'WRAPPER:',
          `    ${tailMnemonic} z,TARGET`,
          '    ret',
          '.end',
        ].join('\n'),
        'utf8',
      );
      writeFileSync(iface, ['extern TARGET', 'in C', 'clobbers B', 'end'].join('\n'), 'utf8');

      const res = await compileRegisterContracts(entry, {
        registerContracts: 'strict',
        registerContractsInterfaces: [iface],
        emitRegisterReport: true,
        registerContractsReportFormat: 'json',
      });

      expectNoErrorDiagnostics(res);
      expect(reportArtifact(res)?.json?.summaries).toContainEqual(
        expect.objectContaining({
          name: 'WRAPPER',
          mayRead: expect.arrayContaining(['C', 'zero']),
          mayWrite: expect.arrayContaining(['B']),
        }),
      );
    },
  );

  it('merges conditional JP and JR tail exits with their fallthrough paths', async () => {
    const entry = writeSourceFixture('azm-regcontracts-conditional-tail-merge-', [
      '.routine',
      'CALL_JR:',
      '    ld b,1',
      '    call WRAP_JR',
      '    inc b',
      '    ret',
      '.routine',
      'CALL_JP:',
      '    ld b,1',
      '    call WRAP_JP',
      '    inc b',
      '    ret',
      '.routine',
      'WRAP_JR:',
      '    jr z,CALLEE',
      '    ret',
      '.routine',
      'WRAP_JP:',
      '    jp z,CALLEE',
      '    ret',
      '.routine',
      'CALLEE:',
      '    ld b,2',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    for (const name of ['WRAP_JR', 'WRAP_JP']) {
      expect(res.diagnostics).toContainEqual(
        expect.objectContaining({
          code: 'AZMN_REGISTER_CONTRACTS',
          severity: 'error',
          message: expect.stringContaining(`CALL ${name} may modify B`),
        }),
      );
      expect(reportArtifact(res)?.json?.summaries).toContainEqual(
        expect.objectContaining({
          name,
          mayRead: expect.arrayContaining(['zero']),
          mayWrite: expect.arrayContaining(['B']),
          preserved: expect.not.arrayContaining(['B']),
          valueRelations: expect.not.arrayContaining([
            expect.objectContaining({ out: expect.arrayContaining(['B']) }),
          ]),
        }),
      );
    }
  });

  it('propagates stack proof status through conditional tail exits', async () => {
    const entry = writeSourceFixture('azm-regcontracts-conditional-tail-stack-', [
      '.routine',
      'WRAP_BAD:',
      '    jr z,BAD_STACK',
      '    ret',
      '.routine',
      'WRAP_UNKNOWN:',
      '    jp z,UNKNOWN_STACK',
      '    ret',
      '.routine',
      'BAD_STACK:',
      '    push af',
      '    ret',
      '.routine',
      'UNKNOWN_STACK:',
      '    ex (sp),hl',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    expectNoErrorDiagnostics(res);
    expect(reportArtifact(res)?.json?.summaries).toContainEqual(
      expect.objectContaining({ name: 'WRAP_BAD', stackBalanced: false }),
    );
    expect(reportArtifact(res)?.json?.summaries).toContainEqual(
      expect.objectContaining({
        name: 'WRAP_UNKNOWN',
        hasUnknownStackEffect: true,
      }),
    );
  });

  it('does not treat a repeated pushed-loop state as a returning stack exit', async () => {
    const entry = writeSourceFixture('azm-regcontracts-pushed-loop-', [
      '.routine',
      'WAIT_READY:',
      '    push af',
      '_wait:',
      '    in a,(1)',
      '    rlca',
      '    jr c,_wait',
      '    pop af',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
    });

    expectNoErrorDiagnostics(res);
  });

  it('retains register reads from a nonreturning cycle alongside a returning arm', async () => {
    const entry = writeSourceFixture('azm-regcontracts-cycle-input-', [
      '.routine',
      'LOOP_OR_RETURN:',
      '    jr z,_return',
      '_loop:',
      '    inc b',
      '    jr _loop',
      '_return:',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    expectNoErrorDiagnostics(res);
    expect(reportArtifact(res)?.json?.summaries).toContainEqual(
      expect.objectContaining({
        name: 'LOOP_OR_RETURN',
        mayRead: expect.arrayContaining(['B']),
      }),
    );
  });

  it('accepts a proven stack-neutral infinite loop in strict mode', async () => {
    const entry = writeSourceFixture('azm-regcontracts-infinite-loop-', [
      '.routine',
      'LOOP_FOREVER:',
      '    ld a,1',
      '_loop:',
      '    jr _loop',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'strict',
      emitRegisterReport: true,
      registerContractsReportFormat: 'json',
    });

    expectNoErrorDiagnostics(res);
    expect(reportArtifact(res)?.json?.summaries).toContainEqual(
      expect.objectContaining({
        name: 'LOOP_FOREVER',
        mayWrite: expect.arrayContaining(['A']),
        valueRelations: expect.not.arrayContaining([
          expect.objectContaining({ out: expect.arrayContaining(['A']) }),
        ]),
      }),
    );
  });

  it.each(['jp', 'jr'])('emits strict errors for unknown direct-%s tail boundaries', async (jump) => {
    const dir = mkdtempSync(join(tmpdir(), `azm-regcontracts-unknown-tail-${jump}-`));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      ['MISSING_TAIL .equ $0004', '.routine', 'START:', `    ${jump} MISSING_TAIL`, '.end'].join(
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
        message: expect.stringContaining(`${jump.toUpperCase()} MISSING_TAIL`),
      }),
    );
  });

  it('does not treat routine-local JR loops as tail-call summary boundaries', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-jr-loop-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld de,0x1234',
        '    ld hl,TEXT',
        '    call LCD_STRING',
        '    ld a,d',
        '    ret',
        '; Keeps A,carry,zero,sign,parity,halfCarry,BC,DE,HL,IX,IY stable for the caller.',
        '.routine',
        'LCD_BUSY:',
        '    push af',
        '_LCD_BUSY_LOOP:',
        '    in a,(1)',
        '    rlca',
        '    jr c,_LCD_BUSY_LOOP',
        '    pop af',
        '    ret',
        '.routine',
        'LCD_STRING:',
        '    ld a,(hl)',
        '    inc hl',
        '    or a',
        '    ret z',
        '    call LCD_BUSY',
        '    jr LCD_STRING',
        '.routine',
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
        '.routine',
        'START:',
        '    ld de,0x1234',
        '    call LOCAL_BRANCH',
        '    inc de',
        '    ret',
        '.routine',
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
        '.routine',
        'BOOT:',
        '    call START',
        '    ret',
        '.routine',
        'START:',
        '    ld de,$1000',
        '    call NORMALISE',
        '    inc de',
        '    ret',
        '.routine in DE out DE clobbers A',
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
        '.routine',
        'BOOT:',
        '    call START',
        '    ret',
        '.routine',
        'START:',
        '    ld de,$1000',
        '    .expectout DE',
        '    call HELPER',
        '    inc de',
        '    ret',
        '.routine',
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

  it('promotes source-level expect-out directives into generated callee contracts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-expects-out-promote-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld a,3',
        '    .expectout A',
        '    call MASK',
        '    ld d,a',
        '    ret',
        '',
        '; Mask prose.',
        '.routine',
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
      ['; Mask prose.', '.routine out A clobbers C', 'MASK:'].join('\n'),
    );
  });

  it('does not autofix suppressed output candidates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'azm-regcontracts-suppressed-candidate-fix-'));
    const entry = join(dir, 'main.asm');
    writeFileSync(
      entry,
      [
        '.routine',
        'START:',
        '    ld de,$1000',
        '.rcignore output_candidate "reviewed legacy return"',
        '    call HELPER',
        '    inc de',
        '    ret',
        '.routine',
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
    const annotations = annotationsArtifact(res);
    expect(annotations?.files[0]?.text).not.toContain('.expectout');
    expect(annotations?.files[0]?.text).toContain('.routine in A clobbers DE\nHELPER:');
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
        '.routine',
        'BOOT:',
        '    call START',
        '    ret',
        '.routine',
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
        '.routine',
        'BOOT:',
        '    call START',
        '    ret',
        '.routine',
        'START:',
        '    call MAKE_PTR',
        '    inc hl',
        '    ret',
        '.routine out HL',
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
        '.routine',
        'BOOT:',
        '    call START',
        '    ret',
        '.routine',
        'START:',
        '    call CLOBBER_HL',
        '    call MAKE_PTR',
        '    inc hl',
        '    ret',
        '.routine',
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
        '.routine',
        'BOOT:',
        '    call START',
        '    ret',
        '.routine',
        'START:',
        '    call CLOBBER_DE',
        '    call MAKE_PTR',
        '    inc hl',
        '    ret',
        '.routine in DE out HL',
        'MAKE_PTR:',
        '    ld h,d',
        '    ld l,e',
        '    ret',
        '.routine',
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
        '.routine',
        'BOOT:',
        '    call START',
        '    ret',
        '.routine',
        'START:',
        '    call MAKE_CARRY',
        '    call c,TARGET',
        '    ret',
        '.routine out carry clobbers halfCarry',
        'MAKE_CARRY:',
        '    scf',
        '    ret',
        '.routine',
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
        '.routine',
        'START:',
        '    ld de,$1000',
        '    call MAKER',
        '    inc de',
        '    ret',
        '.routine out A',
        'GET_A:',
        '    ld a,1',
        '    ret',
        '.routine',
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

  it('errors when an explicit preserves clause contradicts the routine body', async () => {
    const entry = writeSourceFixture('azm-regcontracts-preserves-mismatch-', [
      '.routine',
      'START:',
      '    call WORKER',
      '    ret',
      '.routine preserves B',
      'WORKER:',
      '    ld b,0',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      emitRegisterReport: true,
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('treats B as preserved'),
      }),
    );
    expect(reportArtifact(res)?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'declaration_contract_mismatch',
          routine: 'WORKER',
          carriers: ['B'],
        }),
      ]),
    );
  });

  it('errors when an explicit contract omits a body write that callers treat as preserved', async () => {
    const entry = writeSourceFixture('azm-regcontracts-omitted-write-', [
      '.routine',
      'START:',
      '    call WORKER',
      '    ret',
      '.routine out A',
      'WORKER:',
      '    ld a,1',
      '    ld b,2',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
    });

    expect(res.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'AZMN_REGISTER_CONTRACTS',
        severity: 'error',
        message: expect.stringContaining('treats B as preserved'),
      }),
    );
  });

  it('does not let a callee preserves lie hide a caller declaration mismatch', async () => {
    const entry = writeSourceFixture('azm-regcontracts-delegate-preserves-', [
      '.routine preserves B',
      'CALLER:',
      '    call WORKER',
      '    ret',
      '.routine preserves B',
      'WORKER:',
      '    ld b,0',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      emitRegisterReport: true,
    });

    expect(reportArtifact(res)?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'declaration_contract_mismatch',
          routine: 'WORKER',
          carriers: ['B'],
        }),
        expect.objectContaining({
          kind: 'declaration_contract_mismatch',
          routine: 'CALLER',
          carriers: ['B'],
        }),
      ]),
    );
  });

  it('accepts an accurate explicit contract and still infers bare .routine bodies', async () => {
    const entry = writeSourceFixture('azm-regcontracts-accurate-and-bare-', [
      '.routine',
      'START:',
      '    ld b,1',
      '    call WORKER',
      '    djnz START',
      '    call BARE',
      '    ret',
      '.routine out A clobbers F',
      'WORKER:',
      '    xor a',
      '    ret',
      '.routine',
      'BARE:',
      '    ld c,3',
      '    ret',
      '.end',
    ]);

    const res = await compileRegisterContracts(entry, {
      registerContracts: 'error',
      emitRegisterReport: true,
    });

    expectNoErrorDiagnostics(res);
    expect(reportArtifact(res)?.findings ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'declaration_contract_mismatch' }),
      ]),
    );
  });
});
