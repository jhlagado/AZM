import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

async function collectTsFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectTsFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function findLocalDiagHelperDefinitions(source: string): number[] {
  const patterns = [
    /^\s*function\s+(diag|diagAt|diagAtWithId|diagAtWithSeverityAndId|warnAt)\s*\(/,
    /^\s*(const|let|var)\s+(diag|diagAt|diagAtWithId|diagAtWithSeverityAndId|warnAt)\s*=/,
  ];
  const lines = source.split(/\r?\n/);
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (patterns.some((pattern) => pattern.test(lines[i]!))) hits.push(i + 1);
  }
  return hits;
}

describe('PR688: lowering diagnostic helper guardrail', () => {
  it('keeps local diag* helper definitions centralized in loweringDiagnostics.ts', async () => {
    const root = join(process.cwd(), 'src', 'lowering');
    const files = await collectTsFiles(root);
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith('loweringDiagnostics.ts')) continue;
      const text = await readFile(file, 'utf8');
      const hitLines = findLocalDiagHelperDefinitions(text);
      for (const line of hitLines) {
        offenders.push(`${relative(process.cwd(), file)}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
