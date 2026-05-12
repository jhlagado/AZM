import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmInstructionNode, AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import { encodeInstruction } from '../z80/encode.js';

import type { PlacedNamedSectionContribution } from './sectionPlacement.js';

export type StartupInitCopyEntry = {
  /** Copy region descriptor. */
  kind: 'copy';
  /** Destination address in the final image. */
  destination: number;
  /** Source offset within the packed blob. */
  sourceOffset: number;
  /** Byte length. */
  length: number;
};

export type StartupInitZeroEntry = {
  /** Zero-fill descriptor. */
  kind: 'zero';
  /** Destination start address. */
  destination: number;
  /** Byte length. */
  length: number;
};

export type StartupInitRegion = {
  /** Ordered copy operations. */
  copyEntries: StartupInitCopyEntry[];
  /** Ordered zero-fill operations. */
  zeroEntries: StartupInitZeroEntry[];
  /** Packed init payload bytes. */
  blob: number[];
  /** Encoded opcode bytes for the startup routine. */
  encoded: number[];
};

export const STARTUP_ENTRY_LABEL = '__zax_startup';

type StartupRoutineLabel =
  | 'copy_count_test'
  | 'load_zero_count'
  | 'zero_count_test'
  | 'zero_bytes_test'
  | 'zero_done'
  | 'jump_main';

type StartupRoutineInstruction = {
  head: 'ld' | 'inc' | 'jr' | 'push' | 'add' | 'ex' | 'ldir' | 'pop' | 'dec' | 'xor' | 'jp' | 'or';
  operands: AsmOperandNode[];
};

type StartupRoutineStep =
  | { kind: 'label'; name: StartupRoutineLabel }
  | { kind: 'instruction'; instruction: StartupRoutineInstruction; relTarget?: StartupRoutineLabel };

const STARTUP_SPAN: SourceSpan = {
  file: '<startup-init>',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};
const STARTUP_ENV: CompileEnv = {
  consts: new Map(),
  enums: new Map(),
  types: new Map(),
};

function immExpr(value: number): ImmExprNode {
  return { kind: 'ImmLiteral', span: STARTUP_SPAN, value };
}

function reg(name: string): AsmOperandNode {
  return { kind: 'Reg', span: STARTUP_SPAN, name };
}

function imm(value: number): AsmOperandNode {
  return { kind: 'Imm', span: STARTUP_SPAN, expr: immExpr(value) };
}

function mem(name: string): AsmOperandNode {
  return {
    kind: 'Mem',
    span: STARTUP_SPAN,
    expr: { kind: 'EaName', span: STARTUP_SPAN, name },
  };
}

function label(name: StartupRoutineLabel): StartupRoutineStep {
  return { kind: 'label', name };
}

function instruction(
  head: StartupRoutineInstruction['head'],
  operands: AsmOperandNode[] = [],
): StartupRoutineStep {
  return { kind: 'instruction', instruction: { head, operands } };
}

function jumpRelative(target: StartupRoutineLabel): StartupRoutineStep {
  return {
    kind: 'instruction',
    instruction: { head: 'jr', operands: [imm(0)] },
    relTarget: target,
  };
}

function jumpRelativeIfZero(target: StartupRoutineLabel): StartupRoutineStep {
  return {
    kind: 'instruction',
    instruction: { head: 'jr', operands: [reg('Z'), imm(0)] },
    relTarget: target,
  };
}

function toAsmInstruction(step: StartupRoutineInstruction): AsmInstructionNode {
  return {
    kind: 'AsmInstruction',
    span: STARTUP_SPAN,
    head: step.head,
    operands: step.operands,
  };
}

function buildStartupRoutineSteps(
  initRegionAddress: number,
  blobBase: number,
  mainAddress: number,
): StartupRoutineStep[] {
  return [
    instruction('ld', [reg('HL'), imm(initRegionAddress)]),
    instruction('ld', [reg('C'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('B'), mem('HL')]),
    instruction('inc', [reg('HL')]),

    label('copy_count_test'),
    instruction('ld', [reg('A'), reg('B')]),
    instruction('or', [reg('C')]),
    jumpRelativeIfZero('load_zero_count'),

    instruction('push', [reg('BC')]),
    instruction('ld', [reg('E'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('D'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('C'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('B'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('push', [reg('HL')]),
    instruction('ld', [reg('HL'), imm(blobBase)]),
    instruction('add', [reg('HL'), reg('BC')]),
    instruction('ex', [mem('SP'), reg('HL')]),
    instruction('ld', [reg('C'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('B'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ex', [mem('SP'), reg('HL')]),
    instruction('ldir'),
    instruction('pop', [reg('HL')]),
    instruction('pop', [reg('BC')]),
    instruction('dec', [reg('BC')]),
    jumpRelative('copy_count_test'),

    label('load_zero_count'),
    instruction('ld', [reg('C'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('B'), mem('HL')]),
    instruction('inc', [reg('HL')]),

    label('zero_count_test'),
    instruction('ld', [reg('A'), reg('B')]),
    instruction('or', [reg('C')]),
    jumpRelativeIfZero('jump_main'),

    instruction('push', [reg('BC')]),
    instruction('ld', [reg('E'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('D'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('C'), mem('HL')]),
    instruction('inc', [reg('HL')]),
    instruction('ld', [reg('B'), mem('HL')]),
    instruction('inc', [reg('HL')]),

    label('zero_bytes_test'),
    instruction('ld', [reg('A'), reg('B')]),
    instruction('or', [reg('C')]),
    jumpRelativeIfZero('zero_done'),
    instruction('xor', [reg('A')]),
    instruction('ld', [mem('DE'), reg('A')]),
    instruction('inc', [reg('DE')]),
    instruction('dec', [reg('BC')]),
    jumpRelative('zero_bytes_test'),

    label('zero_done'),
    instruction('pop', [reg('BC')]),
    instruction('dec', [reg('BC')]),
    jumpRelative('zero_count_test'),

    label('jump_main'),
    instruction('jp', [imm(mainAddress)]),
  ];
}

function encodeStartupRoutineSteps(steps: StartupRoutineStep[]): number[] {
  const bytes: number[] = [];
  const labels = new Map<StartupRoutineLabel, number>();
  const relPatches: Array<{ index: number; origin: number; label: StartupRoutineLabel }> = [];
  const diagnostics: Diagnostic[] = [];

  for (const step of steps) {
    if (step.kind === 'label') {
      labels.set(step.name, bytes.length);
      continue;
    }
    const encoded = encodeInstruction(toAsmInstruction(step.instruction), STARTUP_ENV, diagnostics);
    if (!encoded) {
      const message = diagnostics[diagnostics.length - 1]?.message ?? 'unknown startup encode failure';
      throw new Error(`Failed to encode startup instruction "${step.instruction.head}": ${message}`);
    }
    const start = bytes.length;
    bytes.push(...encoded);
    if (step.relTarget) {
      relPatches.push({
        index: start + encoded.length - 1,
        origin: start + encoded.length,
        label: step.relTarget,
      });
    }
  }

  for (const patch of relPatches) {
    const target = labels.get(patch.label);
    if (target === undefined) {
      throw new Error(`Unknown startup routine label "${patch.label}".`);
    }
    const displacement = target - patch.origin;
    if (displacement < -128 || displacement > 127) {
      throw new Error(`Startup routine jump out of range for "${patch.label}".`);
    }
    bytes[patch.index] = displacement & 0xff;
  }

  return bytes;
}

function encodeWord(value: number): [number, number] {
  return [value & 0xff, (value >> 8) & 0xff];
}

function isProvisionallyWritableNamedDataContribution(
  placed: PlacedNamedSectionContribution,
): boolean {
  // v0.5 initial implementation rule: treat anchored named data sections as writable
  // until the root-program classification rule is formalized in a later slice.
  return placed.sink.anchor.key.section === 'data';
}

export function buildStartupInitRegion(
  placedContributions: PlacedNamedSectionContribution[],
): StartupInitRegion {
  const copyEntries: StartupInitCopyEntry[] = [];
  const zeroEntries: StartupInitZeroEntry[] = [];
  const blob: number[] = [];

  for (const placed of placedContributions) {
    if (!isProvisionallyWritableNamedDataContribution(placed)) continue;
    for (const action of placed.sink.startupInitActions) {
      if (action.kind === 'zero') {
        zeroEntries.push({
          kind: 'zero',
          destination: placed.baseAddress + action.offset,
          length: action.length,
        });
        continue;
      }
      const chunk: number[] = [];
      for (let i = 0; i < action.length; i++) {
        const value = placed.sink.bytes.get(action.offset + i) ?? 0;
        chunk.push(value);
      }
      copyEntries.push({
        kind: 'copy',
        destination: placed.baseAddress + action.offset,
        sourceOffset: blob.length,
        length: action.length,
      });
      blob.push(...chunk);
    }
  }

  if (copyEntries.length === 0 && zeroEntries.length === 0) {
    return { copyEntries, zeroEntries, blob, encoded: [] };
  }

  const encoded: number[] = [];
  encoded.push(...encodeWord(copyEntries.length));
  for (const entry of copyEntries) {
    encoded.push(...encodeWord(entry.destination));
    encoded.push(...encodeWord(entry.sourceOffset));
    encoded.push(...encodeWord(entry.length));
  }
  encoded.push(...encodeWord(zeroEntries.length));
  for (const entry of zeroEntries) {
    encoded.push(...encodeWord(entry.destination));
    encoded.push(...encodeWord(entry.length));
  }
  encoded.push(...blob);

  return { copyEntries, zeroEntries, blob, encoded };
}

export function buildStartupInitRoutine(
  initRegionAddress: number,
  region: StartupInitRegion,
  mainAddress: number,
): number[] {
  const blobBase = initRegionAddress + (region.encoded.length - region.blob.length);
  return encodeStartupRoutineSteps(buildStartupRoutineSteps(initRegionAddress, blobBase, mainAddress));
}
