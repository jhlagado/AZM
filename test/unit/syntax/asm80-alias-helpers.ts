import type { DirectiveAliasPolicy } from '../../../src/syntax/directive-aliases.js';
import { buildDirectiveAliasPolicy } from '../../../src/syntax/directive-aliases.js';

export const azmDirectiveAliases = buildDirectiveAliasPolicy();

export const noDirectiveAliases: DirectiveAliasPolicy = {
  directiveAliases: new Map(),
};
