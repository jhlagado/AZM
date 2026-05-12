import { describe, expect, it } from 'vitest';

import type { ProgramNode } from '../src/frontend/ast.js';
import { parseModuleFile } from '../src/frontend/parser.js';
import { DiagnosticIds } from '../src/diagnosticTypes.js';
import { canAccessQualifiedName } from '../src/moduleVisibility.js';
import { buildEnv, evalImmExpr } from '../src/semantics/env.js';
import { sizeOfTypeExpr } from '../src/semantics/layout.js';
import { expectDiagnostic, expectNoDiagnostics } from './helpers/diagnostics.js';

describe('PR575 module visibility scaffolding', () => {
  it('parses exported sectionless declarations and dotted type names', () => {
    const diagnostics: any[] = [];
    const moduleFile = parseModuleFile(
      'root.zax',
      [
        'export type Alias dep.Word',
        'export union Pair',
        '  lo: byte',
        '  hi: byte',
        'end',
        'export enum Mode Off, On',
      ].join('\n'),
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    expect(moduleFile.moduleId).toBe('root');
    expect(moduleFile.items[0]).toMatchObject({ kind: 'TypeDecl', exported: true, typeExpr: { kind: 'TypeName', name: 'dep.Word' } });
    expect(moduleFile.items[1]).toMatchObject({ kind: 'UnionDecl', exported: true });
    expect(moduleFile.items[2]).toMatchObject({ kind: 'EnumDecl', exported: true });
  });

  it('builds qualified visibility maps for exported sectionless symbols', () => {
    const diagnostics: any[] = [];
    const dep = parseModuleFile(
      'dep.zax',
      [
        'export const FOO = 7',
        'export type Word word',
        'export enum Mode Off, On',
      ].join('\n'),
      diagnostics,
    );
    const root = parseModuleFile(
      'root.zax',
      [
        'import "dep.zax"',
        'const LOCAL = dep.FOO',
        'type Alias dep.Word',
      ].join('\n'),
      diagnostics,
    );

    expectNoDiagnostics(diagnostics);
    const program = {
      kind: 'Program',
      span: root.span,
      entryFile: root.path,
      files: [dep, root],
    } as ProgramNode;

    const env = buildEnv(program, diagnostics);

    expectNoDiagnostics(diagnostics);
    expect(env.importedModuleIds!.get(root.path)).toEqual(new Set(['dep']));
    expect(env.visibleConsts!.get('dep.FOO')).toBe(7);
    expect(env.consts.has('dep.FOO')).toBe(false);
    expect(env.visibleTypes!.get('dep.Word')).toBeDefined();
    expect(env.types.has('dep.Word')).toBe(false);
    expect(env.visibleEnums!.get('dep.Mode.Off')).toBe(0);
    expect(env.visibleEnums!.get('dep.Mode.On')).toBe(1);
    expect(env.enums.has('dep.Mode.On')).toBe(false);
    expect(env.consts.get('LOCAL')).toBe(7);
  });

  it('only resolves qualified exported names for directly imported modules', () => {
    const diagnostics: any[] = [];
    const dep = parseModuleFile(
      'dep.zax',
      [
        'export const FOO = 7',
        'export type Word word',
        'export enum Mode Off, On',
      ].join('\n'),
      diagnostics,
    );
    const root = parseModuleFile(
      'root.zax',
      [
        'import "dep.zax"',
        'const LOCAL = dep.FOO',
        'type Alias dep.Word',
      ].join('\n'),
      diagnostics,
    );
    const other = parseModuleFile(
      'other.zax',
      [
        'const FAIL = dep.FOO',
        'type Missing dep.Word',
      ].join('\n'),
      diagnostics,
    );

    const program = {
      kind: 'Program',
      span: root.span,
      entryFile: root.path,
      files: [dep, root, other],
    } as ProgramNode;

    const env = buildEnv(program, diagnostics);

    expect(env.consts.get('LOCAL')).toBe(7);
    expect(
      evalImmExpr(
        { kind: 'ImmName', span: other.items[0]!.span, name: 'dep.FOO' },
        env,
        diagnostics,
      ),
    ).toBeUndefined();
    expect(sizeOfTypeExpr({ kind: 'TypeName', span: other.items[1]!.span, name: 'dep.Word' }, env, diagnostics)).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.SemanticsError,
      severity: 'error',
      message: 'Failed to evaluate const "FAIL".',
    });
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      message: 'Unknown type "dep.Word".',
    });
  });

  it('fails closed for qualified access when import entry is unavailable', () => {
    const diagnostics: any[] = [];
    const dep = parseModuleFile(
      'dep.zax',
      [
        'export const FOO = 7',
        'export type Word word',
      ].join('\n'),
      diagnostics,
    );
    const root = parseModuleFile(
      'root.zax',
      [
        'import "dep.zax"',
      ].join('\n'),
      diagnostics,
    );

    const program = {
      kind: 'Program',
      span: root.span,
      entryFile: root.path,
      files: [dep, root],
    } as ProgramNode;

    const env = buildEnv(program, diagnostics);
    env.importedModuleIds!.delete(root.path);

    expectNoDiagnostics(diagnostics);
    expect(canAccessQualifiedName('dep.FOO', root.path, env)).toBe(false);
    expect(canAccessQualifiedName('root.Local', root.path, env)).toBe(true);
    expect(
      evalImmExpr(
        { kind: 'ImmName', span: root.span, name: 'dep.FOO' },
        env,
        diagnostics,
      ),
    ).toBeUndefined();
    expect(sizeOfTypeExpr({ kind: 'TypeName', span: root.span, name: 'dep.Word' }, env, diagnostics)).toBeUndefined();
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.TypeError,
      severity: 'error',
      message: 'Unknown type "dep.Word".',
    });
  });

  it('uses resolved path-form import edges to determine visibility', () => {
    const diagnostics: any[] = [];
    const dep = parseModuleFile(
      '/workspace/dep.zax',
      ['export const FOO = 7', 'export type Word word'].join('\n'),
      diagnostics,
    );
    const root = parseModuleFile(
      '/workspace/root.zax',
      ['import "../vendor/alias_dep.zax"', 'const LOCAL = dep.FOO'].join('\n'),
      diagnostics,
    );

    const program = {
      kind: 'Program',
      span: root.span,
      entryFile: root.path,
      files: [dep, root],
    } as ProgramNode;

    const env = buildEnv(program, diagnostics, {
      resolvedImportGraph: new Map([
        [dep.path, []],
        [root.path, [dep.path]],
      ]),
    });

    expectNoDiagnostics(diagnostics);
    expect(env.importedModuleIds!.get(root.path)).toEqual(new Set([dep.moduleId]));
    expect(env.consts.get('LOCAL')).toBe(7);
  });

  it('uses resolved module-id-form import edges to determine visibility', () => {
    const diagnostics: any[] = [];
    const dep = parseModuleFile('/workspace/dep.zax', ['export const FOO = 7'].join('\n'), diagnostics);
    const root = parseModuleFile(
      '/workspace/root.zax',
      ['import aliasdep', 'const LOCAL = dep.FOO'].join('\n'),
      diagnostics,
    );

    const program = {
      kind: 'Program',
      span: root.span,
      entryFile: root.path,
      files: [dep, root],
    } as ProgramNode;

    const env = buildEnv(program, diagnostics, {
      resolvedImportGraph: new Map([
        [dep.path, []],
        [root.path, [dep.path]],
      ]),
    });

    expectNoDiagnostics(diagnostics);
    expect(env.importedModuleIds!.get(root.path)).toEqual(new Set([dep.moduleId]));
    expect(env.consts.get('LOCAL')).toBe(7);
  });
});
