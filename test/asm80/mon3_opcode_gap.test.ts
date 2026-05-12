import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../..');
const mon3Entry = '/Users/johnhardy/Documents/projects/MON3/src/mon3.z80';
const auditScript = resolve(repoRoot, 'scripts/dev/asm80-mon3-audit.mjs');

type AuditJson = {
  files: string[];
  directiveCounts: Record<string, number>;
  instructionHeadCounts: Record<string, number>;
  unknownHeads: string[];
  unsupportedForms: Array<{
    form: string;
    count: number;
    diagnostic: string;
    example: { file: string; line: number; text: string };
  }>;
  currentLocationExpressionCount: number;
  singleQuotedStringExpressionCount: number;
  doubleQuotedStringExpressionCount: number;
};

function runAudit(): AuditJson {
  const output = execFileSync('node', [auditScript, '--json', mon3Entry], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return JSON.parse(output) as AuditJson;
}

describe('MON3 opcode gap audit', () => {
  it.skipIf(!existsSync(mon3Entry))(
    'scans the recursive MON3 source tree and reports encoder gaps explicitly',
    () => {
      const audit = runAudit();

      expect(
        audit.files.map((file) =>
          file.replace('/Users/johnhardy/Documents/projects/MON3/src/', ''),
        ),
      ).toEqual([
        'mon3.z80',
        'packages.z80',
        'glcd_library.z80',
        'disassembler.z80',
        'sound.z80',
        'pata_fat32.z80',
        'rtc.z80',
      ]);
      expect(audit.directiveCounts['.include']).toBe(6);
      expect(audit.directiveCounts['.org']).toBeGreaterThanOrEqual(18);
      expect(audit.instructionHeadCounts.ld).toBeGreaterThan(1800);
      expect(audit.instructionHeadCounts.call).toBeGreaterThan(600);
      expect(audit.instructionHeadCounts.jr).toBeGreaterThan(450);
      expect(audit.unknownHeads).toEqual([]);
      expect(audit.currentLocationExpressionCount).toBeGreaterThan(0);
      expect(audit.singleQuotedStringExpressionCount).toBeGreaterThan(0);
      expect(audit.doubleQuotedStringExpressionCount).toBeGreaterThan(0);
      expect(audit.unsupportedForms).toEqual([]);
    },
  );
});
