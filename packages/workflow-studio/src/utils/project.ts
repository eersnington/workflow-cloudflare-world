import { readdir, stat } from 'node:fs/promises';

const CURRENT_DIRECTORY_ALIASES = new Set(['.', './', '.\\']);

export function normalizeProjectName(input: string): {
  specifier: string;
  usingCurrentDirectory: boolean;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Project name cannot be empty.');
  }
  if (CURRENT_DIRECTORY_ALIASES.has(trimmed)) {
    return { specifier: '.', usingCurrentDirectory: true };
  }
  return { specifier: trimmed, usingCurrentDirectory: false };
}

export async function ensureProjectDirectoryReady({
  directory,
  usingCurrentDirectory,
  displayName,
}: {
  directory: string;
  usingCurrentDirectory: boolean;
  displayName: string;
}) {
  try {
    const directoryStat = await stat(directory);
    if (!directoryStat.isDirectory()) {
      if (usingCurrentDirectory) {
        throw new Error(
          'The current path is not a directory. Pick a different location.'
        );
      }
      throw new Error(
        `A file named "${displayName}" already exists. Remove it or choose a different project name.`
      );
    }
    const entries = await readdir(directory);
    if (entries.length > 0) {
      if (usingCurrentDirectory) {
        throw new Error(
          'The current directory is not empty. Run the init command inside an empty folder or provide a new directory name.'
        );
      }
      throw new Error(
        `Directory "${displayName}" already exists and is not empty. Remove it or choose a different project name.`
      );
    }
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return;
    }
    throw error;
  }
}
