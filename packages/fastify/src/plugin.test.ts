import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import workflowPlugin from './plugin.js';
import { FastifyBuilder } from './builder.js';
import { HANDLER_FILENAMES, WORKFLOW_ROUTES } from './constants.js';
import { getWorkflow } from './workflows.js';

const tempRoots: string[] = [];

describe('workflow-fastify plugin', () => {
  let fastify: ReturnType<typeof Fastify>;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = await mkdtemp(join(tmpdir(), 'workflow-fastify-test-'));
    tempRoots.push(tempDir);

    // Create workflow output directory
    const outputDir = join(tempDir, '.well-known', 'workflow', 'v1');
    await mkdir(outputDir, { recursive: true });

    // Create mock workflow handlers
    await createMockHandlers(outputDir);
  });

  beforeEach(async () => {
    fastify = Fastify({
      logger: false, // Disable logging for tests
    });
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

  test('registers workflow routes correctly', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
    });

    // Test that routes are registered by checking printed routes
    const routes = fastify.printRoutes();
    expect(routes).toContain('/.well-known/workflow/v1/flow');
    expect(routes).toContain('/.well-known/workflow/v1/step');
    expect(routes).toContain('/.well-known/workflow/v1/webhook/:token');
  });

  test('decorates fastify instance with workflow utilities', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
    });

    expect(fastify.workflow).toBeDefined();
    expect(fastify.workflow.getWorkflow).toBeTypeOf('function');
    expect(fastify.workflow.execute).toBeTypeOf('function');
    expect(fastify.workflow.listWorkflows).toBeTypeOf('function');
    expect(fastify.workflow.getStatus).toBeTypeOf('function');
  });

  test('handles flow requests correctly', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
      errorHandler: false, // Disable custom error handler for this test
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/.well-known/workflow/v1/flow',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'flow-executed', test: 'data' });
  });

  test('handles step requests correctly', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
      errorHandler: false,
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/.well-known/workflow/v1/step',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'step-executed', test: 'data' });
  });

  test('handles webhook requests correctly', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
      errorHandler: false,
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/.well-known/workflow/v1/webhook/test-token',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      message: 'webhook-received',
      token: 'test-token',
      test: 'data',
    });
  });

  test('returns 404 for non-workflow routes', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/non-workflow',
    });

    // Fastify returns 404 for unknown routes by default
    expect(response.statusCode).toBe(404);
  });

  test('handles webhook method not allowed', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
      errorHandler: false,
    });

    const response = await fastify.inject({
      method: 'PATCH', // Method not supported by mock webhook handler
      url: '/.well-known/workflow/v1/webhook/test-token',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(405);
  });

  test('respects custom route prefix', async () => {
    await fastify.register(workflowPlugin, {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
      prefix: '/custom-prefix',
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/custom-prefix/flow',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(200);
  });
});

describe('FastifyBuilder', () => {
  let tempDir: string;
  let builder: FastifyBuilder;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'workflow-fastify-builder-'));
    tempRoots.push(tempDir);

    // Create workflows directory
    const workflowsDir = join(tempDir, 'workflows');
    await mkdir(workflowsDir, { recursive: true });

    // Create a sample workflow file
    await writeFile(
      join(workflowsDir, 'test.ts'),
      `
        export async function testWorkflow(name: string) {
          'use workflow';
          return { message: 'Hello, ' + name + '!' };
        }
      `
    );
  });

  beforeEach(() => {
    builder = new FastifyBuilder({
      outputDir: join(tempDir, '.well-known', 'workflow', 'v1'),
      dirs: [join(tempDir, 'workflows')],
      hmr: false, // Disable HMR for tests
    });
  });

  afterAll(async () => {
    await builder.cleanup();
  });

  test('creates FastifyBuilder with correct configuration', () => {
    expect(builder).toBeInstanceOf(FastifyBuilder);

    const stats = builder.getBuildStats();
    expect(stats.buildTarget).toBe('fastify');
    expect(stats.hmrEnabled).toBe(false);
  });

  test('builds workflow files successfully', async () => {
    // Mock the base builder methods for testing
    const originalGetInputFiles = builder.getInputFiles;
    builder.getInputFiles = async () => ['test-workflow.ts'];

    const originalCreateStepsBundle = builder.createStepsBundle;
    const originalCreateWorkflowsBundle = builder.createWorkflowsBundle;
    const originalCreateWebhookBundle = builder.createWebhookBundle;
    const originalCreateClientLibrary = builder.createClientLibrary;

    let bundleCreated = false;

    builder.createStepsBundle = async () => {
      bundleCreated = true;
    };
    builder.createWorkflowsBundle = async () => {};
    builder.createWebhookBundle = async () => {};
    builder.createClientLibrary = async () => {};

    await builder.build();

    expect(bundleCreated).toBe(true);
  });

  test('handles HMR enable/disable', async () => {
    const hmrBuilder = new FastifyBuilder({
      outputDir: join(tempDir, '.well-known', 'workflow', 'v1'),
      dirs: [join(tempDir, 'workflows')],
      hmr: true,
    });

    const stats = hmrBuilder.getBuildStats();
    expect(stats.hmrEnabled).toBe(true);

    await hmrBuilder.disableHMR();
    const statsAfterDisable = hmrBuilder.getBuildStats();
    expect(statsAfterDisable.hmrEnabled).toBe(false);

    await hmrBuilder.cleanup();
  });
});

describe('workflow utilities', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'workflow-fastify-utils-'));
    tempRoots.push(tempDir);

    const outputDir = join(tempDir, '.well-known', 'workflow', 'v1');
    await mkdir(outputDir, { recursive: true });

    // Create mock client bundle
    await writeFile(
      join(outputDir, 'client.js'),
      `
        export async function testWorkflow(data) {
          throw new Error("You attempted to execute workflow testWorkflow function directly...");
        }
        testWorkflow.workflowId = "workflow//workflows/test.ts//testWorkflow";
        testWorkflow.description = "Test workflow";

        export async function anotherWorkflow(data) {
          throw new Error("You attempted to execute workflow anotherWorkflow function directly...");
        }
        anotherWorkflow.workflowId = "workflow//workflows/test.ts//anotherWorkflow";
      `
    );
  });

  test('loads workflow from client bundle', async () => {
    const workflow = await getWorkflow('testWorkflow', {
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
    });

    expect(workflow).toBeDefined();
    expect(typeof workflow).toBe('function');
    expect(workflow.workflowId).toBe(
      'workflow//workflows/test.ts//testWorkflow'
    );
  });

  test('throws error for missing workflow', async () => {
    await expect(
      getWorkflow('nonExistentWorkflow', {
        outputDir: relative(
          process.cwd(),
          join(tempDir, '.well-known', 'workflow', 'v1')
        ),
      })
    ).rejects.toThrow("Workflow 'nonExistentWorkflow' not found");
  });

  test('throws error for missing client bundle', async () => {
    await expect(
      getWorkflow('testWorkflow', {
        outputDir: 'non-existent-directory',
      })
    ).rejects.toThrow('Workflow client bundle not found');
  });

  test('lists available workflows', async () => {
    const workflows = await listWorkflows({
      outputDir: relative(
        process.cwd(),
        join(tempDir, '.well-known', 'workflow', 'v1')
      ),
    });

    expect(workflows).toContain('testWorkflow');
    expect(workflows).toContain('anotherWorkflow');
  });
});

// Helper functions
async function createMockHandlers(outputDir: string): Promise<void> {
  const handlers = {
    [HANDLER_FILENAMES.flow]: `
      export const POST = async (request) => {
        const body = await request.json();
        return Response.json({ message: 'flow-executed', ...body });
      };
    `,
    [HANDLER_FILENAMES.step]: `
      export const POST = async (request) => {
        const body = await request.json();
        return Response.json({ message: 'step-executed', ...body });
      };
    `,
    [HANDLER_FILENAMES.webhook]: `
      export const POST = async (request) => {
        const url = new URL(request.url);
        const token = url.pathname.split('/').pop();
        const body = await request.json();
        return Response.json({ message: 'webhook-received', token, ...body });
      };
      export const GET = async (request) => {
        const url = new URL(request.url);
        const token = url.pathname.split('/').pop();
        return Response.json({ message: 'webhook-get', token });
      };
    `,
    [HANDLER_FILENAMES.client]: `
      export async function mockWorkflow(data) {
        throw new Error("Direct execution not allowed");
      }
      mockWorkflow.workflowId = "workflow//workflows/mock.ts//mockWorkflow";
    `,
  };

  await Promise.all(
    Object.entries(handlers).map(([file, contents]) =>
      writeFile(join(outputDir, file), contents, 'utf8')
    )
  );
}
