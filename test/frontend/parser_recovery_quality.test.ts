/**
 * Parser recovery quality (#1135)
 *
 * Pins diagnostic text together with the partial AST `parseModuleFile` returns. Recovery notes:
 *
 * - Unsupported top-level lines do not allocate a module item; parsing continues on the next line.
 * - An unterminated `func` at EOF does not yield a `FuncDecl` node (parse abandons without a node).
 * - When a function body hits another top-level keyword before `end`, the parser abandons the
 *   function without a node and resumes at that keyword, so later declarations still appear.
 * - Record types use `type Name` with a field block (`name: type` lines + `end`); invalid field
 *   lines are skipped with diagnostics; valid fields before and after still appear in the AST.
 */
import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { DiagnosticIds } from '../../src/diagnosticTypes.js';
import type { ConstDeclNode, ModuleItemNode, TypeDeclNode } from '../../src/frontend/ast.js';
import { parseModuleFile } from '../../src/frontend/parser.js';
import { expectDiagnostic } from '../helpers/diagnostics.js';

const FILE = 'test_recovery.zax';

function parseModule(src: string) {
  const diagnostics: Diagnostic[] = [];
  const mod = parseModuleFile(FILE, src, diagnostics);
  return { mod, diagnostics };
}

function itemKinds(items: ModuleItemNode[]): string[] {
  return items.map((i) => i.kind);
}

describe('parseModuleFile recovery AST shape', () => {
  it('truncated function (EOF, no end): no FuncDecl; diagnostics report missing end', () => {
    const src = `func f(): HL
  nop`;
    const { mod, diagnostics } = parseModule(src);

    expect(mod.items).toHaveLength(0);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      file: FILE,
      line: 1,
      column: 1,
      messageIncludes: 'Unterminated func "f"',
    });
  });

  it('function body interrupted by next top-level: no FuncDecl; following const is still parsed', () => {
    const src = `func g(): HL
  nop
const After = 1`;
    const { mod, diagnostics } = parseModule(src);

    expect(itemKinds(mod.items)).toEqual(['ConstDecl']);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      file: FILE,
      line: 3,
      column: 1,
      messageIncludes: 'Unterminated func "g"',
    });

    const c = mod.items[0] as ConstDeclNode;
    expect(c.kind).toBe('ConstDecl');
    expect(c.name).toBe('After');
  });

  it('invalid top-level token: diagnostic only; next const still becomes an item', () => {
    const src = `totally_unknown_construct
const K = 42`;
    const { mod, diagnostics } = parseModule(src);

    expect(itemKinds(mod.items)).toEqual(['ConstDecl']);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      file: FILE,
      line: 1,
      column: 1,
      messageIncludes: 'Unsupported top-level construct: totally_unknown_construct',
    });

    const c = mod.items[0] as ConstDeclNode;
    expect(c.name).toBe('K');
  });

  it('record type with invalid field line: bad line diagnosed; valid fields before and after remain', () => {
    const src = `type R
  x: byte
  not a field
  y: word
end`;
    const { mod, diagnostics } = parseModule(src);

    expect(mod.items).toHaveLength(1);
    expect(itemKinds(mod.items)).toEqual(['TypeDecl']);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      file: FILE,
      line: 3,
      column: 1,
      messageIncludes: 'record field declaration line "not a field": expected <name>: <type>',
    });

    const t = mod.items[0] as TypeDeclNode;
    expect(t.kind).toBe('TypeDecl');
    expect(t.name).toBe('R');
    expect(t.typeExpr.kind).toBe('RecordType');
    if (t.typeExpr.kind === 'RecordType') {
      expect(t.typeExpr.fields.map((f) => f.name)).toEqual(['x', 'y']);
      expect(t.typeExpr.fields.every((f) => f.kind === 'RecordField')).toBe(true);
    }
  });

  it('truncated record type (no end): TypeDecl retained with parsed fields; unterminated diagnostic', () => {
    const src = `type T
  a: byte`;
    const { mod, diagnostics } = parseModule(src);

    expect(mod.items).toHaveLength(1);
    const t = mod.items[0] as TypeDeclNode;
    expect(t.kind).toBe('TypeDecl');
    expect(t.name).toBe('T');
    expect(t.typeExpr.kind).toBe('RecordType');
    if (t.typeExpr.kind === 'RecordType') {
      expect(t.typeExpr.fields).toHaveLength(1);
      expect(t.typeExpr.fields[0]!.name).toBe('a');
    }
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      file: FILE,
      line: 1,
      column: 1,
      messageIncludes: 'Unterminated type "T"',
    });
  });

  it('top-level asm: skipped with diagnostic; following declaration still parsed', () => {
    const src = `asm
const Z = 0`;
    const { mod, diagnostics } = parseModule(src);

    expect(itemKinds(mod.items)).toEqual(['ConstDecl']);
    expectDiagnostic(diagnostics, {
      id: DiagnosticIds.ParseError,
      severity: 'error',
      file: FILE,
      line: 1,
      column: 1,
      messageIncludes: '"asm" is not a top-level construct',
    });
    expect((mod.items[0] as ConstDeclNode).name).toBe('Z');
  });
});
