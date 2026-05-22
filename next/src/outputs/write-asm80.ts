import type { Asm80Artifact } from './types.js';

const asm80Header = '; AZM lowered ASM80 output (AZM Next)';

function normalizeSourceText(sourceText: string): string {
  return sourceText.replace(/\r\n/g, '\n');
}

export function writeAsm80(sourceText: string): Asm80Artifact {
  const body = normalizeSourceText(sourceText);
  return { kind: 'asm80', text: `${asm80Header}\n\n${body}`.replace(/\n+$/, '') + '\n' };
}
