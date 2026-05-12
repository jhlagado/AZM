import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import { compilePlacedProgram, flattenLoweredItems } from './helpers/lowered_program.js';

const fixture = join(__dirname, 'fixtures', 'pr320_extern_and_internal_calls.zax');

describe('PR320 extern typed-call preservation', () => {
  it('does not push preserves for extern typed calls but does for internal typed calls', async () => {
    const { program, diagnostics } = await compilePlacedProgram(fixture);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);

    const items = flattenLoweredItems(program);

    // callee_internal prologue preserves AF/BC/DE (return in HL, volatile) per table
    const labelIdx = items.findIndex((item) => item.kind === 'label' && item.name === 'callee_internal');
    expect(labelIdx).toBeGreaterThanOrEqual(0);
    const prologueItems = items.slice(labelIdx + 1, labelIdx + 12).filter((item) => item.kind === 'instr');
    const hasProloguePush = (reg: string) =>
      prologueItems.some(
        (item) =>
          item.head.toUpperCase() === 'PUSH' &&
          item.operands[0]?.kind === 'reg' &&
          item.operands[0].name.toUpperCase() === reg,
      );
    expect(hasProloguePush('AF')).toBe(true);
    expect(hasProloguePush('BC')).toBe(true);
    expect(hasProloguePush('DE')).toBe(true);

    // In main's body, typed calls are emitted as @raw CALL bytes.
    // Verify that no caller-side push AF/BC/DE appears anywhere in main's body
    // between the start of its call sequence and the epilogue label.
    // main's own prologue may push AF/BC/DE (it preserves for its own callers),
    // but there should be no additional preservation injected around call sites.
    const mainLabelIdx = items.findIndex((item) => item.kind === 'label' && item.name === 'main');
    expect(mainLabelIdx).toBeGreaterThanOrEqual(0);
    const mainEpilogueIdx = items.findIndex(
      (item) => item.kind === 'label' && item.name === '__zax_epilogue_1',
    );
    expect(mainEpilogueIdx).toBeGreaterThanOrEqual(mainLabelIdx);

    // Locate main's own prologue push AF/BC/DE (frame setup: push IX + ld IX + add IX,SP first)
    // The first @raw in main is the call to callee_internal; count push AF/BC/DE total in main body.
    const mainBodyItems = items.slice(mainLabelIdx + 1, mainEpilogueIdx);

    // Count push AF, BC, DE occurrences in main body
    const pushCount = (reg: string) =>
      mainBodyItems.filter(
        (item) =>
          item.kind === 'instr' &&
          item.head.toUpperCase() === 'PUSH' &&
          item.operands[0]?.kind === 'reg' &&
          item.operands[0].name.toUpperCase() === reg,
      ).length;

    // Each should appear exactly once (main's own prologue preservation only).
    // If caller-side preservation were injected around call sites, the count would be higher.
    expect(pushCount('AF')).toBe(1);
    expect(pushCount('BC')).toBe(1);
    expect(pushCount('DE')).toBe(1);
  });
});
