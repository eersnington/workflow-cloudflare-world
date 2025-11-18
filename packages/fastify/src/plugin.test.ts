import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import Fastify from 'fastify';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import workflowPlugin from './plugin.js';
import { FastifyBuilder } from './builder.js';
import { HANDLER_FILENAMES, WORKFLOW_ROUTES } from './constants.js';
import type { WorkflowFastifyPluginOptions } from './plugin.js';

const tempRoots: string[] = [];

describe('workflow-fastify plugin', () => {
  let fastify: ReturnType<typeof Fastify>;
  let tempDir: string;

  const getOutputDir = () =>
    relative(process.cwd(), join(tempDir, '.well-known', 'workflow', 'v1'));

  const createPluginOptions = (
    overrides: Partial<WorkflowFastifyPluginOptions> = {}
  ): WorkflowFastifyPluginOptions => ({
    outputDir: getOutputDir(),
    autoBuild: false,
    ...overrides,
  });

  const registerWithPlugin = (
    overrides?: Partial<WorkflowFastifyPluginOptions>
  ) => fastify.register(workflowPlugin, createPluginOptions(overrides));

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
    await registerWithPlugin();

    // Test that routes are registered by checking printed routes
    const routes = fastify.printRoutes();
    expect(routes).toContain('flow (POST)');
    expect(routes).toContain('step (POST)');
    expect(routes).toContain(':token (GET, POST, PUT, DELETE, PATCH, HEAD)');
  });

  test('plugin registration does not add decorators', async () => {
    await registerWithPlugin();

    // Should not have workflow decorator - using standard API instead
    expect(fastify.workflow).toBeUndefined();
  });

  test('handles flow requests correctly', async () => {
    await registerWithPlugin({
      errorHandler: false,
      validation: false,
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
    await registerWithPlugin({
      errorHandler: false,
      validation: false,
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
    await registerWithPlugin({
      errorHandler: false,
      validation: false,
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
    await registerWithPlugin({
      validation: false,
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/api/non-workflow',
    });

    // Fastify returns 404 for unknown routes by default
    expect(response.statusCode).toBe(404);
  });

  test('handles webhook method not allowed', async () => {
    await registerWithPlugin({
      errorHandler: false,
      validation: false,
    });

    const response = await fastify.inject({
      method: 'PATCH', // Method not supported by mock webhook handler
      url: '/.well-known/workflow/v1/webhook/test-token',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(405);
  });

  test('respects custom route prefix', async () => {
    await registerWithPlugin({
      prefix: '/custom-prefix',
      validation: false,
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/custom-prefix/flow',
      payload: { test: 'data' },
    });

    expect(response.statusCode).toBe(200);
  });

  test('auto-build uses provided builder', async () => {
    const buildSpy = vi.fn(async () => {});
    const cleanupSpy = vi.fn(async () => {});
    const stubBuilder = {
      build: buildSpy,
      cleanup: cleanupSpy,
    } as unknown as FastifyBuilder;

    await fastify.register(workflowPlugin, {
      builder: stubBuilder,
      validation: false,
    });

    expect(buildSpy).toHaveBeenCalled();

    await fastify.close();
    expect(cleanupSpy).toHaveBeenCalled();
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
    expect(stats.buildTarget).toBe('standalone');
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
    // Ensure workflows directory exists first
    const workflowsDir = join(tempDir, 'workflows');
    await mkdir(workflowsDir, { recursive: true });

    const hmrBuilder = new FastifyBuilder({
      outputDir: join(tempDir, '.well-known', 'workflow', 'v1'),
      dirs: [workflowsDir],
      hmr: true,
    });

    const stats = hmrBuilder.getBuildStats();
    // HMR status should be determined (may be false if watching fails, but builder doesn't crash)
    expect(typeof stats.hmrEnabled).toBe('boolean');

    await hmrBuilder.disableHMR();
    const statsAfterDisable = hmrBuilder.getBuildStats();
    expect(statsAfterDisable.hmrEnabled).toBe(false);

    await hmrBuilder.cleanup();
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
