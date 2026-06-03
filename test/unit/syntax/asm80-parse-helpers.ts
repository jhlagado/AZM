import type { LogicalLine } from '../../../src/source/logical-lines.js';
import { stripLineComment } from '../../../src/source/strip-line-comment.js';
import type { DirectiveAliasPolicy } from '../../../src/syntax/directive-aliases.js';
import { normalizeDirectiveAlias } from '../../../src/syntax/directive-aliases.js';
import { parseLogicalLine } from '../../../src/syntax/parse-line.js';
import type { SourceItem } from '../../../src/model/source-item.js';

import { azmDirectiveAliases } from './asm80-alias-helpers.js';

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
    const shape = statementShape(
      statement,
      items.filter((item) => item.kind !== 'label'),
    );
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
  return (
    equStatementShape(statement, items) ??
    locationDirectiveShape(statement) ??
    endStatementShape(statement) ??
    rawDataStatementShape(statement) ??
    instructionStatementShape(statement, items) ??
    singleParsedItemShape(statement, items)
  );
}

function equStatementShape(
  statement: string,
  items: readonly SourceItem[],
): Asm80LineShape | undefined {
  const dottedEqu = /^\.equ\s+(.+)$/.exec(statement);
  const equItem = items.find((item) => item.kind === 'equ');
  if (dottedEqu && equItem?.kind === 'equ') {
    return { kind: 'equ', name: equItem.name, exprText: (dottedEqu[1] ?? '').trim() };
  }

  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/.exec(statement);
  if (!equ) return undefined;
  return { kind: 'equ', name: equ[1] ?? '', exprText: (equ[2] ?? '').trim() };
}

function locationDirectiveShape(statement: string): Asm80LineShape | undefined {
  for (const kind of ['org', 'binfrom', 'binto'] as const) {
    const shape = expressionDirectiveShape(statement, kind);
    if (shape) return shape;
  }
  return undefined;
}

function expressionDirectiveShape(
  statement: string,
  kind: 'org' | 'binfrom' | 'binto',
): Asm80LineShape | undefined {
  const match = new RegExp(`^\\.${kind}\\s+(.+)$`).exec(statement);
  if (!match) return undefined;
  return { kind, exprText: (match[1] ?? '').trim() };
}

function endStatementShape(statement: string): Asm80LineShape | undefined {
  return /^\.end\s*$/.test(statement) || /^END\s*$/.test(statement) ? { kind: 'end' } : undefined;
}

function rawDataStatementShape(statement: string): Asm80LineShape | undefined {
  const rawData = /^\.(db|dw|ds|cstr|pstr|istr)\s+(.+)$/.exec(statement);
  if (!rawData) return undefined;
  return {
    kind: 'rawData',
    directive: (rawData[1] ?? 'db').toLowerCase() as 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr',
    valuesText: (rawData[2] ?? '').trim(),
  };
}

function instructionStatementShape(
  statement: string,
  items: readonly SourceItem[],
): Asm80LineShape | undefined {
  const instruction = /^([A-Za-z][A-Za-z0-9_]*)(?:\s+(.*))?$/.exec(statement);
  if (!instruction || !hasParsedInstruction(items)) return undefined;
  return {
    kind: 'instruction',
    head: (instruction[1] ?? '').toLowerCase(),
    operandText: (instruction[2] ?? '').trim(),
  };
}

function hasParsedInstruction(items: readonly SourceItem[]): boolean {
  return items.length === 0 || items.some((item) => item.kind === 'instruction');
}

function singleParsedItemShape(
  statement: string,
  items: readonly SourceItem[],
): Asm80LineShape | undefined {
  if (items.length !== 1) return undefined;
  const item = items[0];
  if (item?.kind === 'label') return { kind: 'label', name: item.name };
  if (item?.kind === 'equ')
    return { kind: 'equ', name: item.name, exprText: equExprText(statement) };
  return undefined;
}

function equExprText(statement: string): string {
  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+\.equ\s+(.+)$/.exec(statement);
  return (equ?.[2] ?? statement).trim();
}
