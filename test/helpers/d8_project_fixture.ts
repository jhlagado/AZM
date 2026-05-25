import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type D8ProjectFixture = {
  project: string;
  src: string;
  shared: string;
  build: string;
  entry: string;
  hex: string;
  bin: string;
};

export async function writeD8ProjectFixture(root: string): Promise<D8ProjectFixture> {
  const project = join(root, 'project');
  const src = join(project, 'src', 'pacmo');
  const shared = join(project, 'src', 'shared');
  const build = join(project, 'build');
  const entry = join(src, 'pacmo.z80');
  const hex = join(build, 'pacmo.hex');
  const bin = join(build, 'pacmo.bin');

  await mkdir(src, { recursive: true });
  await mkdir(shared, { recursive: true });
  await mkdir(build, { recursive: true });
  await writeFile(
    entry,
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
    join(src, 'movement.asm'),
    ['MoveRight:', '    nop', '    ret', ''].join('\n'),
    'utf8',
  );
  await writeFile(join(shared, 'constants.asm'), ['ColorRed .equ 1', ''].join('\n'), 'utf8');

  return { project, src, shared, build, entry, hex, bin };
}
