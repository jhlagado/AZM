import { compile, type CompileResult } from '../api-compile.js';
import { formatDiagnostic } from '../diagnostics/format.js';
import { cliUsage, parseCliArgs } from './parse-args.js';
import {
  artifactBase,
  buildCompileOptions,
  compareDiagnosticsForCli,
  writeArtifacts,
} from './write-artifacts.js';

export { parseCliArgs } from './parse-args.js';

export async function runCli(argv: string[]): Promise<number> {
  try {
    const parsed = parseCliArgs(argv);
    if ('code' in parsed) {
      return parsed.code;
    }

    const base = artifactBase(parsed.entryFile, parsed.outputType, parsed.outputPath);
    const compileResult: CompileResult = await compile(
      parsed.entryFile,
      buildCompileOptions(parsed, base),
    );
    const sortedDiagnostics = [...compileResult.diagnostics].sort(compareDiagnosticsForCli);
    if (sortedDiagnostics.length > 0) {
      for (const diagnostic of sortedDiagnostics) {
        process.stderr.write(`${formatDiagnostic(diagnostic)}\n`);
      }
    }

    if (sortedDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      if (compileResult.artifacts.length > 0) {
        await writeArtifacts(base, compileResult.artifacts, parsed.outputType);
      }
      return 1;
    }

    const primaryPath = await writeArtifacts(base, compileResult.artifacts, parsed.outputType);
    if (primaryPath !== undefined) {
      process.stdout.write(primaryPath);
    }
    return 0;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    process.stderr.write(`azm: ${msg}\n`);
    process.stderr.write(`${cliUsage()}\n`);
    return 2;
  }
}
