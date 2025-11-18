import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'glob';
import { getCodemodDefinition, type CodemodId } from '../codemods/index.js';

export async function runAstGrep({
  codemodId,
  cwd,
}: {
  codemodId: CodemodId;
  cwd: string;
}) {
  const definition = getCodemodDefinition(codemodId);
  const patterns = definition.globs.length
    ? definition.globs
    : ['**/*.{js,ts,jsx,tsx,svelte,json}'];

  const filePaths = new Set<string>();
  for (const pattern of patterns) {
    const matches = await glob(pattern, { cwd, absolute: true });
    for (const match of matches) {
      filePaths.add(match);
    }
  }

  for (const filePath of filePaths) {
    let source: string;
    try {
      source = await readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const transformed = await definition.transform(source, filePath);
    if (typeof transformed === 'string' && transformed !== source) {
      await writeFile(filePath, transformed, 'utf8');
    }
  }
}
