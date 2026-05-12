import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  compilePlacedProgram,
  flattenLoweredInstructions,
} from './helpers/lowered_program.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('PR452: conditional jump trace placeholders', () => {
  it('emits concrete condition names in structured-control traces', async () => {
    const entries = [
      join(__dirname, '..', 'test', 'codegen-corpus', 'basic_control_flow.zax'),
      join(__dirname, '..', 'test', 'codegen-corpus', 'pr222_locals_retcc_and_ret.zax'),
      join(__dirname, '..', 'test', 'codegen-corpus', 'pr258_op_cc_matcher.zax'),
    ];

    const instrsAll = [];
    for (const entry of entries) {
      const res = await compilePlacedProgram(entry);
      expect(res.diagnostics).toEqual([]);
      const instrs = flattenLoweredInstructions(res.program);
      instrsAll.push(...instrs);
    }

    const hasPlaceholderHead = instrsAll.some((ins) => {
      const head = ins.head.toUpperCase();
      return head.startsWith('JP CC') || head.startsWith('JR CC');
    });
    const hasPlaceholderOperand = instrsAll.some((ins) => {
      const head = ins.head.toUpperCase();
      if (head !== 'JP' && head !== 'JR') return false;
      const first = ins.operands[0];
      return first?.kind === 'reg' && first.name.toUpperCase() === 'CC';
    });

    const seenConds = new Set<string>();
    const condSet = new Set(['Z', 'NZ', 'NC', 'C', 'PO', 'PE', 'P', 'M']);
    const opcodeCond: Record<number, string> = {
      0xc2: 'NZ',
      0xca: 'Z',
      0xd2: 'NC',
      0xda: 'C',
      0xe2: 'PO',
      0xea: 'PE',
      0xf2: 'P',
      0xfa: 'M',
      0x20: 'NZ',
      0x28: 'Z',
      0x30: 'NC',
      0x38: 'C',
    };
    for (const ins of instrsAll) {
      const head = ins.head.toUpperCase();
      if (head.startsWith('JP') || head.startsWith('JR')) {
        const headParts = head.split(/\s+/);
        const headCond = headParts[1];
        if (headCond && condSet.has(headCond)) {
          seenConds.add(headCond);
          continue;
        }
        const first = ins.operands[0];
        if (first?.kind === 'reg') {
          const name = first.name.toUpperCase();
          if (condSet.has(name)) seenConds.add(name);
        }
      }
      const opcode = ins.bytes?.[0];
      const opcodeName = opcode === undefined ? undefined : opcodeCond[opcode];
      if (opcodeName) seenConds.add(opcodeName);
    }

    expect(hasPlaceholderHead).toBe(false);
    expect(hasPlaceholderOperand).toBe(false);
    expect(seenConds.size).toBeGreaterThan(0);
  });

  it('no jp/jr placeholder conditions in IR for basic_control_flow corpus case', async () => {
    const entry = join(__dirname, '..', 'test', 'codegen-corpus', 'basic_control_flow.zax');
    const res = await compilePlacedProgram(entry);
    expect(res.diagnostics).toEqual([]);
    const instrs = flattenLoweredInstructions(res.program);

    const hasPlaceholder = instrs.some((ins) => {
      const head = ins.head.toUpperCase();
      if (head.startsWith('JP CC') || head.startsWith('JR CC')) return true;
      if (head === 'JP' || head === 'JR') {
        const first = ins.operands[0];
        return first?.kind === 'reg' && first.name.toUpperCase() === 'CC';
      }
      return false;
    });

    expect(hasPlaceholder).toBe(false);
  });
});
