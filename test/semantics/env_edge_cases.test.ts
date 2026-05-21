import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { ProgramNode } from '../../src/frontend/ast.js';
import { parseSourceFile } from '../../src/frontend/parser.js';
import { buildEnv, evalImmExpr } from '../../src/semantics/env.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

function parseSingleFileProgram(sourcePath: string, source: string): { program: ProgramNode; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const sourceFileNode = parseSourceFile(sourcePath, source, diagnostics);
  const program: ProgramNode = {
    kind: 'Program',
    span: sourceFileNode.span,
    entryFile: sourcePath,
    files: [sourceFileNode],
  };
  return { program, diagnostics };
}

describe('env edge cases (buildEnv + evalImmExpr)', () => {
  it('diagnoses divide by zero in imm equ (AZM401)', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_div.asm',
      ['Bad .equ 1 / 0'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ImmDivideByZero,
      severity: 'error',
      messageIncludes: 'Divide by zero',
    });
  });

  it('diagnoses modulo by zero in imm equ (AZM402)', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_mod.asm',
      ['Bad .equ 1 % 0'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ImmModuloByZero,
      severity: 'error',
      messageIncludes: 'Modulo by zero',
    });
  });

  it('leaves mutually referential equates unresolved for later fixup handling', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_cycle.asm',
      ['a .equ b', 'b .equ a'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectNoDiagnostics(diagnostics);
    expect(env.equates.has('a')).toBe(false);
    expect(env.equates.has('b')).toBe(false);
  });

  it('leaves self-referential equates unresolved for later fixup handling', () => {
    const { program, diagnostics } = parseSingleFileProgram('edge_self.asm', 'a .equ a');
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectNoDiagnostics(diagnostics);
    expect(env.equates.has('a')).toBe(false);
  });

  it('resolves forward references between assembler equates', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_forward.asm',
      ['first .equ second', 'second .equ 1'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectNoDiagnostics(diagnostics);
    expect(env.equates.get('second')).toBe(1);
    expect(env.equates.get('first')).toBe(1);
  });

  it('rejects unqualified enum member when only one qualified name is possible (AZM400)', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_enum_unqual.asm',
      ['enum E1 Off, On', 'k .equ Off'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Enum member "Off" must be qualified.',
    });
  });

  it('rejects matching unqualified enum members across enums without namespace guessing (AZM400)', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_enum_ambiguous.asm',
      ['enum E1 Off, On', 'enum E2 Off, X', 'k .equ Off'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Enum member "Off" must be qualified.',
    });
  });

  it('evaluates qualified enum members in equ initializers', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_enum_ok.asm',
      ['enum Mode Off, On', 'k .equ Mode.Off'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectNoDiagnostics(diagnostics);
    expect(env.equates.get('k')).toBe(0);
    expect(env.enums.get('Mode.On')).toBe(1);
  });

  it('propagates sizeof unknown type as a type error', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_sizeof.asm',
      ['Sz .equ sizeof(Nope)'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Unknown type "Nope"',
    });
  });

  it('rejects equate names that collide with type names (AZM400)', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_type_collision.asm',
      ['.type T', 'x .byte', '.endtype', 'T .equ 1'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      messageIncludes: 'collides with a type name',
    });
    expect(env.types.has('T')).toBe(true);
    expect(env.equates.has('T')).toBe(false);
  });

  it('propagates offset unknown field as a type error', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_offset.asm',
      ['.type R', 'x .byte', 'y .byte', '.endtype', 'o .equ offset(R, z)'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Unknown field "z"',
    });
  });

  it('evaluates evalImmExpr on a built env for binary arithmetic and bitwise edge cases', () => {
    const { program, diagnostics } = parseSingleFileProgram(
      'edge_numeric.asm',
      ['A .equ 65535', 'C .equ (A >> 15) & 1'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectNoDiagnostics(diagnostics);
    expect(env.equates.get('C')).toBe(1);
    expect(
      evalImmExpr(
        { kind: 'ImmBinary', span: program.files[0]!.span, op: '<<', left: { kind: 'ImmLiteral', span: program.files[0]!.span, value: 1 }, right: { kind: 'ImmLiteral', span: program.files[0]!.span, value: 4 } },
        env,
        diagnostics,
      ),
    ).toBe(16);
    expectNoDiagnostics(diagnostics);
  });
});
