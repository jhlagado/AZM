import { extname } from 'node:path';

export type SourceMode = 'zax' | 'asm80';

export function inferSourceMode(path: string): SourceMode {
  const ext = extname(path).toLowerCase();
  return ext === '.z80' || ext === '.asm' ? 'asm80' : 'zax';
}
