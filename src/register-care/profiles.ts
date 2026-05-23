import type { RegisterCareUnit, RoutineSummary } from './types.js';

const FLAG_UNITS: RegisterCareUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

export interface RegisterCareProfileSummary {
  name: 'mon3';
  rst: Map<number, RoutineSummary>;
  rstServices: Map<string, RoutineSummary>;
}

export function rstTargetName(vector: number): string {
  return `RST_$${vector.toString(16).toUpperCase().padStart(2, '0')}`;
}

function normalizeServiceName(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/gu, '').toUpperCase();
}

export function rstServiceTargetName(vector: number, service: string): string {
  return `${rstTargetName(vector)}:${normalizeServiceName(service)}`;
}

export function getRegisterCareProfile(name: 'mon3' | undefined): RegisterCareProfileSummary | undefined {
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
          mayOutput: [],
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
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
          mayOutput: ['A', 'carry', 'zero'],
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
        },
      ],
    ]),
  };
}
