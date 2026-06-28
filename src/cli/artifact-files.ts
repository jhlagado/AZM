import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { Artifact } from '../outputs/types.js';

interface ArtifactPaths {
  readonly hex: string;
  readonly bin: string;
  readonly d8m: string;
  readonly asm80: string;
  readonly registerContractsReport: string;
  readonly registerContractsInterface: string;
  readonly registerContractsInference: string;
}

interface ArtifactWriteResult {
  readonly primaryPath?: string;
  readonly registerContractsPath?: string;
}

function artifactByKind(artifacts: readonly Artifact[]): Map<string, Artifact> {
  const byKind = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    byKind.set(artifact.kind, artifact);
  }
  return byKind;
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function writeTextArtifact(path: string, text: string): Promise<void> {
  await ensureDir(path);
  await writeFile(path, text, 'utf8');
}

async function writeBinArtifact(path: string, bytes: Uint8Array): Promise<void> {
  await ensureDir(path);
  await writeFile(path, Buffer.from(bytes));
}

function queuePrimaryArtifacts(
  writes: Promise<void>[],
  byKind: ReadonlyMap<string, Artifact>,
  paths: ArtifactPaths,
  outputType: 'hex' | 'bin',
): string | undefined {
  let primaryPath: string | undefined;
  const bin = byKind.get('bin');
  if (bin?.kind === 'bin') {
    writes.push(writeBinArtifact(paths.bin, bin.bytes));
    if (outputType === 'bin') primaryPath = paths.bin;
  }

  const hex = byKind.get('hex');
  if (hex?.kind === 'hex') {
    writes.push(writeTextArtifact(paths.hex, hex.text));
    if (outputType === 'hex') primaryPath = paths.hex;
  }

  return primaryPath;
}

function queueDebugArtifacts(
  writes: Promise<void>[],
  byKind: ReadonlyMap<string, Artifact>,
  paths: ArtifactPaths,
): void {
  const d8m = byKind.get('d8m');
  if (d8m?.kind === 'd8m') {
    const text = JSON.stringify(d8m.json, null, 2);
    writes.push(writeTextArtifact(paths.d8m, `${text}\n`));
  }

  const asm80 = byKind.get('asm80');
  if (asm80?.kind === 'asm80') {
    writes.push(writeTextArtifact(paths.asm80, asm80.text));
  }
}

function queueRegisterContractsArtifacts(
  writes: Promise<void>[],
  byKind: ReadonlyMap<string, Artifact>,
  paths: ArtifactPaths,
): string | undefined {
  let registerContractsPath: string | undefined;
  const report = byKind.get('register-contracts-report');
  if (report?.kind === 'register-contracts-report') {
    writes.push(writeTextArtifact(paths.registerContractsReport, report.text));
    registerContractsPath = paths.registerContractsReport;
  }

  const iface = byKind.get('register-contracts-interface');
  if (iface?.kind === 'register-contracts-interface') {
    writes.push(writeTextArtifact(paths.registerContractsInterface, iface.text));
    registerContractsPath ??= paths.registerContractsInterface;
  }

  const inference = byKind.get('register-contracts-inference');
  if (inference?.kind === 'register-contracts-inference') {
    writes.push(writeTextArtifact(paths.registerContractsInference, inference.text));
    registerContractsPath ??= paths.registerContractsInference;
  }

  return registerContractsPath;
}

function queueRegisterContractsAnnotationArtifacts(
  writes: Promise<void>[],
  byKind: ReadonlyMap<string, Artifact>,
): string | undefined {
  const annotations = byKind.get('register-contracts-annotations');
  if (annotations?.kind !== 'register-contracts-annotations') return undefined;

  let firstAnnotationPath: string | undefined;
  for (const item of annotations.files) {
    writes.push(writeTextArtifact(item.path, item.text));
    firstAnnotationPath ??= item.path;
  }
  return firstAnnotationPath;
}

export async function writeArtifactFiles(
  artifacts: readonly Artifact[],
  paths: ArtifactPaths,
  outputType: 'hex' | 'bin',
): Promise<ArtifactWriteResult> {
  const byKind = artifactByKind(artifacts);
  const writes: Promise<void>[] = [];
  const primaryPath = queuePrimaryArtifacts(writes, byKind, paths, outputType);
  queueDebugArtifacts(writes, byKind, paths);
  const registerContractsPath = queueRegisterContractsArtifacts(writes, byKind, paths);
  const annotationPrimaryPath = queueRegisterContractsAnnotationArtifacts(writes, byKind);

  await Promise.all(writes);
  const selectedPrimaryPath = primaryPath ?? annotationPrimaryPath;
  return {
    ...(selectedPrimaryPath ? { primaryPath: selectedPrimaryPath } : {}),
    ...(registerContractsPath ? { registerContractsPath } : {}),
  };
}
