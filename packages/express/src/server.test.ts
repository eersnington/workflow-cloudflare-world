import express, {
  type NextFunction,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowHandler } from './load-handlers.js';
import { createWorkflowExpressRouter } from './server.js';

type WorkflowFetchRequest = Parameters<WorkflowHandler>[0];

const flowHandler = vi.fn<(req: WorkflowFetchRequest) => Promise<Response>>(
  async () => {
    return new Response(null, { status: 201 });
  }
);
const stepHandler = vi.fn<(req: WorkflowFetchRequest) => Promise<Response>>(
  async () => {
    return new Response(null, { status: 200 });
  }
);
const webhookHandler = vi.fn<(req: WorkflowFetchRequest) => Promise<Response>>(
  async () => {
    return new Response(null, { status: 204 });
  }
);

vi.mock('./load-handlers.js', () => ({
  loadWorkflowHandlers: async () => ({
    flow: flowHandler as unknown as WorkflowHandler,
    step: stepHandler as unknown as WorkflowHandler,
    webhook: {
      POST: webhookHandler as unknown as WorkflowHandler,
    },
  }),
}));

const logger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

beforeEach(() => {
  flowHandler.mockClear();
  stepHandler.mockClear();
  webhookHandler.mockClear();
  logger.info.mockClear();
  logger.error.mockClear();
  logger.debug.mockClear();
});

function createMockRequest(init: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
}): ExpressRequest {
  const headers = Object.fromEntries(
    Object.entries(init.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ])
  );
  const getHeader = ((name: string) => {
    const key = name.toLowerCase();
    if (key === 'set-cookie') {
      return undefined;
    }
    return headers[key];
  }) as ExpressRequest['get'];

  const req: Partial<ExpressRequest> = {
    method: init.method ?? 'GET',
    originalUrl: init.url ?? '/',
    url: init.url ?? '/',
    headers,
    protocol: 'http',
    secure: false,
    readable: false,
    get: getHeader,
  };
  return req as ExpressRequest;
}

function createMockResponse(): ExpressResponse {
  const prototype = express.response;
  const res = Object.create(prototype);
  Object.assign(res, {
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    end: vi.fn(),
    send: vi.fn(),
  });
  return res as ExpressResponse;
}

function getRouteHandler(router: any, path: string) {
  const layer = router.stack.find(
    (entry: any) => entry.route && entry.route.path === path
  );
  if (!layer) {
    throw new Error(`Route ${path} not found`);
  }
  const handler = layer.route.stack[0]?.handle;
  if (typeof handler !== 'function') {
    throw new Error(`Route ${path} missing handler`);
  }
  return handler;
}

describe('createWorkflowExpressRouter', () => {
  it('registers webhook wildcard route using express syntax', async () => {
    const router = await createWorkflowExpressRouter({ logger });
    const paths = router.stack
      .map((layer: any) => layer.route?.path)
      .filter(Boolean);
    expect(paths).toContain('/.well-known/workflow/v1/webhook');
    expect(paths).toContain('/.well-known/workflow/v1/webhook/:rest*');
  });

  it('passes POST /flow to the flow handler', async () => {
    const router = await createWorkflowExpressRouter({ logger });
    const handler = getRouteHandler(router, '/.well-known/workflow/v1/flow');
    const req = createMockRequest({
      method: 'POST',
      url: '/.well-known/workflow/v1/flow',
      headers: { host: 'example.test' },
    });
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;
    await handler(req, res, next);
    expect(flowHandler).toHaveBeenCalledTimes(1);
    const call = flowHandler.mock.calls[0];
    expect(call).toBeDefined();
    const [workflowReq] = call!;
    expect(workflowReq?.url).toBe(
      'http://example.test/.well-known/workflow/v1/flow'
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.end).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('routes webhook subpaths to the webhook handler', async () => {
    const router = await createWorkflowExpressRouter({ logger });
    const handler = getRouteHandler(
      router,
      '/.well-known/workflow/v1/webhook/:rest*'
    );
    const req = createMockRequest({
      method: 'POST',
      url: '/.well-known/workflow/v1/webhook/foo/bar',
      headers: { host: 'example.test' },
    });
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;
    await handler(req, res, next);
    expect(webhookHandler).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });

  it('responds with 405 for unsupported webhook methods', async () => {
    const router = await createWorkflowExpressRouter({ logger });
    const handler = getRouteHandler(router, '/.well-known/workflow/v1/webhook');
    const req = createMockRequest({
      method: 'GET',
      url: '/.well-known/workflow/v1/webhook',
      headers: { host: 'example.test' },
    });
    const res = createMockResponse();
    const next = vi.fn() as unknown as NextFunction;
    await handler(req, res, next);
    expect(webhookHandler).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.send).toHaveBeenCalledWith('Method Not Allowed');
    expect(next).not.toHaveBeenCalled();
  });
});
