import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const { ensureProjectDirectoryReady, normalizeProjectName } = await import(
  new URL('../dist/utils/project.js', import.meta.url).href
);

describe('normalizeProjectName', () => {
  test('handles current directory aliases', () => {
    expect(normalizeProjectName('.')).toEqual({
      specifier: '.',
      usingCurrentDirectory: true,
    });
    expect(normalizeProjectName('./')).toEqual({
      specifier: '.',
      usingCurrentDirectory: true,
    });
    expect(normalizeProjectName('.\\')).toEqual({
      specifier: '.',
      usingCurrentDirectory: true,
    });
  });

  test('trims whitespace and preserves relative specifier', () => {
    expect(normalizeProjectName('  ./apps/demo  ')).toEqual({
      specifier: './apps/demo',
      usingCurrentDirectory: false,
    });
  });

  test('rejects empty values', () => {
    expect(() => normalizeProjectName('   ')).toThrow(
      /Project name cannot be empty/
    );
  });
});

describe('ensureProjectDirectoryReady', () => {
  test('allows missing directories', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'workflow-project-'));
    const target = join(tmp, 'new-app');
    await expect(
      ensureProjectDirectoryReady({
        directory: target,
        usingCurrentDirectory: false,
        displayName: 'new-app',
      })
    ).resolves.toBeUndefined();
  });

  test('allows empty directories', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'workflow-project-'));
    const target = join(tmp, 'existing');
    await mkdir(target);
    await expect(
      ensureProjectDirectoryReady({
        directory: target,
        usingCurrentDirectory: false,
        displayName: 'existing',
      })
    ).resolves.toBeUndefined();
  });

  test('rejects non-empty directories', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'workflow-project-'));
    const target = join(tmp, 'taken');
    await mkdir(target);
    await writeFile(join(target, 'file.txt'), 'content', 'utf8');
    await expect(
      ensureProjectDirectoryReady({
        directory: target,
        usingCurrentDirectory: false,
        displayName: 'taken',
      })
    ).rejects.toThrow(/already exists and is not empty/);
  });

  test('rejects files with the same name', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'workflow-project-'));
    const filePath = join(tmp, 'taken');
    await writeFile(filePath, 'content', 'utf8');
    await expect(
      ensureProjectDirectoryReady({
        directory: filePath,
        usingCurrentDirectory: false,
        displayName: 'taken',
      })
    ).rejects.toThrow(/file named "taken" already exists/);
  });

  test('enforces empty current directory', async () => {
    const currentDir = await mkdtemp(join(tmpdir(), 'workflow-current-'));
    await writeFile(join(currentDir, 'file.txt'), 'content', 'utf8');
    await expect(
      ensureProjectDirectoryReady({
        directory: currentDir,
        usingCurrentDirectory: true,
        displayName: '.',
      })
    ).rejects.toThrow(/current directory is not empty/);
  });
});
