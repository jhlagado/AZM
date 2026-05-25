import type { LogicalLine } from '../../../src/source/logical-lines.js';
import { stripLineComment } from '../../../src/source/strip-line-comment.js';
import type { DirectiveAliasPolicy } from '../../../src/syntax/directive-aliases.js';
import {
  buildDirectiveAliasPolicy,
  normalizeDirectiveAlias,
} from '../../../src/syntax/directive-aliases.js';
import { parseLogicalLine } from '../../../src/syntax/parse-line.js';
import { parseNextSourceItems } from '../../../src/core/compile.js';
import { createSourceFile } from '../../../src/source/source-file.js';
import { scanLogicalLines } from '../../../src/source/logical-lines.js';
import type { SourceItem } from '../../../src/model/source-item.js';
import type { Diagnostic } from '../../../src/model/diagnostic.js';

export const azmDirectiveAliases = buildDirectiveAliasPolicy();

export const noDirectiveAliases: DirectiveAliasPolicy = {
  directiveAliases: new Map(),
};

export function asmLine(text: string, line = 1, sourceName = '/asm.z80'): LogicalLine {
  return { sourceName, line, text };
}

export type Asm80LineShape =
  | { kind: 'label'; name: string }
  | { kind: 'equ'; name: string; exprText: string }
  | { kind: 'org'; exprText: string }
  | { kind: 'binfrom'; exprText: string }
  | { kind: 'binto'; exprText: string }
  | { kind: 'end' }
  | {
      kind: 'rawData';
      label?: string;
      directive: 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr';
      valuesText: string;
    }
  | { kind: 'instruction'; label?: string; head: string; operandText: string };

export function parseAsm80LineShape(
  text: string,
  line = 1,
  policy: DirectiveAliasPolicy = azmDirectiveAliases,
): Asm80LineShape | undefined {
  const normalized = normalizeDirectiveAlias(stripLineComment(text), policy).trim();
  if (normalized.length === 0) {
    return undefined;
  }

  const parsed = parseLogicalLine(asmLine(text, line), { directiveAliasPolicy: policy });
  const items = parsed.items.filter((item) => item.kind !== 'comment');

  const labelOnly = /^(@?[A-Za-z_.$?][A-Za-z0-9_.$?]*):$/.exec(normalized);
  if (labelOnly && items.length === 1 && items[0]?.kind === 'label') {
    return { kind: 'label', name: items[0].name };
  }

  const labelWithStatement = /^(@?[A-Za-z_.$?][A-Za-z0-9_.$?]*):\s*(.+)$/.exec(normalized);
  if (labelWithStatement) {
    const label = items.find((item) => item.kind === 'label')?.name;
    const statement = labelWithStatement[2] ?? '';
    const shape = statementShape(statement, items.filter((item) => item.kind !== 'label'));
    if (!shape) {
      return undefined;
    }
    if (shape.kind === 'instruction' || shape.kind === 'rawData') {
      return { ...shape, ...(label ? { label } : {}) };
    }
    return shape;
  }

  return statementShape(normalized, items);
}

function statementShape(
  statement: string,
  items: readonly SourceItem[],
): Asm80LineShape | undefined {
  const dottedEqu = /^\.equ\s+(.+)$/.exec(statement);
  if (dottedEqu) {
    const equItem = items.find((item) => item.kind === 'equ');
    if (equItem?.kind === 'equ') {
      return { kind: 'equ', name: equItem.name, exprText: (dottedEqu[1] ?? '').trim() };
    }
  }

  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/.exec(statement);
  if (equ) {
    return { kind: 'equ', name: equ[1] ?? '', exprText: (equ[2] ?? '').trim() };
  }

  const org = /^\.org\s+(.+)$/.exec(statement);
  if (org) {
    return { kind: 'org', exprText: (org[1] ?? '').trim() };
  }

  const binfrom = /^\.binfrom\s+(.+)$/.exec(statement);
  if (binfrom) {
    return { kind: 'binfrom', exprText: (binfrom[1] ?? '').trim() };
  }

  const binto = /^\.binto\s+(.+)$/.exec(statement);
  if (binto) {
    return { kind: 'binto', exprText: (binto[1] ?? '').trim() };
  }

  if (/^\.end\s*$/.test(statement) || /^END\s*$/.test(statement)) {
    return { kind: 'end' };
  }

  const rawData = /^\.(db|dw|ds|cstr|pstr|istr)\s+(.+)$/.exec(statement);
  if (rawData) {
    return {
      kind: 'rawData',
      directive: (rawData[1] ?? 'db').toLowerCase() as 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr',
      valuesText: (rawData[2] ?? '').trim(),
    };
  }

  const instruction = /^([A-Za-z][A-Za-z0-9_]*)(?:\s+(.*))?$/.exec(statement);
  if (instruction) {
    if (items.some((item) => item.kind === 'instruction') || items.length === 0) {
      return {
        kind: 'instruction',
        head: (instruction[1] ?? '').toLowerCase(),
        operandText: (instruction[2] ?? '').trim(),
      };
    }
  }

  if (items.length === 1) {
    const item = items[0];
    if (item?.kind === 'label') {
      return { kind: 'label', name: item.name };
    }
    if (item?.kind === 'equ') {
      return { kind: 'equ', name: item.name, exprText: equExprText(statement) };
    }
  }

  return undefined;
}

function equExprText(statement: string): string {
  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/.exec(statement);
  return (equ?.[2] ?? statement).trim();
}

export function parseAsm80Source(
  source: string,
  policy: DirectiveAliasPolicy = azmDirectiveAliases,
): { diagnostics: readonly Diagnostic[]; items: readonly SourceItem[] } {
  const file = createSourceFile('/asm.z80', source.endsWith('\n') ? source : `${source}\n`);
  return parseNextSourceItems(scanLogicalLines(file), { directiveAliasPolicy: policy });
}

export function sourceItemKinds(items: readonly SourceItem[]): string[] {
  return items.map((item) => item.kind);
}

export function sourceItemNames(items: readonly SourceItem[]): Array<string | undefined> {
  return items.map((item) =>
    item.kind === 'label' || item.kind === 'equ' ? item.name : undefined,
  );
}
