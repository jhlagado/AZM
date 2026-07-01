import type {
  RegisterContractsServiceRangeContract,
  RegisterContractsUnit,
  RoutineSummary,
} from './types.js';

const FLAG_UNITS: RegisterContractsUnit[] = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

export interface RegisterContractsProfileSummary {
  name: 'mon3';
  rst: Map<number, RoutineSummary>;
  rstServices: Map<string, RoutineSummary>;
  rstDispatchers: Map<
    number,
    {
      selector: RegisterContractsUnit;
      services: Map<number, RoutineSummary>;
      rangeServices?: {
        min: number;
        max?: number;
        summary: RoutineSummary;
      }[];
    }
  >;
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

function mon3ApiTargetName(api: number, name: string): string {
  return `MON3_API_${api}_${name.replace(/[^A-Za-z0-9_]/gu, '').toUpperCase()}`;
}

function conservativeMon3ApiSummary(api: number, name: string): RoutineSummary {
  return {
    name: mon3ApiTargetName(api, name),
    mayRead: ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNITS],
    mayWrite: ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNITS],
    mayOutput: [],
    preserved: [],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
}

function mon3ApiServices(
  overrides: ReadonlyMap<number, RoutineSummary>,
): Map<number, RoutineSummary> {
  const names = [
    'SOFTWARE_ID',
    'VERSION_ID',
    'PRE_INIT',
    'BEEP_ALWAYS',
    'CONV_A_TO_SEG',
    'REG_A_TO_ASCII',
    'ASCII_TO_SEGMENT',
    'STRING_COMPARE',
    'HL_TO_STRING',
    'A_TO_STRING',
    'SCAN_SEGMENTS',
    'DISPLAY_ERROR',
    'LCD_BUSY',
    'STRING_TO_LCD',
    'CHAR_TO_LCD',
    'COMMAND_TO_LCD',
    'SCAN_KEYS',
    'SCAN_KEYS_WAIT',
    'MATRIX_SCAN',
    'JOYSTICK_SCAN',
    'SERIAL_ENABLE',
    'SERIAL_DISABLE',
    'TX_BYTE',
    'RX_BYTE',
    'INTEL_HEX_LOAD',
    'SEND_TO_SERIAL_API',
    'RECEIVE_FROM_SERIAL_API',
    'SEND_ASSEMBLY_API',
    'SEND_HEX_API',
    'GEN_DATA_DUMP',
    'CHECK_START_END',
    'MENU_DRIVER',
    'PARAM_DRIVER',
    'TIME_DELAY',
    'PLAY_NOTE',
    'PLAY_TUNE',
    'PLAY_TUNE_MENU',
    'GET_CAPS',
    'GET_SHADOW',
    'GET_PROTECT',
    'GET_EXPAND',
    'SET_CAPS',
    'SET_SHADOW',
    'SET_PROTECT',
    'SET_EXPAND',
    'STRING_TO_SERIAL',
    'RTC_API',
    'MENU_POP',
    'TOGGLE_CAPS',
    'RANDOM',
    'SET_DIS_START',
    'GET_DIS_NEXT',
    'GET_DISASSEMBLY',
    'MATRIX_SCAN_ASCII',
    'PARSE_MATRIX_SCAN',
    'LCD_CONFIRM',
    'GET_GLCD_TERM',
    'SET_GLCD_TERM',
    'LOAD_FROM_DISK',
    'OPEN_FILE',
    'READ_SECTOR',
    'WRITE_SECTOR',
    'RGB_SCAN',
  ];
  const services = new Map(
    names.map((serviceName, api) => [
      api,
      overrides.get(api) ?? conservativeMon3ApiSummary(api, serviceName),
    ]),
  );
  for (const [api, summary] of overrides) {
    services.set(api, summary);
  }
  return services;
}

export function rstDispatcherServiceTargetNames(
  vector: number,
  selectorValue: (register: RegisterContractsUnit) => number | undefined,
  configuredRanges: readonly RegisterContractsServiceRangeContract[] = [],
): string[] {
  const mon3 = getRegisterContractsProfile('mon3');
  const dispatcher = mon3?.rstDispatchers.get(vector);
  const selector = dispatcher?.selector ?? 'C';
  const value = selectorValue(selector);
  if (value === undefined) return [];
  const service = dispatcher?.services.get(value);
  const profileRangeService = dispatcher?.rangeServices?.find((entry) =>
    rangeMatches(value, entry),
  );
  const configuredRangeServices = configuredRanges
    .filter((entry) => entry.vector === vector && entry.selector === selector && rangeMatches(value, entry))
    .map((entry) => entry.target);
  return [
    ...(service ? [service.name] : []),
    ...(profileRangeService ? [profileRangeService.summary.name] : []),
    ...configuredRangeServices,
  ];
}

function rangeMatches(
  value: number,
  range: { readonly min: number; readonly max?: number },
): boolean {
  return value >= range.min && (range.max === undefined || value <= range.max);
}

export function getRegisterContractsProfile(
  name: 'mon3' | undefined,
): RegisterContractsProfileSummary | undefined {
  if (name !== 'mon3') return undefined;

  const matrixScan: RoutineSummary = {
    name: mon3ApiTargetName(18, 'MATRIX_SCAN'),
    mayRead: ['C'],
    mayWrite: ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNITS],
    mayOutput: ['D', 'E', 'zero'],
    preserved: [],
    valueRelations: [{ out: ['D', 'E', 'zero'], from: [] }],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
  const stringToLcd: RoutineSummary = {
    name: mon3ApiTargetName(13, 'STRING_TO_LCD'),
    mayRead: ['C', 'H', 'L'],
    mayWrite: ['A', 'H', 'L', ...FLAG_UNITS],
    mayOutput: [],
    preserved: ['B', 'C', 'D', 'E'],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
  const charToLcd: RoutineSummary = {
    name: mon3ApiTargetName(14, 'CHAR_TO_LCD'),
    mayRead: ['A', 'C'],
    mayWrite: [],
    mayOutput: [],
    preserved: ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNITS],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
  const commandToLcd: RoutineSummary = {
    name: mon3ApiTargetName(15, 'COMMAND_TO_LCD'),
    mayRead: ['B', 'C'],
    mayWrite: [],
    mayOutput: [],
    preserved: ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNITS],
    valueRelations: [],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
  const scanKeys: RoutineSummary = {
    name: mon3ApiTargetName(16, 'SCAN_KEYS'),
    mayRead: ['C'],
    mayWrite: ['A', 'carry', 'zero'],
    mayOutput: ['A', 'carry', 'zero'],
    preserved: ['B', 'C', 'H', 'L'],
    valueRelations: [{ out: ['A', 'carry', 'zero'], from: [] }],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
  const parseMatrixScan: RoutineSummary = {
    name: mon3ApiTargetName(54, 'PARSE_MATRIX_SCAN'),
    mayRead: ['C', 'D', 'E', 'zero'],
    mayWrite: ['A', 'B', 'C', 'H', 'L', 'carry', 'sign', 'parity', 'halfCarry'],
    mayOutput: ['A', 'carry'],
    preserved: ['D', 'E'],
    valueRelations: [{ out: ['A', 'carry'], from: ['D', 'E', 'zero'] }],
    stackBalanced: true,
    hasUnknownStackEffect: false,
  };
  const bankCall: RoutineSummary = {
    name: mon3ApiTargetName(0x53, 'BANK_CALL'),
    mayRead: ['B', 'C', 'H', 'L'],
    mayWrite: ['A', 'B', 'C', 'D', 'E', 'H', 'L', ...FLAG_UNITS],
    mayOutput: ['A', 'carry'],
    preserved: [],
    valueRelations: [{ out: ['A', 'carry'], from: [] }],
    stackBalanced: true,
    hasUnknownStackEffect: false,
    consumesStackFrame: ['AF', 'DE', 'HL'],
  };
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
          mayOutput: ['A', 'carry', 'zero'],
          preserved: ['B', 'C', 'D', 'E', 'H', 'L'],
          valueRelations: [{ out: ['A', 'carry', 'zero'], from: [] }],
          stackBalanced: true,
          hasUnknownStackEffect: false,
        },
      ],
    ]),
    rstDispatchers: new Map([
      [
        0x10,
        {
          selector: 'C',
          services: mon3ApiServices(
            new Map([
              [13, stringToLcd],
              [14, charToLcd],
              [15, commandToLcd],
              [16, scanKeys],
              [18, matrixScan],
              [54, parseMatrixScan],
              [0x53, bankCall],
            ]),
          ),
        },
      ],
    ]),
  };
}
