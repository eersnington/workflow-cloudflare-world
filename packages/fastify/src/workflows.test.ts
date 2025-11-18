import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import {
  getWorkflow,
  listWorkflows,
  getWorkflowMetadata,
  clearWorkflowCache,
  getCacheStats,
  WorkflowNotFoundError,
  WorkflowBundleNotFoundError,
  isWorkflowError,
} from './workflows.js';

const tempRoots: string[] = [];

describe('workflow utilities', () => {
  let tempDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'workflow-fastify-utils-'));
    tempRoots.push(tempDir);

    outputDir = join(tempDir, '.well-known', 'workflow', 'v1');
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    clearWorkflowCache();
  });

  afterAll(async () => {
    // Cleanup temporary directories
    while (tempRoots.length) {
      const dir = tempRoots.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  describe('getWorkflow', () => {
    test('loads workflow from client bundle', async () => {
      await createMockClientBundle(outputDir);

      const workflow = await getWorkflow('testWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(workflow).toBeDefined();
      expect(typeof workflow).toBe('function');
      expect(workflow.workflowId).toBe(
        'workflow//workflows/test.ts//testWorkflow'
      );
      expect(workflow.description).toBe('Test workflow');
    });

    test('caches workflows for performance', async () => {
      await createMockClientBundle(outputDir);

      // First call - should load from file
      const workflow1 = await getWorkflow('testWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      // Second call - should use cache
      const workflow2 = await getWorkflow('testWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(workflow1).toBe(workflow2); // Same reference due to caching

      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toHaveLength(1);
    });

    test('throws WorkflowNotFoundError for missing workflow', async () => {
      await createMockClientBundle(outputDir);

      await expect(
        getWorkflow('nonExistentWorkflow', {
          outputDir: relative(process.cwd(), outputDir),
        })
      ).rejects.toThrow(WorkflowNotFoundError);
    });

    test('throws WorkflowBundleNotFoundError for missing client bundle', async () => {
      await expect(
        getWorkflow('testWorkflow', {
          outputDir: 'non-existent-directory',
        })
      ).rejects.toThrow(WorkflowBundleNotFoundError);
    });

    test('clears cache on error', async () => {
      await createMockClientBundle(outputDir);

      // First successful load
      await getWorkflow('testWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(getCacheStats().size).toBe(1);

      // Force error by using invalid directory
      try {
        await getWorkflow('testWorkflow', {
          outputDir: 'invalid-directory',
        });
      } catch (error) {
        // Expected to fail
      }

      // Cache should be cleared
      expect(getCacheStats().size).toBe(0);
    });

    test('validates workflow structure', async () => {
      // Create invalid client bundle
      await writeFile(
        join(outputDir, 'client.js'),
        `
          export const invalidWorkflow = "not a function";
          export const missingId = () => {};
        `
      );

      await expect(
        getWorkflow('invalidWorkflow', {
          outputDir: relative(process.cwd(), outputDir),
        })
      ).rejects.toThrow('Workflow must be a function');

      await expect(
        getWorkflow('missingId', {
          outputDir: relative(process.cwd(), outputDir),
        })
      ).rejects.toThrow('Workflow missing required workflowId property');
    });
  });

  describe('listWorkflows', () => {
    test('lists all available workflows', async () => {
      await createMockClientBundle(outputDir);

      const workflows = await listWorkflows({
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(workflows).toContain('testWorkflow');
      expect(workflows).toContain('anotherWorkflow');
      expect(workflows).toHaveLength(2);
    });

    test('returns empty array for missing client bundle', async () => {
      const workflows = await listWorkflows({
        outputDir: 'non-existent-directory',
      });

      expect(workflows).toHaveLength(0);
    });

    test('filters non-function exports', async () => {
      await writeFile(
        join(outputDir, 'client.js'),
        `
          export const validWorkflow = () => {};
          validWorkflow.workflowId = "test";

          export const invalidExport = "not a function";
          export const anotherFunction = () => {}; // No workflowId
          export const config = { value: 42 };
        `
      );

      const workflows = await listWorkflows({
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(workflows).toContain('validWorkflow');
      expect(workflows).not.toContain('invalidExport');
      expect(workflows).not.toContain('anotherFunction');
      expect(workflows).not.toContain('config');
      expect(workflows).toHaveLength(1);
    });
  });

  describe('getWorkflowMetadata', () => {
    test('returns workflow metadata', async () => {
      await createMockClientBundle(outputDir);

      const metadata = await getWorkflowMetadata('testWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(metadata).toEqual({
        name: 'testWorkflow',
        workflowId: 'workflow//workflows/test.ts//testWorkflow',
        description: 'Test workflow',
        parameters: [],
        returnType: undefined,
      });
    });

    test('returns null for missing workflow', async () => {
      await createMockClientBundle(outputDir);

      const metadata = await getWorkflowMetadata('nonExistentWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(metadata).toBeNull();
    });
  });

  describe('cache management', () => {
    test('clearWorkflowCache clears all caches', async () => {
      await createMockClientBundle(outputDir);

      // Load some workflows to populate cache
      await getWorkflow('testWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });
      await getWorkflow('anotherWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      expect(getCacheStats().size).toBe(2);

      clearWorkflowCache();

      expect(getCacheStats().size).toBe(0);
      expect(getCacheStats().entries).toHaveLength(0);
    });

    test('getCacheStats returns detailed cache information', async () => {
      await createMockClientBundle(outputDir);

      const startTime = Date.now();
      await getWorkflow('testWorkflow', {
        outputDir: relative(process.cwd(), outputDir),
      });

      const stats = getCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toHaveLength(1);

      const entry = stats.entries[0];
      expect(entry.key).toContain('testWorkflow');
      expect(entry.timestamp).toBeGreaterThanOrEqual(startTime);
      expect(entry.age).toBeLessThan(1000); // Should be very recent
    });
  });

  describe('error handling', () => {
    test('isWorkflowError identifies workflow errors correctly', async () => {
      const notFoundError = new WorkflowNotFoundError('test', []);
      const bundleError = new WorkflowBundleNotFoundError('/path');
      const genericError = new Error('Generic error');

      expect(isWorkflowError(notFoundError)).toBe(true);
      expect(isWorkflowError(bundleError)).toBe(true);
      expect(isWorkflowError(genericError)).toBe(false);
    });

    test('WorkflowNotFoundError includes available workflows', async () => {
      await createMockClientBundle(outputDir);

      try {
        await getWorkflow('missingWorkflow', {
          outputDir: relative(process.cwd(), outputDir),
        });
      } catch (error) {
        if (error instanceof WorkflowNotFoundError) {
          expect(error.message).toContain('missingWorkflow');
          expect(error.message).toContain('testWorkflow');
          expect(error.message).toContain('anotherWorkflow');
        }
      }
    });

    test('WorkflowBundleNotFoundError includes helpful message', async () => {
      try {
        await getWorkflow('testWorkflow', {
          outputDir: 'non-existent-directory',
        });
      } catch (error) {
        if (error instanceof WorkflowBundleNotFoundError) {
          expect(error.message).toContain('workflow build');
          expect(error.message).toContain('useworkflow.dev');
        }
      }
    });
  });
});

async function createMockClientBundle(outputDir: string): Promise<void> {
  const clientBundleContent = `
    export async function testWorkflow(data) {
      throw new Error("You attempted to execute workflow testWorkflow function directly...");
    }
    testWorkflow.workflowId = "workflow//workflows/test.ts//testWorkflow";
    testWorkflow.description = "Test workflow";
    testWorkflow.parameters = ["name"];
    testWorkflow.returnType = "object";

    export async function anotherWorkflow(data) {
      throw new Error("You attempted to execute workflow anotherWorkflow function directly...");
    }
    anotherWorkflow.workflowId = "workflow//workflows/test.ts//anotherWorkflow";
    anotherWorkflow.description = "Another test workflow";

    export const notAWorkflow = "this is not a workflow function";
    export const functionWithoutId = () => "missing workflowId property";
  `;

  await writeFile(join(outputDir, 'client.js'), clientBundleContent, 'utf8');
}
