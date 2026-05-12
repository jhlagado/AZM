import type { Diagnostic } from './diagnosticTypes.js';
import { DiagnosticIds } from './diagnosticTypes.js';
import type { NamedSectionNode, ProgramNode } from './frontend/ast.js';

export type NonBankedSectionKind = 'code' | 'data';

declare const nonBankedSectionKeyIdBrand: unique symbol;
export type NonBankedSectionKeyId = string & {
  readonly [nonBankedSectionKeyIdBrand]: true;
};

export type NonBankedSectionKey = Readonly<{
  section: NonBankedSectionKind;
  name: string;
}>;

export function formatNonBankedSectionKey(key: NonBankedSectionKey): string {
  return `${key.section} ${key.name}`;
}

function keyIdFor(section: NonBankedSectionKind, name: string): NonBankedSectionKeyId {
  return `${section}\u0000${name.toLowerCase()}` as NonBankedSectionKeyId;
}

function isNonBankedSectionKind(section: unknown): section is NonBankedSectionKind {
  return section === 'code' || section === 'data';
}

function isValidSectionName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && !name.includes('\u0000');
}

export function createNonBankedSectionKey(
  section: unknown,
  name: unknown,
): { key: NonBankedSectionKey; keyId: NonBankedSectionKeyId } | undefined {
  if (!isNonBankedSectionKind(section) || !isValidSectionName(name)) return undefined;
  return {
    key: {
      section,
      name,
    },
    keyId: keyIdFor(section, name),
  };
}

export type SectionContributionRecord = {
  key: NonBankedSectionKey;
  keyId: NonBankedSectionKeyId;
  moduleIndex: number;
  itemIndex: number;
  order: number;
  node: NamedSectionNode;
};

export type SectionAnchorRecord = {
  key: NonBankedSectionKey;
  keyId: NonBankedSectionKeyId;
  moduleIndex: number;
  itemIndex: number;
  order: number;
  node: NamedSectionNode;
};

export type NonBankedSectionKeyCollection = {
  orderedContributions: SectionContributionRecord[];
  orderedAnchors: SectionAnchorRecord[];
  contributionsByKey: Map<NonBankedSectionKeyId, SectionContributionRecord[]>;
  anchorsByKey: Map<NonBankedSectionKeyId, SectionAnchorRecord>;
};

function diag(
  diagnostics: Diagnostic[],
  id: (typeof DiagnosticIds)[keyof typeof DiagnosticIds],
  severity: 'error' | 'warning',
  file: string,
  message: string,
  where?: { line: number; column: number },
): void {
  diagnostics.push({
    id,
    severity,
    message,
    file,
    ...(where ? { line: where.line, column: where.column } : {}),
  });
}

function startOf(node: NamedSectionNode): { file: string; line: number; column: number } {
  return {
    file: node.span.file,
    line: node.span.start.line,
    column: node.span.start.column,
  };
}

export function collectNonBankedSectionKeys(
  program: ProgramNode,
  diagnostics: Diagnostic[],
  moduleTraversal?: readonly string[],
): NonBankedSectionKeyCollection {
  const orderedContributions: SectionContributionRecord[] = [];
  const orderedAnchors: SectionAnchorRecord[] = [];
  const contributionsByKey = new Map<NonBankedSectionKeyId, SectionContributionRecord[]>();
  const anchorsByKey = new Map<NonBankedSectionKeyId, SectionAnchorRecord>();

  const traversalIndexByFile = new Map<string, number>();
  if (moduleTraversal) {
    for (const [index, file] of moduleTraversal.entries()) {
      traversalIndexByFile.set(file, index);
    }
  }

  const orderedModules = [...program.files]
    .map((moduleFile, moduleIndex) => ({
      moduleFile,
      moduleIndex,
      traversalIndex: traversalIndexByFile.get(moduleFile.span.file) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => {
      if (a.traversalIndex !== b.traversalIndex) return a.traversalIndex - b.traversalIndex;
      return a.moduleIndex - b.moduleIndex;
    });

  for (const { moduleFile, moduleIndex } of orderedModules) {
    for (const [itemIndex, item] of moduleFile.items.entries()) {
      if (item.kind !== 'NamedSection') continue;
      const node = item;
      const created = createNonBankedSectionKey(node.section, node.name);
      if (!created) {
        const at = startOf(node);
        diag(
          diagnostics,
          DiagnosticIds.EmitError,
          'error',
          at.file,
          `Invalid section key for named section: section="${String(node.section)}", name="${String(
            node.name,
          )}".`,
          { line: at.line, column: at.column },
        );
        continue;
      }
      const { key, keyId } = created;

      if (node.items.length > 0) {
        const contribution: SectionContributionRecord = {
          key,
          keyId,
          moduleIndex,
          itemIndex,
          order: orderedContributions.length,
          node,
        };
        orderedContributions.push(contribution);
        const existing = contributionsByKey.get(keyId);
        if (existing) existing.push(contribution);
        else contributionsByKey.set(keyId, [contribution]);
      }

      if (!node.anchor) continue;

      const existingAnchor = anchorsByKey.get(keyId);
      if (existingAnchor) {
        const at = startOf(node);
        diag(
          diagnostics,
          DiagnosticIds.EmitError,
          'error',
          at.file,
          `Duplicate anchor for section "${formatNonBankedSectionKey(key)}".`,
          { line: at.line, column: at.column },
        );
        continue;
      }

      const anchor: SectionAnchorRecord = {
        key,
        keyId,
        moduleIndex,
        itemIndex,
        order: orderedAnchors.length,
        node,
      };
      orderedAnchors.push(anchor);
      anchorsByKey.set(keyId, anchor);
    }
  }

  const reportedMissingAnchorKeys = new Set<NonBankedSectionKeyId>();
  for (const contribution of orderedContributions) {
    if (anchorsByKey.has(contribution.keyId) || reportedMissingAnchorKeys.has(contribution.keyId)) continue;
    const at = startOf(contribution.node);
    diag(
      diagnostics,
      DiagnosticIds.EmitError,
      'error',
      at.file,
      `Missing anchor for section "${formatNonBankedSectionKey(contribution.key)}".`,
      { line: at.line, column: at.column },
    );
    reportedMissingAnchorKeys.add(contribution.keyId);
  }

  for (const anchor of orderedAnchors) {
    const contributions = contributionsByKey.get(anchor.keyId);
    if (contributions && contributions.length > 0) continue;
    const at = startOf(anchor.node);
    diag(
      diagnostics,
      DiagnosticIds.EmitWarning,
      'warning',
      at.file,
      `Anchor for section "${formatNonBankedSectionKey(anchor.key)}" has no contributions.`,
      { line: at.line, column: at.column },
    );
  }

  return {
    orderedContributions,
    orderedAnchors,
    contributionsByKey,
    anchorsByKey,
  };
}
