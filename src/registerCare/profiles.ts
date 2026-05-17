import type { RegisterCareUnit, RoutineSummary } from './types.js';

export type RegisterCareProfileName = 'mon3';

export interface RegisterCareProfile {
  name: RegisterCareProfileName;
  rst: Map<number, RoutineSummary>;
}

const FLAG_UNITS: RegisterCareUnit[] = [
  'carry',
  'zero',
  'sign',
  'parity',
  'halfCarry',
  'negative',
];

function withImpliedFlagUnits(units: RegisterCareUnit[]): RegisterCareUnit[] {
  return units.includes('F') ? [...new Set([...units, ...FLAG_UNITS])] : [...new Set(units)];
}

export function getRegisterCareProfile(
  name: RegisterCareProfileName | undefined,
): RegisterCareProfile | undefined {
  if (name !== 'mon3') return undefined;

  return {
    name: 'mon3',
    rst: new Map([
      [
        0x10,
        {
          name: 'RST_$10',
          mayRead: [],
          mayWrite: withImpliedFlagUnits(['A', 'F']),
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
          valueRelations: [],
          stackBalanced: true,
          hasUnknownStackEffect: false,
        },
      ],
    ]),
  };
}
