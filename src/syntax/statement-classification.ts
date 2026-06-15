import { IDENTIFIER_PATTERN, LABEL_NAME_PATTERN } from './names.js';

const CHAIN_DECLARATION_RE = new RegExp(
  `^${LABEL_NAME_PATTERN}\\s+\\.?(?:equ|enum|type|union|typealias)\\b`,
  'i',
);
const IDENTIFIER_STATEMENT_RE = new RegExp(`^${IDENTIFIER_PATTERN}(?:\\s+.*)?$`);
const EQU_DECLARATION_RE = new RegExp(`^${IDENTIFIER_PATTERN}\\s+\\.?equ\\b`, 'i');
const LAYOUT_DECLARATION_RE = new RegExp(
  `^${IDENTIFIER_PATTERN}\\s+\\.(?:enum|type|union|typealias|field|byte|word|addr)\\b`,
);

export function isChainedDirectiveOrDeclaration(text: string): boolean {
  return (
    /^\./.test(text) ||
    /^(?:org|equ|db|dw|ds|align|include|import|binfrom|binto|cstr|pstr|istr|end|enum|type|union|field|byte|word|addr|endtype|endunion|typealias|if|else|endif|op)\b/i.test(text) ||
    CHAIN_DECLARATION_RE.test(text)
  );
}

export function isPotentialOpInvocationStatement(text: string): boolean {
  if (!IDENTIFIER_STATEMENT_RE.test(text)) return false;
  if (EQU_DECLARATION_RE.test(text)) return false;
  if (LAYOUT_DECLARATION_RE.test(text)) return false;
  if (/^(?:op|end|enum|type|union|field|byte|word|addr)\b/i.test(text)) return false;
  if (/^(?:org|equ|db|dw|ds|align|include|binfrom|binto|cstr|pstr|istr)\b/i.test(text)) {
    return false;
  }
  return true;
}
