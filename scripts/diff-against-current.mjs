#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./diff-against-current.ts', import.meta.url));
const localTsx = process.platform === 'win32'
  ? resolve(process.cwd(), 'node_modules', '.bin', 'tsx.cmd')
  : resolve(process.cwd(), 'node_modules', '.bin', 'tsx');

const command = existsSync(localTsx) ? localTsx : 'npx';
const commandArgs = existsSync(localTsx)
  ? [scriptPath, ...process.argv.slice(2)]
  : ['tsx', scriptPath, ...process.argv.slice(2)];

const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
});

process.exitCode = result.status ?? 1;
