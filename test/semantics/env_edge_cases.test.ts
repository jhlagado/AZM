import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { ProgramNode } from '../../src/frontend/ast.js';
import { parseModuleFile } from '../../src/frontend/parser.js';
import { buildEnv, evalImmExpr } from '../../src/semantics/env.js';
import { expectDiagnostic, expectNoDiagnostics } from '../helpers/diagnostics.js';

function parseProgram(modulePath: string, source: string): { program: ProgramNode; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const moduleFile = parseModuleFile(modulePath, source, diagnostics);
  const program: ProgramNode = {
    kind: 'Program',
    span: moduleFile.span,
    entryFile: modulePath,
    files: [moduleFile],
  };
  return { program, diagnostics };
}

describe('env edge cases (buildEnv + evalImmExpr)', () => {
  it('diagnoses divide by zero in imm const (ZAX401)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_div.zax',
      ['const Bad = 1 / 0'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ImmDivideByZero,
      severity: 'error',
      messageIncludes: 'Divide by zero',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "Bad".',
    });
  });

  it('diagnoses modulo by zero in imm const (ZAX402)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_mod.zax',
      ['const Bad = 1 % 0'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ImmModuloByZero,
      severity: 'error',
      messageIncludes: 'Modulo by zero',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "Bad".',
    });
  });

  it('fails closed on mutually referential consts (no silent cycle; ZAX400)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_cycle.zax',
      ['const a = b', 'const b = a'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "a".',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "b".',
    });
  });

  it('fails closed on self-referential const (ZAX400)', () => {
    const { program, diagnostics } = parseProgram('edge_self.zax', 'const a = a');
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "a".',
    });
  });

  it('does not resolve forward references between consts (intentional; later wins only after earlier fails)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_forward.zax',
      ['const first = second', 'const second = 1'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "first".',
    });
    expect(env.consts.get('second')).toBe(1);
    expect(env.consts.has('first')).toBe(false);
  });

  it('rejects unqualified enum member when only one qualified name is possible (ZAX400)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_enum_unqual.zax',
      ['enum E1 Off, On', 'const k = Off'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      messageIncludes: 'Unqualified enum member "Off"',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      messageIncludes: 'E1.Off',
    });
  });

  it('rejects ambiguous unqualified enum members across enums (ZAX400)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_enum_ambiguous.zax',
      ['enum E1 Off, On', 'enum E2 Off, X', 'const k = Off'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      messageIncludes: 'ambiguous',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      messageIncludes: 'E1.Off',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      messageIncludes: 'E2.Off',
    });
  });

  it('evaluates qualified enum members in const initializers', () => {
    const { program, diagnostics } = parseProgram(
      'edge_enum_ok.zax',
      ['enum Mode Off, On', 'const k = Mode.Off'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectNoDiagnostics(diagnostics);
    expect(env.consts.get('k')).toBe(0);
    expect(env.enums.get('Mode.On')).toBe(1);
  });

  it('propagates sizeof unknown type as TypeError and failed const (ZAX403 + ZAX400)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_sizeof.zax',
      ['const Sz = sizeof(Nope)'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Unknown type "Nope"',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "Sz".',
    });
  });

  it('rejects const names that collide with type names (ZAX400)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_type_collision.zax',
      ['type T', '  x: byte', 'end', 'const T = 1'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      messageIncludes: 'collides with a type name',
    });
    expect(env.types.has('T')).toBe(true);
    expect(env.consts.has('T')).toBe(false);
  });

  it('propagates offsetof unknown field as TypeError and failed const (ZAX403 + ZAX400)', () => {
    const { program, diagnostics } = parseProgram(
      'edge_offsetof.zax',
      ['type R', '  x: byte', '  y: byte', 'end', 'const o = offsetof(R, z)'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    buildEnv(program, diagnostics);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      messageIncludes: 'Unknown field "z"',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "o".',
    });
  });

  it('evaluates evalImmExpr on a built env for binary arithmetic and bitwise edge cases', () => {
    const { program, diagnostics } = parseProgram(
      'edge_numeric.zax',
      ['const A = 65535', 'const C = (A >> 15) & 1'].join('\n'),
    );
    expectNoDiagnostics(diagnostics);
    const env = buildEnv(program, diagnostics);
    expectNoDiagnostics(diagnostics);
    expect(env.consts.get('C')).toBe(1);
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
