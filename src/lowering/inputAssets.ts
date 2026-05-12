import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

type InputDiag = (file: string, message: string) => void;

export function resolveInputPath(
  fromFile: string,
  fromPath: string,
  includeDirs: readonly string[],
  report: InputDiag,
): string | undefined {
  const candidates: string[] = [];
  candidates.push(resolve(dirname(fromFile), fromPath));
  for (const inc of includeDirs) candidates.push(resolve(inc, fromPath));

  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    if (existsSync(candidate)) return candidate;
  }

  report(fromFile, `Failed to resolve input path "${fromPath}".`);
  return undefined;
}

export function loadBinInput(
  fromFile: string,
  fromPath: string,
  includeDirs: readonly string[],
  report: InputDiag,
): Buffer | undefined {
  const path = resolveInputPath(fromFile, fromPath, includeDirs, report);
  if (!path) return undefined;

  try {
    return readFileSync(path);
  } catch (err) {
    report(fromFile, `Failed to read bin file "${path}": ${String(err)}`);
    return undefined;
  }
}

export function parseIntelHex(
  ownerFile: string,
  hexText: string,
  report: InputDiag,
): { bytes: Map<number, number>; minAddress: number } | undefined {
  const out = new Map<number, number>();
  let minAddress = Number.POSITIVE_INFINITY;
  const lines = hexText.split(/\r?\n/);
  let sawData = false;
  let sawEof = false;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex]!.trim();
    if (raw.length === 0) continue;
    if (!raw.startsWith(':')) {
      report(ownerFile, `Invalid Intel HEX record at line ${lineIndex + 1}.`);
      return undefined;
    }
    const body = raw.slice(1);
    if (body.length < 10 || body.length % 2 !== 0) {
      report(ownerFile, `Malformed Intel HEX record at line ${lineIndex + 1}.`);
      return undefined;
    }

    const bytesLine: number[] = [];
    for (let i = 0; i < body.length; i += 2) {
      const pair = body.slice(i, i + 2);
      const value = Number.parseInt(pair, 16);
      if (Number.isNaN(value)) {
        report(ownerFile, `Invalid HEX byte "${pair}" at line ${lineIndex + 1}.`);
        return undefined;
      }
      bytesLine.push(value & 0xff);
    }

    const len = bytesLine[0]!;
    const addr = ((bytesLine[1]! << 8) | bytesLine[2]!) & 0xffff;
    const type = bytesLine[3]!;
    const data = bytesLine.slice(4, bytesLine.length - 1);
    if (len !== data.length) {
      report(ownerFile, `Intel HEX length mismatch at line ${lineIndex + 1}.`);
      return undefined;
    }

    const sum = bytesLine.reduce((acc, byte) => (acc + byte) & 0xff, 0);
    if (sum !== 0) {
      report(ownerFile, `Intel HEX checksum mismatch at line ${lineIndex + 1}.`);
      return undefined;
    }
    if (sawEof) {
      report(ownerFile, `Intel HEX data found after EOF record.`);
      return undefined;
    }

    if (type === 0x00) {
      for (let i = 0; i < data.length; i++) {
        const address = addr + i;
        if (address < 0 || address > 0xffff) {
          report(ownerFile, `Intel HEX address out of range at line ${lineIndex + 1}.`);
          return undefined;
        }
        if (out.has(address)) {
          report(ownerFile, `Intel HEX overlaps itself at address ${address}.`);
          return undefined;
        }
        out.set(address, data[i]!);
        minAddress = Math.min(minAddress, address);
      }
      sawData = true;
      continue;
    }

    if (type === 0x01) {
      sawEof = true;
      continue;
    }

    report(
      ownerFile,
      `Unsupported Intel HEX record type ${type.toString(16).padStart(2, '0')} at line ${lineIndex + 1}.`,
    );
    return undefined;
  }

  if (!sawData) {
    report(ownerFile, `Intel HEX file has no data records.`);
    return undefined;
  }

  return { bytes: out, minAddress };
}

export function loadHexInput(
  fromFile: string,
  fromPath: string,
  includeDirs: readonly string[],
  report: InputDiag,
): { bytes: Map<number, number>; minAddress: number } | undefined {
  const path = resolveInputPath(fromFile, fromPath, includeDirs, report);
  if (!path) return undefined;

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    report(fromFile, `Failed to read hex file "${path}": ${String(err)}`);
    return undefined;
  }

  return parseIntelHex(fromFile, text, report);
}
