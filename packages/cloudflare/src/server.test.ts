import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WorkflowHandlers } from './load-handlers.js';
import {
  createWorkflowCloudflareFetchHandler,
  createWorkflowCloudflareWorker,
} from './server.js';

const loadWorkflowHandlersMock = vi.hoisted(() =>
  vi.fn<(buildDir: string) => Promise<WorkflowHandlers>>()
);

const actualLoadersPromise = vi.hoisted(() =>
  vi.importActual<typeof import('./load-handlers.js')>('./load-handlers.js')
);

vi.mock('./load-handlers.js', async () => ({
  ...(await actualLoadersPromise),
  loadWorkflowHandlers: loadWorkflowHandlersMock,
}));

describe('createWorkflowCloudflareFetchHandler', () => {
  beforeEach(() => {
    loadWorkflowHandlersMock.mockReset();
  });

  test('handles workflow routes and returns responses', async () => {
    const flowResponse = new Response('ok');
    const flowHandler = vi.fn().mockResolvedValue(flowResponse);
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: flowHandler,
      step: vi.fn(),
      webhook: {},
    });

    const handler = await createWorkflowCloudflareFetchHandler();
    const request = new Request(
      'http://localhost/.well-known/workflow/v1/flow',
      { method: 'POST' }
    );
    const response = await handler(request, {}, {});

    expect(response).toBe(flowResponse);
    expect(flowHandler).toHaveBeenCalledWith(request);
  });

  test('returns undefined for non-workflow routes', async () => {
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: vi.fn(),
      step: vi.fn(),
      webhook: {},
    });

    const handler = await createWorkflowCloudflareFetchHandler();
    const response = await handler(
      new Request('http://localhost/health'),
      {},
      {}
    );

    expect(response).toBeUndefined();
  });

  test('logs when handler throws and returns 500', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), debug: vi.fn() };
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: vi.fn().mockRejectedValue(new Error('boom')),
      step: vi.fn(),
      webhook: {},
    });

    const handler = await createWorkflowCloudflareFetchHandler({ logger });
    const response = await handler(
      new Request('http://localhost/.well-known/workflow/v1/flow', {
        method: 'POST',
      }),
      {},
      {}
    );

    expect(response?.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('createWorkflowCloudflareWorker', () => {
  beforeEach(() => {
    loadWorkflowHandlersMock.mockReset();
  });

  test('falls back to custom fetch when workflow routes do not match', async () => {
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: vi.fn(),
      step: vi.fn(),
      webhook: {},
    });

    const fallbackResponse = new Response('custom', { status: 201 });
    const fallback = vi.fn().mockResolvedValue(fallbackResponse);
    const worker = await createWorkflowCloudflareWorker({ fetch: fallback });

    const response = await worker.fetch(
      new Request('http://localhost/other'),
      {},
      {}
    );

    expect(response).toBe(fallbackResponse);
    expect(fallback).toHaveBeenCalled();
  });

  test('returns built-in 404 when nothing handles the request', async () => {
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: vi.fn(),
      step: vi.fn(),
      webhook: {},
    });

    const worker = await createWorkflowCloudflareWorker();
    const response = await worker.fetch(
      new Request('http://localhost/other'),
      {},
      {}
    );

    expect(response.status).toBe(404);
  });
});
test('supports pre-imported modules instead of loading from disk', async () => {
  loadWorkflowHandlersMock.mockImplementationOnce(() => {
    throw new Error('should not load handlers');
  });
  const flowResponse = new Response('ok');
  const module = { POST: vi.fn().mockResolvedValue(flowResponse) };

  const handler = await createWorkflowCloudflareFetchHandler({
    modules: { flow: module, step: module, webhook: {} },
  });

  const response = await handler(
    new Request('http://localhost/.well-known/workflow/v1/flow', {
      method: 'POST',
    }),
    {},
    {}
  );

  expect(response).toBe(flowResponse);
});

test('can accept pre-resolved handlers without loading modules', async () => {
  loadWorkflowHandlersMock.mockImplementationOnce(() => {
    throw new Error('should not load handlers');
  });
  const handlers: WorkflowHandlers = {
    flow: vi.fn().mockResolvedValue(new Response('ok')),
    step: vi.fn().mockResolvedValue(new Response('ok')),
    webhook: {},
  };

  const handler = await createWorkflowCloudflareFetchHandler({
    handlers,
  });

  await handler(
    new Request('http://localhost/.well-known/workflow/v1/flow', {
      method: 'POST',
    }),
    {},
    {}
  );

  expect(handlers.flow).toHaveBeenCalled();
});
