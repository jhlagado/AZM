import { readFile } from 'node:fs/promises';
import { normalize } from 'node:path';

import type { Diagnostic } from './model/diagnostic.js';
import type { Artifact } from './outputs/types.js';
import { analyzeRegisterContracts } from './register-contracts/analyze.js';
import { parseAcceptedOutputCandidates } from './register-contracts/accept-output.js';
import { parseInterfaceContracts } from './register-contracts/interfaceContracts.js';
import type {
  AnalyzeRegisterContractsOptions,
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
    (options.acceptRegisterOutputCandidates?.length ?? 0) > 0 ||
    (options.registerContractsInterfaces?.length ?? options.registerCareInterfaces?.length ?? 0) > 0
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

  const registerContracts = analyzeRegisterContracts(loadedProgram, {
    mode: options.registerContracts ?? options.registerCare ?? 'off',
    emitReport: options.emitRegisterReport === true,
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
  } satisfies AnalyzeRegisterContractsOptions);

  if (registerContracts.reportText !== undefined) {
    artifacts.push({
      kind: 'register-contracts-report',
      text: registerContracts.reportText,
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
