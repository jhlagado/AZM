import type { DirectiveAliasPolicy } from '../directiveAliases.js';
import { resolveDirectiveAlias } from '../directiveAliases.js';
import { advanceAsmQuoteScan, createAsmQuoteScanState } from './quoteScan.js';

type AsmLine =
  | { kind: 'label'; name: string }
  | { kind: 'equ'; name: string; exprText: string }
  | { kind: 'org'; exprText: string }
  | { kind: 'align'; exprText: string }
  | { kind: 'binfrom'; exprText: string }
  | { kind: 'binto'; exprText: string }
  | { kind: 'end' }
  | { kind: 'unsupportedDirective'; label?: string; directive: string }
  | {
      kind: 'rawData';
      label?: string;
      directive: 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr';
      valuesText: string;
    }
  | { kind: 'instruction'; label?: string; head: string; operandText: string };

export function parseAsmLine(
  _filePath: string,
  text: string,
  _lineNo: number,
  _lineStartOffset: number,
  aliasPolicy?: DirectiveAliasPolicy,
): AsmLine | undefined {
  const stripped = stripAsm80Comment(text).trim();
  if (stripped.length === 0) return undefined;

  const colonLabel = /^(@?[A-Za-z_][A-Za-z0-9_]*|\.[A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(stripped);
  if (colonLabel) {
    const label = colonLabel[1]!;
    const rest = colonLabel[2]!.trim();
    if (rest.length === 0) return { kind: 'label', name: label };
    return parseStatement(rest, aliasPolicy, label);
  }

  const equLabel = /^([A-Za-z_][A-Za-z0-9_]*)\s+([.]?[A-Za-z][A-Za-z0-9_]*)\b\s*(.+)$/i.exec(
    stripped,
  );
  if (equLabel && resolveDirectiveAlias(equLabel[2]!, aliasPolicy) === '.equ') {
    return { kind: 'equ', name: equLabel[1]!, exprText: equLabel[3]!.trim() };
  }

  return parseStatement(stripped, aliasPolicy);
}

function stripAsm80Comment(text: string): string {
  const quoteState = createAsmQuoteScanState();
  for (let i = 0; i < text.length; i++) {
    if (
      advanceAsmQuoteScan(text, i, quoteState, {
        singleQuoteStartsCharAt: (source, index) =>
          index === 0 || !/[A-Za-z0-9_]/.test(source[index - 1]!),
      })
    ) {
      continue;
    }
    if (!quoteState.inString && !quoteState.inChar && text[i] === ';') return text.slice(0, i);
  }
  return text;
}

function parseStatement(
  text: string,
  aliasPolicy: DirectiveAliasPolicy | undefined,
  label?: string,
): AsmLine | undefined {
  const maybeDirective = /^([.]?[A-Za-z][A-Za-z0-9_]*)\b\s*(.*)$/.exec(text);
  if (maybeDirective) {
    const canonical = resolveDirectiveAlias(maybeDirective[1]!, aliasPolicy);
    if (canonical === '.equ' && label) {
      return { kind: 'equ', name: label, exprText: maybeDirective[2]!.trim() };
    }
  }

  const directive = /^([.]?[A-Za-z][A-Za-z0-9_]*)\b\s*(.*)$/.exec(text);
  if (directive) {
    const canonical = resolveDirectiveAlias(directive[1]!, aliasPolicy);
    const name = canonical?.slice(1);
    const payload = directive[2]!.trim();
    if (name === 'org') return { kind: 'org', exprText: payload };
    if (name === 'align') return { kind: 'align', exprText: payload };
    if (name === 'binfrom') return { kind: 'binfrom', exprText: payload };
    if (name === 'binto') return { kind: 'binto', exprText: payload };
    if (name === 'end') return { kind: 'end' };
    if (
      name === 'db' ||
      name === 'dw' ||
      name === 'ds' ||
      name === 'cstr' ||
      name === 'pstr' ||
      name === 'istr'
    ) {
      return { kind: 'rawData', ...(label ? { label } : {}), directive: name, valuesText: payload };
    }
    if (text.trimStart().startsWith('.')) {
      return {
        kind: 'unsupportedDirective',
        ...(label ? { label } : {}),
        directive: directive[1]!.replace(/^\./, '').toLowerCase(),
      };
    }
    if (
      name === 'macro' ||
      name === 'rept' ||
      name === 'endm' ||
      name === 'block' ||
      name === 'endblock'
    ) {
      return { kind: 'unsupportedDirective', ...(label ? { label } : {}), directive: name };
    }
  }

  const instruction = /^([A-Za-z][A-Za-z0-9_]*)(?:\s+(.*))?$/.exec(text);
  if (!instruction) return undefined;
  return {
    kind: 'instruction',
    ...(label ? { label } : {}),
    head: instruction[1]!.toLowerCase(),
    operandText: instruction[2]?.trim() ?? '',
  };
}
