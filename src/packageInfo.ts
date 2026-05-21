import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readPackageVersion(): string {
  const require = createRequire(import.meta.url);
  const here = dirname(fileURLToPath(import.meta.url));
  let pkg: { version?: unknown };
  try {
    pkg = require(resolve(here, '..', 'package.json')) as { version?: unknown };
  } catch {
    pkg = require(resolve(here, '..', '..', 'package.json')) as { version?: unknown };
  }
  return String(pkg.version ?? '0.0.0');
}
