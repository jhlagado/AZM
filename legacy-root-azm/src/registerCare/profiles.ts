import type { RegisterCareUnit, RoutineSummary } from './types.js';

export type RegisterCareProfileName = 'mon3';

interface RegisterCareProfile {
  name: RegisterCareProfileName;
  rst: Map<number, RoutineSummary>;
  rstServices: Map<string, RoutineSummary>;
}

const FLAG_UNITS: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

export function rstTargetName(vector: number): string {
  return `RST_$${vector.toString(16).toUpperCase().padStart(2, '0')}`;
}

function normalizeServiceName(service: string): string {
  return service.replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
}

export function rstServiceTargetName(vector: number, service: string): string {
  return `${rstTargetName(vector)}:${normalizeServiceName(service)}`;
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
          name: rstTargetName(0x10),
          mayRead: [],
          mayWrite: ['A', ...FLAG_UNITS],
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
          valueRelations: [],
          stackBalanced: true,
          hasUnknownStackEffect: false,
        },
      ],
    ]),
    rstServices: new Map([
      [
        rstServiceTargetName(0x10, 'API_SCANKEYS'),
        {
          name: rstServiceTargetName(0x10, 'API_SCANKEYS'),
          mayRead: ['C'],
          mayWrite: ['sign', 'parity', 'halfCarry'],
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
          valueRelations: [{ out: ['A', 'carry', 'zero'], from: [] }],
          stackBalanced: true,
          hasUnknownStackEffect: false,
        },
      ],
    ]),
  };
}
