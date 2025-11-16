import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { WorkflowHandlers } from './load-handlers.js';
import {
  createWorkflowBunFetchHandler,
  createWorkflowBunServer,
  type WorkflowBunFetchHandler,
} from './server.js';

const loadWorkflowHandlersMock = vi.hoisted(() =>
  vi.fn<(buildDir: string) => Promise<WorkflowHandlers>>()
);

vi.mock('./load-handlers.js', () => ({
  loadWorkflowHandlers: loadWorkflowHandlersMock,
}));

type BunServer = Parameters<WorkflowBunFetchHandler>[1];

describe('createWorkflowBunFetchHandler', () => {
  beforeEach(() => {
    loadWorkflowHandlersMock.mockReset();
  });

  test('handles workflow routes and returns the handler response', async () => {
    const flowResponse = new Response('ok');
    const flowHandler = vi.fn().mockResolvedValue(flowResponse);
    const handlers: WorkflowHandlers = {
      flow: flowHandler,
      step: vi.fn(),
      webhook: {},
    };
    loadWorkflowHandlersMock.mockResolvedValueOnce(handlers);

    const handler = await createWorkflowBunFetchHandler({
      buildDir: '/custom',
    });
    const request = new Request(
      'http://localhost/.well-known/workflow/v1/flow',
      {
        method: 'POST',
      }
    );
    const response = await handler(request, {} as BunServer);

    expect(response).toBe(flowResponse);
    expect(flowHandler).toHaveBeenCalledWith(request);
  });

  test('delegates to a fallback fetch handler', async () => {
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: vi.fn(),
      step: vi.fn(),
      webhook: {},
    });
    const fallbackResponse = new Response('fallback');
    const fallback = vi.fn().mockResolvedValue(fallbackResponse);

    const handler = await createWorkflowBunFetchHandler({ fetch: fallback });
    const response = await handler(
      new Request('http://localhost/health', { method: 'GET' }),
      {} as BunServer
    );

    expect(response).toBe(fallbackResponse);
    expect(fallback).toHaveBeenCalled();
  });

  test('logs when a workflow handler returns an error response', async () => {
    const logger = { error: vi.fn(), info: vi.fn(), debug: vi.fn() };
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: vi.fn().mockResolvedValue(new Response('boom', { status: 503 })),
      step: vi.fn(),
      webhook: {},
    });

    const handler = await createWorkflowBunFetchHandler({ logger });
    const request = new Request(
      'http://localhost/.well-known/workflow/v1/flow',
      { method: 'POST' }
    );
    const response = await handler(request, {} as BunServer);

    expect(response.status).toBe(503);
    expect(logger.error).toHaveBeenCalledWith(
      'Workflow handler returned 503 for POST http://localhost/.well-known/workflow/v1/flow'
    );
  });
});

describe('createWorkflowBunServer', () => {
  let originalBun: typeof globalThis.Bun;

  beforeEach(() => {
    originalBun = globalThis.Bun;
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.Bun = originalBun;
  });

  test('throws when Bun.serve is not available', async () => {
    globalThis.Bun = undefined as unknown as typeof Bun;
    await expect(createWorkflowBunServer()).rejects.toThrow(
      'Bun.serve is not available'
    );
  });

  test('passes configuration through to Bun.serve', async () => {
    const serveSpy = vi.fn().mockReturnValue({ stop: vi.fn() });
    loadWorkflowHandlersMock.mockResolvedValueOnce({
      flow: vi.fn().mockResolvedValue(new Response('ok')),
      step: vi.fn().mockResolvedValue(new Response('ok')),
      webhook: {},
    });
    globalThis.Bun = { serve: serveSpy } as unknown as typeof Bun;

    const server = await createWorkflowBunServer({
      port: 4100,
      hostname: '0.0.0.0',
    });

    expect(server).toEqual({ stop: expect.any(Function) });
    expect(serveSpy).toHaveBeenCalledWith({
      port: 4100,
      hostname: '0.0.0.0',
      development: undefined,
      fetch: expect.any(Function),
    });
  });
});
