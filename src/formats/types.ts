/**
 * Half-open address range in the Z80 16-bit address space.
 */
export interface AddressRange {
  /** Inclusive start address. */
  start: number;
  /** Exclusive end address. */
  end: number;
}

/**
 * Address->byte map for all emitted machine-code bytes.
 */
export interface EmittedByteMap {
  /**
   * Address -> byte (0..255). Addresses are 0..65535 for Z80.
   */
  bytes: Map<number, number>;
  writtenRange?: AddressRange;
  /**
   * Optional source-attributed code segments emitted by lowering.
   *
   * Addresses are absolute in the final 16-bit address space.
   */
  sourceSegments?: EmittedSourceSegment[];
}

/**
 * Source-attributed emitted range used by debug-map writers.
 */
export interface EmittedSourceSegment {
  start: number;
  end: number;
  file: string;
  line: number;
  column: number;
  kind: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * A symbol entry for debug maps and listings.
 */
export type SymbolEntry =
  | {
      kind: 'constant';
      name: string;
      /**
       * Constant value (not an address).
       *
       * D8M serialization includes this as `value`.
       */
      value: number;
      /**
       * Back-compat: legacy constant representation stored the value in `address`.
       *
       * Writers may include this field for compatibility with older tooling.
       */
      address?: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
    }
  | {
      kind: 'label' | 'data' | 'var' | 'unknown';
      name: string;
      address: number;
      file?: string;
      line?: number;
      scope?: 'global' | 'local';
      size?: number;
    };

/**
 * Options for Intel HEX writing.
 */
export interface WriteHexOptions {
  /**
   * Line ending to use when emitting text formats.
   */
  lineEnding?: '\n' | '\r\n';
}

/**
 * Options for BIN writing (reserved for future options).
 */
export interface WriteBinOptions {}

/**
 * Options for D8M writing (reserved for future options).
 */
export interface WriteD8mOptions {
  /**
   * Base directory used to normalize file paths in D8M symbol entries.
   * When provided, file paths are made project-relative and use `/` separators.
   */
  rootDir?: string;
  /**
   * Optional runnable entry symbol metadata for harnesses.
   */
  entrySymbol?: string;
  /**
   * Optional resolved entry address metadata for harnesses.
   */
  entryAddress?: number;
}

/**
 * Options for listing writing.
 *
 * Note: the listing format is currently a deterministic byte dump plus a symbol table.
 */
export interface WriteListingOptions {
  /**
   * Line ending to use when emitting text formats.
   */
  lineEnding?: '\n' | '\r\n';
  /**
   * Number of bytes shown per listing line.
   */
  bytesPerLine?: number;
}

/**
 * Options for ASM80 source emission.
 */
export interface WriteAsm80Options {
  /**
   * Line ending to use when emitting text formats.
   */
  lineEnding?: '\n' | '\r\n';
}

/**
 * In-memory Intel HEX artifact.
 */
export interface HexArtifact {
  kind: 'hex';
  path?: string;
  text: string;
}

/**
 * In-memory flat binary artifact.
 */
export interface BinArtifact {
  kind: 'bin';
  path?: string;
  bytes: Uint8Array;
}

/**
 * In-memory listing artifact.
 */
export interface ListingArtifact {
  kind: 'lst';
  path?: string;
  text: string;
}

/**
 * In-memory ASM80 `.z80` artifact.
 */
export interface Asm80Artifact {
  kind: 'asm80';
  path?: string;
  text: string;
}

/**
 * In-memory D8 Debug Map (D8M) artifact.
 */
export interface D8mArtifact {
  kind: 'd8m';
  path?: string;
  json: D8mJson;
}

/**
 * Union of all artifact kinds produced by the compiler.
 */
export type Artifact =
  | HexArtifact
  | BinArtifact
  | ListingArtifact
  | D8mArtifact
  | Asm80Artifact;

/**
 * Minimal D8 Debug Map (D8M) v1 JSON shape.
 *
 * Writers may add additional keys as needed.
 */
export type D8mJson = {
  format: 'd8-debug-map';
  version: 1;
  arch: 'z80';
  [key: string]: unknown;
};

/**
 * Format writers used by the pipeline to turn emitted bytes/symbols into artifacts.
 */
export interface FormatWriters {
  writeHex(map: EmittedByteMap, symbols: SymbolEntry[], opts?: WriteHexOptions): HexArtifact;
  writeBin(map: EmittedByteMap, symbols: SymbolEntry[], opts?: WriteBinOptions): BinArtifact;
  writeD8m(map: EmittedByteMap, symbols: SymbolEntry[], opts?: WriteD8mOptions): D8mArtifact;
  writeListing?(
    map: EmittedByteMap,
    symbols: SymbolEntry[],
    opts?: WriteListingOptions,
  ): ListingArtifact;
  writeAsm80?(
    program: import('../lowering/loweredAsmTypes.js').LoweredAsmProgram,
    opts?: WriteAsm80Options,
  ): Asm80Artifact;
}
