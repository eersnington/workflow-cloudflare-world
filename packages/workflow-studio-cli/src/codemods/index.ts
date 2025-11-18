import { nextCodemods } from './next.js';
import { svelteCodemods } from './svelte.js';
import type { CodemodDefinition } from './types.js';

const codemodDefinitions = {
  ...nextCodemods,
  ...svelteCodemods,
} as const satisfies Record<string, CodemodDefinition>;

export type CodemodId = keyof typeof codemodDefinitions;

export function getCodemodDefinition(id: CodemodId): CodemodDefinition {
  return codemodDefinitions[id];
}

export function getCodemodGlobs(id: CodemodId): string[] {
  return codemodDefinitions[id].globs;
}

export { codemodDefinitions };
export type { CodemodDefinition } from './types.js';
