import { readFile } from 'node:fs/promises';
import { normalize } from 'node:path';

import type { Diagnostic } from './model/diagnostic.js';
import type { Artifact } from './outputs/types.js';
import { analyzeRegisterContracts } from './register-contracts/analyze.js';
import { parseAcceptedOutputCandidates } from './register-contracts/accept-output.js';
import { parseInterfaceContracts } from './register-contracts/interfaceContracts.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsJsonReportModel,
  RoutineContract,
} from './register-contracts/types.js';
import type { LoadedProgramNext } from './tooling/api.js';
import type { CompileNextFunctionOptions } from './api-compile.js';

export function shouldAnalyzeRegisterContracts(options: CompileNextFunctionOptions): boolean {
  const registerContractsMode = options.registerContracts ?? options.registerCare ?? 'off';
  return (
    registerContractsMode !== 'off' ||
    options.emitRegisterReport === true ||
    options.emitRegisterInterface === true ||
    options.emitRegisterAnnotations === true ||
    options.fixRegisterContracts === true ||
    options.registerContractsPolicy !== undefined ||
    (options.acceptRegisterOutputCandidates?.length ?? 0) > 0 ||
    (options.registerContractsInterfaces?.length ?? options.registerCareInterfaces?.length ?? 0) > 0 ||
    options.registerContractsBaseline !== undefined
  );
}

export async function runRegisterContracts(
  loadedProgram: LoadedProgramNext,
  options: CompileNextFunctionOptions,
): Promise<{
  readonly artifacts: readonly Artifact[];
  readonly diagnostics: readonly Diagnostic[];
}> {
  const diagnostics: Diagnostic[] = [];
  const artifacts: Artifact[] = [];
  const interfaceContracts = await loadInterfaceContracts(
    options.registerContractsInterfaces ?? options.registerCareInterfaces ?? [],
    diagnostics,
  );
  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts };
  }
  const baselineReport = await loadBaselineReport(options.registerContractsBaseline, diagnostics);
  if (hasErrors(diagnostics)) {
    return { diagnostics, artifacts };
  }

  const registerContracts = analyzeRegisterContracts(loadedProgram, {
    mode: options.registerContracts ?? options.registerCare ?? 'off',
    ...(options.registerContractsPolicy !== undefined
      ? { policy: options.registerContractsPolicy }
      : {}),
    emitReport: options.emitRegisterReport === true,
    ...(options.registerContractsReportFormat !== undefined
      ? { reportFormat: options.registerContractsReportFormat }
      : {}),
    emitInterface: options.emitRegisterInterface === true,
    emitAnnotations:
      options.emitRegisterAnnotations === true || options.fixRegisterContracts === true,
    fixRegisterContracts: options.fixRegisterContracts === true,
    acceptedOutputCandidates: parseAcceptedOutputCandidates(
      options.acceptRegisterOutputCandidates ?? [],
    ),
    ...(options.registerContractsProfile !== undefined || options.registerCareProfile !== undefined
      ? {
          registerContractsProfile: options.registerContractsProfile ?? options.registerCareProfile,
        }
      : {}),
    ...(interfaceContracts.length > 0 ? { interfaceContracts } : {}),
    ...(baselineReport !== undefined ? { baselineReport } : {}),
    ...(options.registerContractsBaseline !== undefined
      ? { baselineFile: normalize(options.registerContractsBaseline) }
      : {}),
    ratchet: options.registerContractsRatchet === true,
  } satisfies AnalyzeRegisterContractsOptions);

  if (registerContracts.reportText !== undefined) {
    artifacts.push({
      kind: 'register-contracts-report',
      ...(registerContracts.reportFormat !== undefined
        ? { format: registerContracts.reportFormat }
        : {}),
      text: registerContracts.reportText,
      ...(registerContracts.reportJson !== undefined ? { json: registerContracts.reportJson } : {}),
      ...(registerContracts.findings !== undefined ? { findings: registerContracts.findings } : {}),
    });
  }
  if (registerContracts.interfaceText !== undefined) {
    artifacts.push({ kind: 'register-contracts-interface', text: registerContracts.interfaceText });
  }
  if (registerContracts.annotations !== undefined && registerContracts.annotations.length > 0) {
    artifacts.push({
      kind: 'register-contracts-annotations',
      files: registerContracts.annotations.map((item) => ({
        path: item.path,
        text: item.text,
      })),
    });
  }
  diagnostics.push(...registerContracts.diagnostics);
  return { artifacts, diagnostics };
}

async function loadBaselineReport(
  rawPath: string | undefined,
  diagnostics: Diagnostic[],
): Promise<RegisterContractsJsonReportModel | undefined> {
  if (rawPath === undefined) return undefined;
  const baselinePath = normalize(rawPath);
  try {
    const parsed = JSON.parse(await readFile(baselinePath, 'utf8')) as Partial<RegisterContractsJsonReportModel>;
    if (parsed.format !== 'azm-register-contracts-report' || !Array.isArray(parsed.findings)) {
      diagnostics.push({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        sourceName: baselinePath,
        message: 'Register contracts baseline must be a JSON register-contracts report',
      });
      return undefined;
    }
    return parsed as RegisterContractsJsonReportModel;
  } catch (error) {
    diagnostics.push({
      severity: 'error',
      code: 'AZMN_REGISTER_CONTRACTS',
      sourceName: baselinePath,
      message: `Unable to read register contracts baseline: ${String(error)}`,
    });
    return undefined;
  }
}

async function loadInterfaceContracts(
  interfaces: readonly string[],
  diagnostics: Diagnostic[],
): Promise<RoutineContract[]> {
  const interfaceContracts: RoutineContract[] = [];

  for (const rawInterface of interfaces) {
    const contractPath = normalize(rawInterface);
    if (contractPath.slice(-5).toLowerCase() !== '.asmi') {
      diagnostics.push({
        severity: 'error',
        code: 'AZMN_REGISTER_CONTRACTS',
        message: 'Register contracts interface files must use the .asmi extension',
        sourceName: contractPath,
      });
      continue;
    }
    const interfaceText = await readFile(contractPath, 'utf8');
    for (const contract of parseInterfaceContracts(interfaceText, contractPath).values()) {
      interfaceContracts.push(contract);
    }
  }

  return interfaceContracts;
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}
