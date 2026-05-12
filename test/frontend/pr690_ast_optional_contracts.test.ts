import { describe, expect, it } from 'vitest';

import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { parseVarDeclLine } from '../../src/frontend/parseModuleCommon.js';
import { parseProgram } from '../../src/frontend/parser.js';
import { makeSourceFile, span } from '../../src/frontend/source.js';

describe('PR690 AST optional contract hardening', () => {
  it('emits discriminated var decl forms for typed and alias declarations', () => {
    const file = makeSourceFile('pr690_var_forms.zax', '');
    const lineSpan = span(file, 0, 0);
    const diagnostics: Diagnostic[] = [];

    const typed = parseVarDeclLine('count: word = $12', lineSpan, 1, 'var', {
      diagnostics,
      modulePath: file.path,
      isReservedTopLevelName: () => false,
    });
    const alias = parseVarDeclLine('slot = table', lineSpan, 2, 'var', {
      diagnostics,
      modulePath: file.path,
      isReservedTopLevelName: () => false,
    });

    expect(diagnostics).toEqual([]);
    expect(typed).toMatchObject({
      kind: 'VarDecl',
      form: 'typed',
      name: 'count',
      typeExpr: { kind: 'TypeName', name: 'word' },
      initializer: { kind: 'VarInitValue' },
    });
    expect(alias).toMatchObject({
      kind: 'VarDecl',
      form: 'alias',
      name: 'slot',
      initializer: { kind: 'VarInitAlias' },
    });
  });

  it('always emits function locals block (empty when no locals declared)', () => {
    const diagnostics: Diagnostic[] = [];
    const program = parseProgram(
      'pr690_func_locals.zax',
      ['func main()', 'ret', 'end', ''].join('\n'),
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
    const fn = program.files[0]?.items[0];
    expect(fn).toMatchObject({
      kind: 'FuncDecl',
      name: 'main',
      locals: { kind: 'VarBlock', scope: 'function', decls: [] },
    });
  });
});
