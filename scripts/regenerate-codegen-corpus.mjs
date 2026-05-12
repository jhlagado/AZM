import { mkdir, readFile, rm, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const manifestPath = join(repoRoot, 'test', 'fixtures', 'corpus', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const opcodeHexDir = join(repoRoot, manifest.opcodeHexDir);
const mirrorDir = join(repoRoot, manifest.mirrorDir);
const tempDir = join(repoRoot, 'coverage', '.tmp', 'codegen-corpus');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function resolveFromRepo(path) {
  return join(repoRoot, path);
}

async function run(cmd, args) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: false,
    });
    child.on('error', rejectRun);
    child.on('exit', (code) => {
      if (code === 0) {
        resolveRun(undefined);
      } else {
        rejectRun(new Error(`${cmd} exited with code ${code ?? 'unknown'}`));
      }
    });
  });
}

await mkdir(tempDir, { recursive: true });
await mkdir(mirrorDir, { recursive: true });
await mkdir(opcodeHexDir, { recursive: true });

await run(npmCmd, ['run', 'build']);

for (const name of manifest.curatedCases) {
  const sourcePath = resolveFromRepo(name.source);
  const mirrorSourcePath = join(mirrorDir, `${name.name}.zax`);
  const tempHexPath = join(tempDir, `${name.name}.hex`);

  if (sourcePath !== mirrorSourcePath) {
    await copyFile(sourcePath, mirrorSourcePath);
  }
  await rm(tempHexPath, { force: true });
  await rm(join(tempDir, `${name.name}.bin`), { force: true });
  await rm(join(tempDir, `${name.name}.asm`), { force: true });
  await rm(join(tempDir, `${name.name}.z80`), { force: true });

  await run('node', [
    'dist/src/cli.js',
    '--output',
    tempHexPath,
    '--type',
    'hex',
    '--nod8m',
    '--nolist',
    '--asm80',
    sourcePath,
  ]);

  await copyFile(join(tempDir, `${name.name}.bin`), join(mirrorDir, `${name.name}.bin`));
  await copyFile(join(tempDir, `${name.name}.hex`), join(mirrorDir, `${name.name}.hex`));
  await copyFile(join(tempDir, `${name.name}.z80`), join(mirrorDir, `${name.name}.z80`));
  await copyFile(join(tempDir, `${name.name}.hex`), join(opcodeHexDir, `${name.name}.hex`));
}

for (const name of manifest.negativeCases) {
  const sourcePath = resolveFromRepo(name.source);
  const mirrorSourcePath = join(mirrorDir, `${name.name}.zax`);
  if (sourcePath !== mirrorSourcePath) {
    await copyFile(sourcePath, mirrorSourcePath);
  }
}
