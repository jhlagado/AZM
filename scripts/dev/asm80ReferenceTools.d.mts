export function sourceStem(source: string): string;
export function copyAsm80SourceSiblings(source: string, outDir: string, extensions?: RegExp): void;
export function compactSpawnError(result: {
  stdout?: string;
  stderr?: string;
  error?: Error;
  status?: number | null;
}): string;
export function runAsm80BinaryReference(
  source: string,
  asm80: string,
  options?: {
    extensions?: RegExp;
    outputName?: string;
    tempPrefix?: string;
    trimListingRange?: boolean;
  },
):
  | { ok: true; bytes: Buffer; range?: { start: number; end: number } }
  | { ok: false; message: string };
