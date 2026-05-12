export type EncoderFamily = 'control' | 'alu' | 'io' | 'ld' | 'core' | 'bit';

export type EncoderFallbackMode = 'none' | 'standard' | 'arity-short-circuit';

export type EncoderRegistryEntry =
  | {
      kind: 'zero';
      bytes: Uint8Array;
    }
  | {
      kind: 'family';
      family: EncoderFamily;
      fallback: EncoderFallbackMode;
      arityDiagnostic: (head: string, operandCount: number) => string | undefined;
    };

function expectOneOrTwoWithA(head: string, operandCount: number): string | undefined {
  if (operandCount === 1 || operandCount === 2) return undefined;
  return `${head} expects one operand, or two with destination A`;
}

function expectOneOrTwoWithAOrHl(head: string, operandCount: number): string | undefined {
  if (operandCount === 1 || operandCount === 2) return undefined;
  return `${head} expects one operand, two with destination A, or HL,rr form`;
}

function expectOne(head: string, operandCount: number): string | undefined {
  if (operandCount === 1) return undefined;
  return `${head} expects one operand`;
}

function expectTwo(head: string, operandCount: number): string | undefined {
  if (operandCount === 2) return undefined;
  return `${head} expects two operands`;
}

function expectTwoOrThreeIndexedToReg8(head: string, operandCount: number): string | undefined {
  if (operandCount === 2 || operandCount === 3) return undefined;
  return `${head} expects two operands, or three with indexed source + reg8 destination`;
}

function expectOneOrTwoIndexedToReg8(head: string, operandCount: number): string | undefined {
  if (operandCount === 1 || operandCount === 2) return undefined;
  return `${head} expects one operand, or two with indexed source + reg8 destination`;
}

function expectTwoOps(head: string, operandCount: number): string | undefined {
  if (operandCount === 2) return undefined;
  return `${head} expects two operands`;
}

const identityArity = (_head: string, _operandCount: number): string | undefined => undefined;

type FamilySpec = {
  heads: readonly string[];
  family: EncoderFamily;
  fallback: EncoderFallbackMode;
  arityDiagnostic: (head: string, operandCount: number) => string | undefined;
};

const FAMILY_SPECS: readonly FamilySpec[] = [
  {
    heads: ['ret', 'call', 'djnz', 'jp', 'jr'],
    family: 'control',
    fallback: 'none',
    arityDiagnostic: identityArity,
  },
  {
    heads: ['add', 'sub', 'cp', 'and', 'or', 'xor', 'adc', 'sbc'],
    family: 'alu',
    fallback: 'standard',
    arityDiagnostic: (head, operandCount) => {
      switch (head) {
        case 'add':
          return expectTwoOps(head, operandCount);
        case 'sub':
        case 'cp':
        case 'and':
        case 'or':
        case 'xor':
          return expectOneOrTwoWithA(head, operandCount);
        case 'adc':
        case 'sbc':
          return expectOneOrTwoWithAOrHl(head, operandCount);
        default:
          return undefined;
      }
    },
  },
  {
    heads: ['rst', 'im', 'in', 'out'],
    family: 'io',
    fallback: 'standard',
    arityDiagnostic: identityArity,
  },
  {
    heads: ['ld'],
    family: 'ld',
    fallback: 'none',
    arityDiagnostic: identityArity,
  },
  {
    heads: ['inc', 'dec', 'push', 'pop', 'ex'],
    family: 'core',
    fallback: 'standard',
    arityDiagnostic: (head, operandCount) => {
      if (head === 'ex') return expectTwo(head, operandCount);
      return expectOne(head, operandCount);
    },
  },
  {
    heads: ['bit', 'res', 'set', 'rl', 'rr', 'sla', 'sra', 'srl', 'sll', 'rlc', 'rrc'],
    family: 'bit',
    fallback: 'arity-short-circuit',
    arityDiagnostic: (head, operandCount) => {
      switch (head) {
        case 'bit':
          return expectTwo(head, operandCount);
        case 'res':
        case 'set':
          return expectTwoOrThreeIndexedToReg8(head, operandCount);
        case 'rl':
        case 'rr':
        case 'sla':
        case 'sra':
        case 'srl':
        case 'sll':
        case 'rlc':
        case 'rrc':
          return expectOneOrTwoIndexedToReg8(head, operandCount);
        default:
          return undefined;
      }
    },
  },
];

const ZERO_OPCODE_REGISTRY: Readonly<Record<string, Uint8Array>> = {
  nop: Uint8Array.of(0x00),
  halt: Uint8Array.of(0x76),
  di: Uint8Array.of(0xf3),
  ei: Uint8Array.of(0xfb),
  scf: Uint8Array.of(0x37),
  ccf: Uint8Array.of(0x3f),
  cpl: Uint8Array.of(0x2f),
  daa: Uint8Array.of(0x27),
  rlca: Uint8Array.of(0x07),
  rrca: Uint8Array.of(0x0f),
  rla: Uint8Array.of(0x17),
  rra: Uint8Array.of(0x1f),
  exx: Uint8Array.of(0xd9),
  reti: Uint8Array.of(0xed, 0x4d),
  retn: Uint8Array.of(0xed, 0x45),
  neg: Uint8Array.of(0xed, 0x44),
  rrd: Uint8Array.of(0xed, 0x67),
  rld: Uint8Array.of(0xed, 0x6f),
  ldi: Uint8Array.of(0xed, 0xa0),
  ldir: Uint8Array.of(0xed, 0xb0),
  ldd: Uint8Array.of(0xed, 0xa8),
  lddr: Uint8Array.of(0xed, 0xb8),
  cpi: Uint8Array.of(0xed, 0xa1),
  cpir: Uint8Array.of(0xed, 0xb1),
  cpd: Uint8Array.of(0xed, 0xa9),
  cpdr: Uint8Array.of(0xed, 0xb9),
  ini: Uint8Array.of(0xed, 0xa2),
  inir: Uint8Array.of(0xed, 0xb2),
  ind: Uint8Array.of(0xed, 0xaa),
  indr: Uint8Array.of(0xed, 0xba),
  outi: Uint8Array.of(0xed, 0xa3),
  otir: Uint8Array.of(0xed, 0xb3),
  outd: Uint8Array.of(0xed, 0xab),
  otdr: Uint8Array.of(0xed, 0xbb),
};

const ENCODER_REGISTRY = new Map<string, EncoderRegistryEntry>();

for (const [head, bytes] of Object.entries(ZERO_OPCODE_REGISTRY)) {
  ENCODER_REGISTRY.set(head, {
    kind: 'zero',
    bytes,
  });
}

for (const spec of FAMILY_SPECS) {
  for (const head of spec.heads) {
    ENCODER_REGISTRY.set(head, {
      kind: 'family',
      family: spec.family,
      fallback: spec.fallback,
      arityDiagnostic: spec.arityDiagnostic,
    });
  }
}

export function getEncoderRegistryEntry(head: string): EncoderRegistryEntry | undefined {
  return ENCODER_REGISTRY.get(head.toLowerCase());
}
