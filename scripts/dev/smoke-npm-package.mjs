import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio ?? 'pipe',
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          [
            `${command} ${args.join(' ')} failed with exit code ${code}`,
            stdout.trim(),
            stderr.trim(),
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      );
    });
  });
}

const workDir = await mkdtemp(join(tmpdir(), 'azm-package-smoke-'));

try {
  const packDir = join(workDir, 'pack');
  const installDir = join(workDir, 'install');
  await run('mkdir', ['-p', packDir, installDir]);

  const pack = await run('npm', ['pack', '--pack-destination', packDir], { cwd: repoRoot });
  const tarballName = pack.stdout.trim().split(/\r?\n/).at(-1);
  if (!tarballName) throw new Error('npm pack did not report a tarball name');
  const tarball = join(packDir, basename(tarballName));

  await run('npm', ['init', '-y'], { cwd: installDir });
  await run('npm', ['install', tarball], { cwd: installDir });

  const asmPath = join(installDir, 'smoke.asm');
  await writeFile(
    asmPath,
    ['        .org 0100H', 'START:', '        ld a,42', '        ret', ''].join('\n'),
    'utf8',
  );

  const projectDir = join(installDir, 'project');
  const srcDir = join(projectDir, 'src', 'pacmo');
  const sharedDir = join(projectDir, 'src', 'shared');
  const buildDir = join(projectDir, 'build');
  await mkdir(srcDir, { recursive: true });
  await mkdir(sharedDir, { recursive: true });
  await mkdir(buildDir, { recursive: true });
  await writeFile(
    join(srcDir, 'pacmo.z80'),
    [
      '.include "movement.asm"',
      '.include "../shared/constants.asm"',
      'main:',
      '    call MoveRight',
      '    ret',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(srcDir, 'movement.asm'),
    ['MoveRight:', '    nop', '    ret', ''].join('\n'),
    'utf8',
  );
  await writeFile(join(sharedDir, 'constants.asm'), ['ColorRed .equ 1', ''].join('\n'), 'utf8');

  const version = await run('npx', ['azm', '--version'], { cwd: installDir });
  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  if (version.stdout.trim() !== pkg.version) {
    throw new Error(`npx azm --version returned ${version.stdout.trim()}, expected ${pkg.version}`);
  }

  await run('npx', ['azm', '--type', 'bin', '--output', 'smoke.bin', 'smoke.asm'], {
    cwd: installDir,
  });

  await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        "import { compile, defaultFormatWriters } from '@jhlagado/azm/compile';",
        "import { loadProgram } from '@jhlagado/azm/tooling';",
        "const loaded = await loadProgram({ entryFile: './smoke.asm' });",
        "if (!loaded.loadedProgram) throw new Error('loadProgram failed');",
        "const result = await compile('./smoke.asm', { outputType: 'bin', emitBin: true, emitHex: false, emitD8m: false }, { formats: defaultFormatWriters });",
        "if (result.diagnostics.length) throw new Error(result.diagnostics.map((d) => d.message).join('\\n'));",
        "if (!result.artifacts.some((artifact) => artifact.kind === 'bin')) throw new Error('missing bin artifact');",
        "const d8Result = await compile('./project/src/pacmo/pacmo.z80', { sourceRoot: './project', d8mInputs: { hex: './project/build/pacmo.hex', bin: './project/build/pacmo.bin' } }, { formats: defaultFormatWriters });",
        "if (d8Result.diagnostics.length) throw new Error(d8Result.diagnostics.map((d) => d.message).join('\\n'));",
        "const d8m = d8Result.artifacts.find((artifact) => artifact.kind === 'd8m');",
        "if (!d8m) throw new Error('missing d8m artifact');",
        "if (d8m.json.generator?.name !== 'azm' || d8m.json.generator?.tool !== 'azm') throw new Error('missing AZM generator metadata');",
        "if (d8m.json.generator?.inputs?.entry !== 'src/pacmo/pacmo.z80') throw new Error('unstable D8 entry path');",
        "if (d8m.json.generator?.inputs?.hex !== 'build/pacmo.hex') throw new Error('unstable D8 hex path');",
        "if (!d8m.json.files['src/pacmo/pacmo.z80']) throw new Error('missing original source D8 file key');",
        "if (Object.keys(d8m.json.files).some((key) => key.startsWith('build/'))) throw new Error('D8 file key points at generated output');",
        "const colorRed = d8m.json.symbols.find((symbol) => symbol.name === 'ColorRed');",
        "if (!colorRed || colorRed.kind !== 'constant' || colorRed.value !== 1 || 'address' in colorRed) throw new Error('constant should be value-only D8 metadata');",
      ].join('\n'),
    ],
    { cwd: installDir },
  );

  const typescriptCheckDir = join(installDir, 'typescript-smoke');
  await mkdir(typescriptCheckDir, { recursive: true });
  await writeFile(
    join(typescriptCheckDir, 'check.ts'),
    [
      "import { DiagnosticIds } from '@jhlagado/azm/tooling';",
      "import type { D8mArtifact, D8mJson, D8mSymbol } from '@jhlagado/azm/compile';",
      "import type {",
      "  AnalyzeProgramResult,",
      "  Diagnostic,",
      "  DiagnosticId,",
      "  DiagnosticSeverity,",
      "  LoadedProgram,",
      "  LoadProgramResult,",
      "  RegisterContractsOutputCandidate,",
      "  RegisterContractsTextEdit,",
      "  RegisterContractsUnit,",
      "} from '@jhlagado/azm/tooling';",
      '',
      'const diagnosticId = DiagnosticIds.SemanticsError;',
      'const d8mJson: D8mJson | undefined = undefined;',
      'const d8mArtifact: D8mArtifact | undefined = undefined;',
      'const d8mSymbol: D8mSymbol | undefined = undefined;',
      'const diagnostic: Diagnostic | undefined = undefined;',
      'const diagnosticIdType: DiagnosticId | undefined = undefined;',
      'const diagnosticSeverity: DiagnosticSeverity | undefined = undefined;',
      'const loadedProgram: LoadedProgram | undefined = undefined;',
      'const loadProgramResult: LoadProgramResult | undefined = undefined;',
      'const analyzeProgramResult: AnalyzeProgramResult | undefined = undefined;',
      'const outputCandidate: RegisterContractsOutputCandidate | undefined = undefined;',
      'const registerContractsUnit: RegisterContractsUnit | undefined = undefined;',
      'const textEdit: RegisterContractsTextEdit | undefined = undefined;',
      'console.log(Boolean(diagnosticId) || Boolean(d8mJson) || Boolean(d8mArtifact) || Boolean(d8mSymbol) || Boolean(diagnostic) || Boolean(diagnosticIdType) || Boolean(diagnosticSeverity) || Boolean(loadedProgram) || Boolean(loadProgramResult) || Boolean(analyzeProgramResult) || Boolean(outputCandidate) || Boolean(registerContractsUnit) || Boolean(textEdit));',
      '',
    ].join('\n'),
    'utf8',
  );
  await writeFile(
    join(typescriptCheckDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          target: 'ES2022',
          strict: true,
          noEmit: true,
        },
        files: ['./check.ts'],
      },
      null,
      2,
    ),
    'utf8',
  );
  await run(process.execPath, [join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(typescriptCheckDir, 'tsconfig.json')], {
    cwd: installDir,
  });

  console.log(`package smoke passed: ${tarball}`);
} finally {
  await rm(workDir, { recursive: true, force: true });
}
