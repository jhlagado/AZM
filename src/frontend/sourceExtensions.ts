import { extname } from 'node:path';

export const sourceExtensions = ['.asm', '.z80'] as const;

export function isSupportedSourcePath(path: string): boolean {
  const ext = extname(path).toLowerCase();
  return ext === '.asm' || ext === '.z80';
}

export function isAzmNativePath(path: string): boolean {
  return isSupportedSourcePath(path);
}
