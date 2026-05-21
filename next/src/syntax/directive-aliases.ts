const BUILT_IN_DIRECTIVE_ALIASES = new Map<string, string>([
  ['ORG', '.org'],
  ['EQU', '.equ'],
  ['DB', '.db'],
  ['DW', '.dw'],
  ['DS', '.ds'],
]);

export function normalizeDirectiveAlias(text: string): string {
  const trimmed = text.trimStart();
  const leading = text.slice(0, text.length - trimmed.length);
  const label = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*:)\s+(.+)$/.exec(trimmed);
  if (label) {
    return `${leading}${label[1]} ${normalizeHead(label[2] ?? '')}`;
  }

  const equ = /^([A-Za-z_.$?][A-Za-z0-9_.$?]*)\s+([A-Za-z]+)\b(.*)$/.exec(trimmed);
  if (equ && (equ[2] ?? '').toUpperCase() === 'EQU') {
    return `${leading}${equ[1]} .equ${equ[3] ?? ''}`;
  }

  return `${leading}${normalizeHead(trimmed)}`;
}

function normalizeHead(text: string): string {
  const head = /^([A-Za-z]+)\b(.*)$/.exec(text);
  if (!head) {
    return text;
  }

  const canonical = BUILT_IN_DIRECTIVE_ALIASES.get((head[1] ?? '').toUpperCase());
  if (!canonical) {
    return text;
  }

  return `${canonical}${head[2] ?? ''}`;
}
