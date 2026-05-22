import type { Asm80Artifact } from './types.js';

const asm80UnavailableText =
  '; lowered ASM80 output is not implemented in AZM Next yet.\n; This artifact is intentionally stubbed while API shape is established.\n';

export function writeAsm80(_sourceText: string): Asm80Artifact {
  return { kind: 'asm80', text: asm80UnavailableText };
}
