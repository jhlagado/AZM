import { extname } from 'node:path';

export type SourceMode = 'azm' | 'asm80';

export const sourceModeExtensions = ['.asm', '.z80'] as const;

export function inferSourceMode(path: string): SourceMode | undefined {
  const ext = extname(path).toLowerCase();
  if (ext === '.asm') return 'azm';
  if (ext === '.z80') return 'azm';
  return undefined;
}

export function isAzmNativePath(path: string): boolean {
  return inferSourceMode(path) === 'azm';
}
