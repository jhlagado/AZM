/**
 * Addressing step library (spec-driven, v0.4).
 *
 * These helpers are pure: they return typed step pipelines.
 * Rendering to pseudo-assembly text is only for tests/document checks.
 *
 * **Navigation:** Section comments below group exports. Family-level map:
 * [`docs/reference/addressing-steps-overview.md`](../../docs/reference/addressing-steps-overview.md).
 *
 * | Area | Exports (representative) |
 * |------|-------------------------|
 * | Types / render | `StepInstr`, `StepPipeline`, `renderStepInstr`, `renderStepPipeline` |
 * | Save/restore | `SAVE_*`, `RESTORE_*`, `SWAP_HL_DE` |
 * | Base & index | `LOAD_BASE_*`, `LOAD_IDX_*` |
 * | EA combine | `CALC_EA`, `CALC_EA_2`, `CALC_EA_WIDE` |
 * | Byte accessors | `LOAD_REG_EA`, `STORE_REG_EA`, `LOAD_REG_GLOB`, … |
 * | Word accessors | `LOAD_RP_EA`, `STORE_RP_EA`, `LOAD_RP_GLOB`, `LOAD_RP_FVAR`, … |
 * | EA builders (byte / word) | `EA_*`, `EAW_*` |
 * | Templates | `TEMPLATE_L_*`, `TEMPLATE_S_*`, `TEMPLATE_LW_*`, `TEMPLATE_SW_*` |
 */

// --- Section: Types, StepInstr, and rendering helpers ---
export type StepReg8 =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'H'
  | 'L'
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'h'
  | 'l';
export type StepReg16 = 'BC' | 'DE' | 'HL';
export type StepStackReg = 'AF' | 'DE' | 'HL';
export type StepBytePart = 'lo' | 'hi';

export type StepInstr =
  | { kind: 'push'; reg: StepStackReg }
  | { kind: 'pop'; reg: StepStackReg }
  | { kind: 'exDeHl' }
  | { kind: 'exSpHl' }
  | { kind: 'addHlDe' }
  | { kind: 'addHlHl' }
  | { kind: 'incHl' }
  | { kind: 'ldHZero' }
  | { kind: 'ldRegReg'; dst: StepReg8; src: StepReg8 }
  | { kind: 'ldRegMemHl'; reg: StepReg8 }
  | { kind: 'ldMemHlReg'; reg: StepReg8 }
  | { kind: 'ldRegIxDisp'; reg: StepReg8; disp: number }
  | { kind: 'ldIxDispReg'; disp: number; reg: StepReg8 }
  | { kind: 'ldRpByteFromIx'; part: StepBytePart; rp: StepReg16; disp: number }
  | { kind: 'ldIxDispFromRpByte'; disp: number; part: StepBytePart; rp: StepReg16 }
  | { kind: 'ldRpImm'; rp: 'DE' | 'HL'; value: number }
  | { kind: 'ldRpGlob'; rp: 'DE' | 'HL'; glob: string }
  | { kind: 'ldHlPtrGlob'; glob: string }
  | { kind: 'ldRpPtrGlob'; rp: 'BC' | 'DE'; glob: string }
  | { kind: 'ldPtrGlobRp'; glob: string; rp: 'BC' | 'DE' | 'HL' }
  | { kind: 'ldHlRp'; rp: StepReg16 }
  | { kind: 'ldRegGlob'; reg: StepReg8; glob: string }
  | { kind: 'ldGlobReg'; glob: string; reg: StepReg8 }
  | { kind: 'ldRpByteFromReg'; part: StepBytePart; rp: StepReg16; reg: StepReg8 }
  | { kind: 'ldRegFromRpByte'; reg: StepReg8; part: StepBytePart; rp: StepReg16 };

export type StepPipeline = StepInstr[];

const step = <T extends StepInstr>(instr: T): T => instr;

export function renderStepInstr(instr: StepInstr): string {
  switch (instr.kind) {
    case 'push':
      return `push ${instr.reg.toLowerCase()}`;
    case 'pop':
      return `pop ${instr.reg.toLowerCase()}`;
    case 'exDeHl':
      return 'ex de, hl';
    case 'exSpHl':
      return 'ex (sp), hl';
    case 'addHlDe':
      return 'add hl, de';
    case 'addHlHl':
      return 'add hl, hl';
    case 'incHl':
      return 'inc hl';
    case 'ldHZero':
      return 'ld h, 0';
    case 'ldRegReg':
      return `ld ${instr.dst}, ${instr.src}`;
    case 'ldRegMemHl':
      return `ld ${instr.reg}, (hl)`;
    case 'ldMemHlReg':
      return `ld (hl), ${instr.reg}`;
    case 'ldRegIxDisp':
      return `ld ${instr.reg}, (ix${formatDisp(instr.disp)})`;
    case 'ldIxDispReg':
      return `ld (ix${formatDisp(instr.disp)}), ${instr.reg}`;
    case 'ldRpByteFromIx':
      return `ld ${instr.part}(${instr.rp}), (ix${formatDisp(instr.disp)})`;
    case 'ldIxDispFromRpByte':
      return `ld (ix${formatDisp(instr.disp)}), ${instr.part}(${instr.rp})`;
    case 'ldRpImm':
      return `ld ${instr.rp.toLowerCase()}, ${formatImm16(instr.value)}`;
    case 'ldRpGlob':
      return `ld ${instr.rp.toLowerCase()}, ${instr.glob}`;
    case 'ldHlPtrGlob':
      return `ld hl, (${instr.glob})`;
    case 'ldRpPtrGlob':
      return `ld ${instr.rp.toLowerCase()}, (${instr.glob})`;
    case 'ldPtrGlobRp':
      return `ld (${instr.glob}), ${instr.rp}`;
    case 'ldHlRp':
      return `ld hl, ${instr.rp.toLowerCase()}`;
    case 'ldRegGlob':
      return `ld ${instr.reg}, (${instr.glob})`;
    case 'ldGlobReg':
      return `ld (${instr.glob}), ${instr.reg}`;
    case 'ldRpByteFromReg':
      return `ld ${instr.part}(${instr.rp}), ${instr.reg}`;
    case 'ldRegFromRpByte':
      return `ld ${instr.reg}, ${instr.part}(${instr.rp})`;
  }
}

export const renderStepPipeline = (pipeline: StepPipeline): string[] =>
  pipeline.map(renderStepInstr);

// --- Section: Save / restore ---
export const SAVE_HL = (): StepPipeline => [step({ kind: 'push', reg: 'HL' })];
export const SAVE_DE = (): StepPipeline => [step({ kind: 'push', reg: 'DE' })];
export const RESTORE_HL = (): StepPipeline => [step({ kind: 'pop', reg: 'HL' })];
export const RESTORE_DE = (): StepPipeline => [step({ kind: 'pop', reg: 'DE' })];
export const SWAP_HL_DE = (): StepPipeline => [step({ kind: 'exDeHl' })];

// --- Section: Base loaders (DE = base) ---
export const LOAD_BASE_GLOB = (glob: string): StepPipeline => [
  step({ kind: 'ldRpGlob', rp: 'DE', glob }),
];

export const LOAD_BASE_FVAR = (disp: number): StepPipeline => [
  step({ kind: 'ldRegIxDisp', reg: 'e', disp }),
  step({ kind: 'ldRegIxDisp', reg: 'd', disp: disp + 1 }),
];

// --- Section: Index loaders (HL = index) ---
export const LOAD_IDX_CONST = (value: number): StepPipeline => [
  step({ kind: 'ldRpImm', rp: 'HL', value }),
];

export const LOAD_IDX_REG = (reg8: StepReg8): StepPipeline => [
  step({ kind: 'ldHZero' }),
  step({ kind: 'ldRegReg', dst: 'l', src: reg8 }),
];

export const LOAD_IDX_RP = (rp: StepReg16): StepPipeline => [step({ kind: 'ldHlRp', rp })];

export const LOAD_IDX_GLOB = (glob: string): StepPipeline => [step({ kind: 'ldHlPtrGlob', glob })];

export const LOAD_IDX_FVAR = (disp: number): StepPipeline => [
  ...SWAP_HL_DE(),
  ...LOAD_BASE_FVAR(disp),
  ...SWAP_HL_DE(),
];

// --- Section: Combine (HL + DE → EA) ---
export const CALC_EA = (): StepPipeline => [step({ kind: 'addHlDe' })];

export const CALC_EA_2 = (): StepPipeline => [step({ kind: 'addHlHl' }), step({ kind: 'addHlDe' })];

const calcEaShift = (shiftCount: number): StepPipeline => [
  ...Array.from({ length: shiftCount }, () => step({ kind: 'addHlHl' })),
  step({ kind: 'addHlDe' }),
];

const getPow2ShiftCount = (elemSize: number): number | undefined => {
  if (!Number.isInteger(elemSize) || elemSize < 1) return undefined;
  let n = elemSize;
  let shiftCount = 0;
  while (n > 1 && (n & 1) === 0) {
    n >>= 1;
    shiftCount++;
  }
  return n === 1 ? shiftCount : undefined;
};

const calcEaMultiplyOps = (elemSize: number): StepPipeline => {
  const bits = elemSize.toString(2).slice(1);
  const pipeline: StepPipeline = [];
  for (const bit of bits) {
    pipeline.push(step({ kind: 'addHlHl' }));
    if (bit === '1') pipeline.push(step({ kind: 'addHlDe' }));
  }
  return pipeline;
};

const calcEaExact = (elemSize: number): StepPipeline => [
  step({ kind: 'push', reg: 'DE' }),
  step({ kind: 'ldRegReg', dst: 'd', src: 'h' }),
  step({ kind: 'ldRegReg', dst: 'e', src: 'l' }),
  ...calcEaMultiplyOps(elemSize),
  step({ kind: 'pop', reg: 'DE' }),
  step({ kind: 'addHlDe' }),
];

export const CALC_EA_WIDE = (elemSize: number): StepPipeline => {
  if (!Number.isInteger(elemSize) || elemSize < 1) return CALC_EA_2();
  if (elemSize === 1) return CALC_EA();
  const shiftCount = getPow2ShiftCount(elemSize);
  return shiftCount !== undefined ? calcEaShift(shiftCount) : calcEaExact(elemSize);
};

// --- Section: Accessors (byte) ---
export const LOAD_REG_EA = (reg: StepReg8): StepPipeline => [
  step({ kind: 'ldRegMemHl', reg }),
];

export const STORE_REG_EA = (reg: StepReg8): StepPipeline => [
  step({ kind: 'ldMemHlReg', reg }),
];

export const LOAD_REG_GLOB = (reg: StepReg8, glob: string): StepPipeline => [
  ...(reg === 'A' || reg === 'a'
    ? [step({ kind: 'ldRegGlob', reg: 'a', glob })]
    : [
        step({ kind: 'push', reg: 'AF' }),
        step({ kind: 'ldRegGlob', reg: 'a', glob }),
        step({ kind: 'ldRegReg', dst: reg, src: 'a' }),
        step({ kind: 'pop', reg: 'AF' }),
      ]),
];

export const STORE_REG_GLOB = (reg: StepReg8, glob: string): StepPipeline => [
  ...(reg === 'A' || reg === 'a'
    ? [step({ kind: 'ldGlobReg', glob, reg: 'a' })]
    : [
        step({ kind: 'push', reg: 'AF' }),
        step({ kind: 'ldRegReg', dst: 'a', src: reg }),
        step({ kind: 'ldGlobReg', glob, reg: 'a' }),
        step({ kind: 'pop', reg: 'AF' }),
      ]),
];

export const LOAD_REG_REG = (dst: StepReg8, src: StepReg8): StepPipeline => [
  step({
    kind: 'ldRegReg',
    dst,
    src,
  }),
];

// --- Section: Accessors (word) ---
export const LOAD_RP_EA = (rp: StepReg16): StepPipeline => [
  step({ kind: 'ldRegMemHl', reg: 'e' }),
  step({ kind: 'incHl' }),
  step({ kind: 'ldRegMemHl', reg: 'd' }),
  step({ kind: 'ldRpByteFromReg', part: 'lo', rp, reg: 'e' }),
  step({ kind: 'ldRpByteFromReg', part: 'hi', rp, reg: 'd' }),
];

export const STORE_RP_EA = (rp: StepReg16): StepPipeline => [
  ...(rp === 'DE'
    ? []
    : [
        step({ kind: 'ldRegFromRpByte', reg: 'e', part: 'lo', rp }),
        step({ kind: 'ldRegFromRpByte', reg: 'd', part: 'hi', rp }),
      ]),
  step({ kind: 'ldMemHlReg', reg: 'e' }),
  step({ kind: 'incHl' }),
  step({ kind: 'ldMemHlReg', reg: 'd' }),
];

export const STORE_RP_EA_FROM_STACK = (): StepPipeline => [
  step({ kind: 'pop', reg: 'DE' }),
  step({ kind: 'ldMemHlReg', reg: 'e' }),
  step({ kind: 'incHl' }),
  step({ kind: 'ldMemHlReg', reg: 'd' }),
];

export const LOAD_RP_GLOB = (rp: StepReg16, glob: string): StepPipeline => {
  if (rp === 'HL') return [step({ kind: 'ldHlPtrGlob', glob })];
  return [step({ kind: 'ldRpPtrGlob', rp, glob })];
};

export const STORE_RP_GLOB = (rp: StepReg16, glob: string): StepPipeline => [
  step({ kind: 'ldPtrGlobRp', glob, rp }),
];

export const LOAD_RP_FVAR = (rp: StepReg16, disp: number): StepPipeline => [
  ...(rp === 'HL'
    ? [
        step({ kind: 'exDeHl' }),
        step({ kind: 'ldRegIxDisp', reg: 'e', disp }),
        step({ kind: 'ldRegIxDisp', reg: 'd', disp: disp + 1 }),
        step({ kind: 'exDeHl' }),
      ]
    : [
        step({
          kind: 'ldRpByteFromIx',
          part: 'lo',
          rp,
          disp,
        }),
        step({
          kind: 'ldRpByteFromIx',
          part: 'hi',
          rp,
          disp: disp + 1,
        }),
      ]),
];

export const STORE_RP_FVAR = (rp: StepReg16, disp: number): StepPipeline => [
  ...(rp === 'HL'
    ? [
        step({ kind: 'exDeHl' }),
        step({ kind: 'ldIxDispReg', disp, reg: 'e' }),
        step({ kind: 'ldIxDispReg', disp: disp + 1, reg: 'd' }),
        step({ kind: 'exDeHl' }),
      ]
    : [
        step({
          kind: 'ldIxDispFromRpByte',
          disp,
          part: 'lo',
          rp,
        }),
        step({
          kind: 'ldIxDispFromRpByte',
          disp: disp + 1,
          part: 'hi',
          rp,
        }),
      ]),
];

/** Base side of an EA: global symbol or IX/IY frame displacement base. */
type EaAddrBase = { kind: 'glob'; glob: string } | { kind: 'fvar'; fvar: number };

/** Index side of an EA: const, reg8, reg16 pair, frame slot, or global symbol. */
type EaAddrIdx =
  | { kind: 'const'; value: number }
  | { kind: 'reg'; reg8: StepReg8 }
  | { kind: 'rp'; rp: StepReg16 }
  | { kind: 'fvar'; disp: number }
  | { kind: 'glob'; glob: string };

function loadEaBase(b: EaAddrBase): StepPipeline {
  return b.kind === 'glob' ? LOAD_BASE_GLOB(b.glob) : LOAD_BASE_FVAR(b.fvar);
}

function loadEaIdx(i: EaAddrIdx): StepPipeline {
  switch (i.kind) {
    case 'const':
      return LOAD_IDX_CONST(i.value);
    case 'reg':
      return LOAD_IDX_REG(i.reg8);
    case 'rp':
      return LOAD_IDX_RP(i.rp);
    case 'fvar':
      return LOAD_IDX_FVAR(i.disp);
    case 'glob':
      return LOAD_IDX_GLOB(i.glob);
  }
}

/** Byte EA: base + index + HL += DE (see `CALC_EA`). */
function eaByteFromParts(base: EaAddrBase, idx: EaAddrIdx): StepPipeline {
  return [...loadEaBase(base), ...loadEaIdx(idx), ...CALC_EA()];
}

/** Word/scaled EA: base + index + wide multiply-add (see `CALC_EA_WIDE`). */
function eaWideFromParts(base: EaAddrBase, idx: EaAddrIdx, elemSize: number): StepPipeline {
  return [...loadEaBase(base), ...loadEaIdx(idx), ...CALC_EA_WIDE(elemSize)];
}

// --- Section: EA builders (byte size, HL = EA) ---
export const EA_GLOB_CONST = (glob: string, idxConst: number): StepPipeline =>
  eaByteFromParts({ kind: 'glob', glob }, { kind: 'const', value: idxConst });

export const EA_GLOB_REG = (glob: string, reg8: StepReg8): StepPipeline =>
  eaByteFromParts({ kind: 'glob', glob }, { kind: 'reg', reg8 });

export const EA_GLOB_RP = (glob: string, rp: StepReg16): StepPipeline =>
  eaByteFromParts({ kind: 'glob', glob }, { kind: 'rp', rp });

export const EA_FVAR_CONST = (fvar: number, idxConst: number): StepPipeline => {
  const folded = foldFvar(fvar, idxConst);
  return eaByteFromParts({ kind: 'fvar', fvar: folded.base }, { kind: 'const', value: folded.idx });
};

export const EA_FVAR_REG = (fvar: number, reg8: StepReg8): StepPipeline =>
  eaByteFromParts({ kind: 'fvar', fvar }, { kind: 'reg', reg8 });

export const EA_FVAR_RP = (fvar: number, rp: StepReg16): StepPipeline =>
  eaByteFromParts({ kind: 'fvar', fvar }, { kind: 'rp', rp });

export const EA_GLOB_FVAR = (glob: string, fvar: number): StepPipeline =>
  eaByteFromParts({ kind: 'glob', glob }, { kind: 'fvar', disp: fvar });

export const EA_FVAR_FVAR = (fvarBase: number, fvarIdx: number): StepPipeline =>
  eaByteFromParts({ kind: 'fvar', fvar: fvarBase }, { kind: 'fvar', disp: fvarIdx });

export const EA_FVAR_GLOB = (fvar: number, glob: string): StepPipeline =>
  eaByteFromParts({ kind: 'fvar', fvar }, { kind: 'glob', glob });

export const EA_GLOB_GLOB = (globBase: string, globIdx: string): StepPipeline =>
  eaByteFromParts({ kind: 'glob', glob: globBase }, { kind: 'glob', glob: globIdx });

// --- Section: EA builders (word size, HL = EA, scaled) ---
export const EAW_GLOB_CONST = (glob: string, idxConst: number, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'glob', glob }, { kind: 'const', value: idxConst }, elemSize);

export const EAW_GLOB_REG = (glob: string, reg8: StepReg8, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'glob', glob }, { kind: 'reg', reg8 }, elemSize);

export const EAW_GLOB_RP = (glob: string, rp: StepReg16, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'glob', glob }, { kind: 'rp', rp }, elemSize);

export const EAW_FVAR_CONST = (fvar: number, idxConst: number, elemSize = 2): StepPipeline => {
  const folded = foldFvar(fvar, idxConst * elemSize);
  return eaWideFromParts({ kind: 'fvar', fvar: folded.base }, { kind: 'const', value: folded.idx }, elemSize);
};

export const EAW_FVAR_REG = (fvar: number, reg8: StepReg8, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'fvar', fvar }, { kind: 'reg', reg8 }, elemSize);

export const EAW_FVAR_RP = (fvar: number, rp: StepReg16, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'fvar', fvar }, { kind: 'rp', rp }, elemSize);

export const EAW_GLOB_FVAR = (glob: string, fvar: number, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'glob', glob }, { kind: 'fvar', disp: fvar }, elemSize);

export const EAW_FVAR_FVAR = (fvarBase: number, fvarIdx: number, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'fvar', fvar: fvarBase }, { kind: 'fvar', disp: fvarIdx }, elemSize);

export const EAW_FVAR_GLOB = (fvar: number, glob: string, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'fvar', fvar }, { kind: 'glob', glob }, elemSize);

export const EAW_GLOB_GLOB = (globBase: string, globIdx: string, elemSize = 2): StepPipeline =>
  eaWideFromParts({ kind: 'glob', glob: globBase }, { kind: 'glob', glob: globIdx }, elemSize);

// --- Section: Templates — byte loads ---
export const TEMPLATE_L_ABC = (dest: StepReg8, ea: StepPipeline): StepPipeline => [
  ...SAVE_DE(),
  ...SAVE_HL(),
  ...ea,
  ...LOAD_REG_EA(dest),
  ...RESTORE_HL(),
  ...RESTORE_DE(),
];

export const TEMPLATE_L_HL = (dest: 'H' | 'L', ea: StepPipeline): StepPipeline => [
  ...SAVE_DE(),
  ...SAVE_HL(),
  ...ea,
  ...LOAD_REG_EA('E'),
  ...RESTORE_HL(),
  ...LOAD_REG_REG(dest, 'E'),
  ...RESTORE_DE(),
];

export const TEMPLATE_L_DE = (dest: 'D' | 'E', ea: StepPipeline): StepPipeline => [
  ...SAVE_HL(),
  ...SAVE_DE(),
  ...ea,
  ...LOAD_REG_EA('L'),
  ...RESTORE_DE(),
  ...LOAD_REG_REG(dest, 'L'),
  ...RESTORE_HL(),
];

// --- Section: Templates — byte stores ---
export const TEMPLATE_S_ANY = (vreg: StepReg8, ea: StepPipeline): StepPipeline => [
  ...SAVE_DE(),
  ...SAVE_HL(),
  ...ea,
  ...STORE_REG_EA(vreg),
  ...RESTORE_HL(),
  ...RESTORE_DE(),
];

export const TEMPLATE_S_HL = (vreg: 'H' | 'L', ea: StepPipeline): StepPipeline => [
  ...SAVE_DE(),
  ...SAVE_HL(),
  ...ea,
  ...RESTORE_DE(),
  ...STORE_REG_EA(vreg === 'L' ? 'E' : 'D'),
  ...RESTORE_DE(),
];

// --- Section: Templates — word loads ---
export const TEMPLATE_LW_HL = (ea: StepPipeline): StepPipeline => [
  ...SAVE_DE(),
  ...ea,
  ...LOAD_RP_EA('HL'),
  ...RESTORE_DE(),
];

export const TEMPLATE_LW_DE = (ea: StepPipeline): StepPipeline => [
  ...SAVE_HL(),
  ...ea,
  ...LOAD_RP_EA('HL'),
  ...SWAP_HL_DE(),
  ...RESTORE_HL(),
];

export const TEMPLATE_LW_BC = (ea: StepPipeline): StepPipeline => [
  ...SAVE_DE(),
  ...SAVE_HL(),
  ...ea,
  ...LOAD_RP_EA('HL'),
  ...LOAD_REG_REG('C', 'L'),
  ...LOAD_REG_REG('B', 'H'),
  ...RESTORE_HL(),
  ...RESTORE_DE(),
];

// --- Section: Templates — word stores ---
export const TEMPLATE_SW_DEBC = (vpair: 'DE' | 'BC', ea: StepPipeline): StepPipeline =>
  vpair === 'DE'
    ? [...SAVE_HL(), ...SAVE_DE(), ...ea, ...RESTORE_DE(), ...STORE_RP_EA('DE'), ...RESTORE_HL()]
    : [...SAVE_DE(), ...SAVE_HL(), ...ea, ...STORE_RP_EA('BC'), ...RESTORE_HL(), ...RESTORE_DE()];

export const TEMPLATE_SW_HL = (ea: StepPipeline): StepPipeline => [
  ...SAVE_DE(),
  ...SAVE_HL(),
  ...ea,
  ...STORE_RP_EA_FROM_STACK(),
  ...RESTORE_DE(),
];

// --- Section: Private helpers ---
function formatDisp(disp: number): string {
  const hex = Math.abs(disp).toString(16).padStart(2, '0');
  const sign = disp >= 0 ? '+' : '-';
  return `${sign}$${hex}`;
}

function formatImm16(n: number): string {
  const value = ((n & 0xffff) >>> 0).toString(16).toUpperCase().padStart(4, '0');
  return `$${value}`;
}

function foldFvar(fvar: number, idxConst: number): { base: number; idx: number } {
  const disp = fvar + idxConst;
  if (disp >= -128 && disp <= 127) {
    return { base: disp, idx: 0 };
  }
  return { base: fvar, idx: idxConst };
}
