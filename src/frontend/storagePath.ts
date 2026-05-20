import type { EaExprNode } from './ast.js';

export function isStoragePath(ea: EaExprNode): boolean {
  switch (ea.kind) {
    case 'EaName':
      return true;
    case 'EaImm':
      return false;
    case 'EaReinterpret':
      return isStoragePath(ea.base);
    case 'EaField':
      return isStoragePath(ea.base);
    case 'EaIndex':
      return isStoragePath(ea.base);
    case 'EaAdd':
    case 'EaSub':
      return false;
  }
}
