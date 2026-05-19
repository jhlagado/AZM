import type { DirectiveAliasPolicy } from '../directiveAliases.js';
import { resolveDirectiveAlias } from '../directiveAliases.js';

export type ClassicLine =
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

export function parseClassicLine(
  _filePath: string,
  text: string,
  _lineNo: number,
  _lineStartOffset: number,
  aliasPolicy?: DirectiveAliasPolicy,
): ClassicLine | undefined {
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
  let inString = false;
  let inChar = false;
  let escaped = false;
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
    if (!inString && ch === "'" && (inChar || i === 0 || !/[A-Za-z0-9_]/.test(text[i - 1]!))) {
      inChar = !inChar;
      continue;
    }
    if (!inString && !inChar && ch === ';') return text.slice(0, i);
  }
  return text;
}

function parseStatement(
  text: string,
  aliasPolicy: DirectiveAliasPolicy | undefined,
  label?: string,
): ClassicLine | undefined {
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
