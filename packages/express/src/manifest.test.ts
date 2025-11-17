import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { annotateWorkflowsFromManifest } from './manifest.js';

const tempDirs: string[] = [];

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'workflow-express-'));
  tempDirs.push(dir);
  return dir;
}

afterAll(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      await rm(dir, { recursive: true, force: true });
    })
  );
});

describe('annotateWorkflowsFromManifest', () => {
  it('annotates workflow functions from source files', async () => {
    const cwd = await createTempDir();
    await mkdir(join(cwd, '.well-known/workflow'), { recursive: true });
    await mkdir(join(cwd, 'workflows'), { recursive: true });

    const workflowFile = join(cwd, 'workflows/example.js');
    await writeFile(
      workflowFile,
      `
      async function handleGreeting() {}
      module.exports.handleGreeting = handleGreeting;
    `,
      'utf8'
    );

    const manifestPath = join('.well-known', 'workflow', 'manifest.json');
    await writeFile(
      join(cwd, manifestPath),
      JSON.stringify(
        {
          'workflows/example.js': {
            handleGreeting: { workflowId: 'workflow/test/example' },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    await annotateWorkflowsFromManifest({
      workingDir: cwd,
      manifestPath,
    });

    const mod = await import(pathToFileURL(workflowFile).href);
    const fn =
      (mod as Record<string, any>).handleGreeting ??
      (mod.default?.handleGreeting as any);
    expect(typeof fn).toBe('function');
    expect(fn.workflowId).toBe('workflow/test/example');
  });

  it('falls back to dist directory when source file is missing', async () => {
    const cwd = await createTempDir();
    await mkdir(join(cwd, '.well-known/workflow'), { recursive: true });
    await mkdir(join(cwd, 'dist/workflows'), { recursive: true });

    const builtWorkflowFile = join(cwd, 'dist/workflows/example.js');
    await writeFile(
      builtWorkflowFile,
      `
      async function handleGreeting() {}
      module.exports.handleGreeting = handleGreeting;
    `,
      'utf8'
    );

    const manifestPath = join('.well-known', 'workflow', 'manifest.json');
    await writeFile(
      join(cwd, manifestPath),
      JSON.stringify(
        {
          'workflows/example.js': {
            handleGreeting: { workflowId: 'workflow/test/dist-example' },
          },
        },
        null,
        2
      ),
      'utf8'
    );

    await annotateWorkflowsFromManifest({
      workingDir: cwd,
      manifestPath,
    });

    const mod = await import(pathToFileURL(builtWorkflowFile).href);
    const fn =
      (mod as Record<string, any>).handleGreeting ??
      (mod.default?.handleGreeting as any);
    expect(typeof fn).toBe('function');
    expect(fn.workflowId).toBe('workflow/test/dist-example');
  });
});
