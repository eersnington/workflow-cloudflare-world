import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { getWorkflow } from './workflows.js';

describe('getWorkflow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'workflow-node-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test('loads workflows from the generated client bundle', async () => {
    await writeFile(
      join(tempDir, 'client.js'),
      `export function handleGreeting() { return 'hello'; }`
    );

    const workflow = await getWorkflow('handleGreeting', {
      buildDir: tempDir,
    });

    expect(typeof workflow).toBe('function');
    expect(workflow()).toBe('hello');
  });

  test('throws a helpful error when the client bundle is missing', async () => {
    await expect(
      getWorkflow('handleGreeting', { buildDir: tempDir })
    ).rejects.toThrow(/Workflow client bundle not found/);
  });

  test('throws when the workflow export is missing', async () => {
    await writeFile(
      join(tempDir, 'client.js'),
      `export function otherWorkflow() {}`
    );

    await expect(
      getWorkflow('handleGreeting', { buildDir: tempDir })
    ).rejects.toThrow(/Workflow 'handleGreeting' not found/);
  });
});
