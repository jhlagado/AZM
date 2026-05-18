import { extname } from 'node:path';

export type SourceMode = 'azm' | 'zax' | 'asm80';

export function inferSourceMode(path: string): SourceMode {
  const ext = extname(path).toLowerCase();
  if (ext === '.azm') return 'azm';
  return ext === '.z80' || ext === '.asm' ? 'asm80' : 'zax';
}
