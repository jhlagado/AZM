import type { Diagnostic } from '../../diagnosticTypes.js';

import type {
  AsmLabelNode,
  ClassicItemNode,
  ClassicModuleFileNode,
  ModuleFileNode,
} from '../ast.js';
import { parseAsmInstruction } from '../parseAsmInstruction.js';
import { parseDiag } from '../parseDiagnostics.js';
import { parseImmExprFromText } from '../parseImm.js';
import { makeSourceFile, type SourceFile, span } from '../source.js';
import type { DirectiveAliasPolicy } from '../directiveAliases.js';
import { parseClassicLine } from './classicLine.js';

function rawLineEndOffset(sourceText: string, startOffset: number): number {
  const newline = sourceText.indexOf('\n', startOffset);
  if (newline === -1) return sourceText.length;
  return newline > startOffset && sourceText[newline - 1] === '\r' ? newline - 1 : newline;
}

function asmLabelName(rawName: string): string {
  return rawName.startsWith('@') ? rawName.slice(1) : rawName;
}

function parseClassicRawValues(
  path: string,
  valuesText: string,
  lineSpan: ReturnType<typeof span>,
  diagnostics: Diagnostic[],
  stringEquates: Map<string, string>,
): unknown[] {
  const out: unknown[] = [];
  const parts = splitTopLevelComma(valuesText)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const part of parts) {
    const rawString = parseWholeQuotedString(part);
    if (rawString !== undefined) {
      if (part[0] === "'" && rawString.length === 1) {
        const expr = parseImmExprFromText(path, part, lineSpan, diagnostics);
        if (expr) {
          out.push(expr);
          continue;
        }
      }
      out.push({ kind: 'ClassicString', value: rawString });
      continue;
    }
    const stringEquate = /^[A-Za-z_][A-Za-z0-9_]*$/.exec(part)
      ? stringEquates.get(part.toLowerCase())
      : undefined;
    if (stringEquate !== undefined) {
      out.push({ kind: 'ClassicString', value: stringEquate });
      continue;
    }
    const expr = parseImmExprFromText(
      path,
      normalizeDoubleQuotedCharExpr(part),
      lineSpan,
      diagnostics,
    );
    if (expr) out.push(expr);
  }
  return out;
}

function parseWholeQuotedString(text: string): string | undefined {
  if (text.length < 2) return undefined;
  const quote = text[0];
  if ((quote !== '"' && quote !== "'") || text[text.length - 1] !== quote) return undefined;

  let value = '';
  for (let i = 1; i < text.length - 1; i++) {
    const ch = text[i]!;
    if (ch === '\\') {
      if (i + 1 >= text.length - 1) return undefined;
      value += text[i + 1]!;
      i++;
      continue;
    }
    if (ch === quote) return undefined;
    value += ch;
  }
  return value;
}

function normalizeDoubleQuotedCharExpr(text: string): string {
  return text.replace(/"([^"\\])"/g, (_match, char: string) => `'${char}'`);
}

function splitTopLevelComma(text: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let inString = false;
  let inChar = false;
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if ((inString || inChar) && ch === '\\') {
      escaped = true;
      continue;
    }
    if (!inChar && ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === "'") {
      inChar = !inChar;
      continue;
    }
    if (inString || inChar) continue;
    if (ch === '(') {
      parenDepth++;
      continue;
    }
    if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (ch === '[') {
      bracketDepth++;
      continue;
    }
    if (ch === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function canonicalDirectiveForRejectedAlias(head: string): string | undefined {
  switch (head.toLowerCase()) {
    case 'defb':
      return 'DB';
    case 'defw':
      return 'DW';
    case 'rmb':
      return 'DS';
    default:
      return undefined;
  }
}

function headColumn(raw: string, head: string, label?: string): number {
  const searchStart = label ? raw.indexOf(':') + 1 : 0;
  const index = raw.toLowerCase().indexOf(head.toLowerCase(), searchStart);
  return index < 0 ? 1 : index + 1;
}

export function parseClassicModule(
  path: string,
  sourceText: string,
  _diagnostics: Diagnostic[],
  sourceFile?: SourceFile,
  aliasPolicy?: DirectiveAliasPolicy,
): ClassicModuleFileNode {
  const file = sourceFile ?? makeSourceFile(path, sourceText);
  const items: ClassicItemNode[] = [];
  let pendingRawLabel: AsmLabelNode | undefined;
  let ended = false;

  const lines = sourceText.split(/\r?\n/);
  const stringEquates = new Map<string, string>();
  for (let index = 0; index < lines.length; index++) {
    const parsed = parseClassicLine(
      path,
      lines[index]!,
      index + 1,
      file.lineStarts[index] ?? 0,
      aliasPolicy,
    );
    if (parsed?.kind === 'end') break;
    if (parsed?.kind !== 'equ') continue;
    const rawString = parseWholeQuotedString(parsed.exprText);
    if (rawString !== undefined && rawString.length > 1) {
      stringEquates.set(asmLabelName(parsed.name).toLowerCase(), rawString);
    }
  }

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index]!;
    const lineStart = file.lineStarts[index] ?? sourceText.length;
    const lineSpan = span(file, lineStart, rawLineEndOffset(sourceText, lineStart));
    const linePath = lineSpan.file;
    const parsed = parseClassicLine(path, raw, index + 1, lineStart, aliasPolicy);
    if (!parsed) continue;
    if (ended && parsed.kind !== 'binfrom' && parsed.kind !== 'binto') continue;

    const labelNode = (rawName: string): AsmLabelNode => {
      const isEntry = rawName.startsWith('@');
      return {
        kind: 'AsmLabel',
        span: lineSpan,
        name: isEntry ? rawName.slice(1) : rawName,
        ...(isEntry ? { isEntry: true } : {}),
      };
    };
    switch (parsed.kind) {
      case 'label': {
        const label = labelNode(parsed.name);
        items.push(label);
        pendingRawLabel = label;
        break;
      }
      case 'instruction': {
        if (parsed.label) {
          items.push(labelNode(parsed.label));
        }
        const canonicalDirective = canonicalDirectiveForRejectedAlias(parsed.head);
        if (canonicalDirective) {
          parseDiag(
            _diagnostics,
            linePath,
            `${parsed.head.toUpperCase()} is not part of the supported ASM80 baseline; use ${canonicalDirective}.`,
            { line: lineSpan.start.line, column: headColumn(raw, parsed.head, parsed.label) },
          );
          pendingRawLabel = undefined;
          break;
        }
        const instruction = parseAsmInstruction(
          linePath,
          parsed.operandText.length > 0 ? `${parsed.head} ${parsed.operandText}` : parsed.head,
          lineSpan,
          _diagnostics,
        );
        if (instruction) items.push({ ...instruction, operandText: parsed.operandText });
        pendingRawLabel = undefined;
        break;
      }
      case 'unsupportedDirective':
        if (parsed.label) {
          items.push(labelNode(parsed.label));
        }
        parseDiag(
          _diagnostics,
          linePath,
          `Unsupported ASM80 directive ".${parsed.directive}". The supported baseline intentionally excludes macros and non-corpus directives.`,
          { line: lineSpan.start.line, column: headColumn(raw, parsed.directive, parsed.label) },
        );
        pendingRawLabel = undefined;
        break;
      case 'equ':
        items.push({
          kind: 'ClassicEqu',
          span: lineSpan,
          name: asmLabelName(parsed.name),
          exprText: parsed.exprText,
          value: parseImmExprFromText(
            linePath,
            normalizeDoubleQuotedCharExpr(parsed.exprText),
            lineSpan,
            _diagnostics,
            !stringEquates.has(asmLabelName(parsed.name).toLowerCase()),
          ),
        } as unknown as ClassicItemNode);
        pendingRawLabel = undefined;
        break;
      case 'org':
        items.push({
          kind: 'ClassicOrg',
          span: lineSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(linePath, parsed.exprText, lineSpan, _diagnostics),
        } as ClassicItemNode);
        pendingRawLabel = undefined;
        break;
      case 'binfrom':
        items.push({
          kind: 'ClassicBinFrom',
          span: lineSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(linePath, parsed.exprText, lineSpan, _diagnostics),
        } as ClassicItemNode);
        pendingRawLabel = undefined;
        break;
      case 'binto':
        items.push({
          kind: 'ClassicBinTo',
          span: lineSpan,
          exprText: parsed.exprText,
          value: parseImmExprFromText(linePath, parsed.exprText, lineSpan, _diagnostics),
        } as ClassicItemNode);
        pendingRawLabel = undefined;
        break;
      case 'align': {
        const value = parseImmExprFromText(linePath, parsed.exprText, lineSpan, _diagnostics);
        if (value) {
          items.push({ kind: 'ClassicAlign', span: lineSpan, value } as unknown as ClassicItemNode);
        }
        pendingRawLabel = undefined;
        break;
      }
      case 'rawData': {
        const name = parsed.label ? asmLabelName(parsed.label) : (pendingRawLabel?.name ?? '');
        const rawData: ClassicItemNode = {
          kind: 'ClassicRawData',
          span: lineSpan,
          name,
          directive: parsed.directive,
          values: parseClassicRawValues(
            linePath,
            parsed.valuesText,
            lineSpan,
            _diagnostics,
            stringEquates,
          ),
          valuesText: parsed.valuesText,
        } as unknown as ClassicItemNode;
        if (parsed.directive === 'ds') {
          const values = (rawData as unknown as { values?: unknown[] }).values;
          const rawDataWithSize = rawData as unknown as { size?: unknown; fill?: unknown };
          rawDataWithSize.size = values?.[0];
          if (values?.[1]) rawDataWithSize.fill = values[1];
        }
        if (!parsed.label && pendingRawLabel) {
          items.pop();
        }
        items.push(rawData);
        pendingRawLabel = undefined;
        break;
      }
      case 'end':
        items.push({ kind: 'ClassicEnd', span: lineSpan });
        ended = true;
        pendingRawLabel = undefined;
        break;
    }
  }

  return { kind: 'ClassicModuleFile', span: span(file, 0, sourceText.length), path, items };
}

export function parseClassicModuleFile(
  path: string,
  sourceText: string,
  diagnostics: Diagnostic[],
  sourceFile?: SourceFile,
  aliasPolicy?: DirectiveAliasPolicy,
): ModuleFileNode {
  const parsed = parseClassicModule(path, sourceText, diagnostics, sourceFile, aliasPolicy);
  return {
    kind: 'ModuleFile',
    span: parsed.span,
    path,
    moduleId: path,
    items: parsed.items,
  };
}
