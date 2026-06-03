import type { SourceItem } from '../model/source-item.js';

export function stringDirectiveBytes(
  directive: Extract<SourceItem, { readonly kind: 'string-data' }>['directive'],
  value: string,
): number[] {
  const bytes = [...value].map((char) => char.codePointAt(0) ?? 0);
  switch (directive) {
    case 'cstr':
      return [...bytes, 0];
    case 'pstr':
      return [bytes.length & 0xff, ...bytes];
    case 'istr':
      if (bytes.length === 0) {
        return [];
      }
      return bytes.map((byte, index) => (index === bytes.length - 1 ? byte | 0x80 : byte));
  }
}
