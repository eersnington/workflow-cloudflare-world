import type { IncomingMessage, ServerResponse } from 'node:http';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { WorkflowHandlers } from './load-handlers.js';
import { createWorkflowNodeFetchHandler } from './server.js';

const loadWorkflowHandlersMock = vi.hoisted(() =>
  vi.fn<(buildDir: string) => Promise<WorkflowHandlers>>()
);
const createRequestFromNodeMock = vi.hoisted(() =>
  vi.fn<(req: IncomingMessage) => Promise<Request>>()
);
const sendNodeResponseMock = vi.hoisted(() =>
  vi.fn<(res: ServerResponse, response: Response) => Promise<void>>()
);

vi.mock('./load-handlers.js', () => ({
  loadWorkflowHandlers: loadWorkflowHandlersMock,
}));

vi.mock('./request-adapter.js', () => ({
  createRequestFromNode: createRequestFromNodeMock,
  sendNodeResponse: sendNodeResponseMock,
}));

function createRequest(
  url: string,
  method = 'POST',
  init?: RequestInit
): Request {
  return new Request(new URL(url, 'http://localhost').href, {
    method,
    ...init,
  });
}

function createNodeRequest(url: string, method = 'POST'): IncomingMessage {
  return {
    method,
    url,
    headers: {},
  } as IncomingMessage;
}

function createNodeResponse(): {
  res: ServerResponse;
  end: ReturnType<typeof vi.fn>;
} {
  const end = vi.fn();
  const res = {
    headersSent: false,
    statusCode: 200,
    end,
  } as unknown as ServerResponse;
  return { res, end };
}

describe('createWorkflowNodeFetchHandler', () => {
  beforeEach(() => {
    loadWorkflowHandlersMock.mockReset();
    createRequestFromNodeMock.mockReset();
    sendNodeResponseMock.mockReset();
  });

  test('handles workflow routes and sends the response', async () => {
    const flowResponse = new Response('ok');
    const flowHandler = vi.fn().mockResolvedValue(flowResponse);
    const handlers: WorkflowHandlers = {
      flow: flowHandler,
      step: vi.fn(),
      webhook: {},
    };
    loadWorkflowHandlersMock.mockResolvedValueOnce(handlers);
    const request = createRequest('/.well-known/workflow/v1/flow');
    createRequestFromNodeMock.mockResolvedValueOnce(request);
    sendNodeResponseMock.mockResolvedValueOnce();

    const handler = await createWorkflowNodeFetchHandler({
      buildDir: '/custom/workflow',
    });
    const req = createNodeRequest('/.well-known/workflow/v1/flow');
    const { res } = createNodeResponse();
    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(loadWorkflowHandlersMock).toHaveBeenCalledWith(
      expect.stringContaining('/custom/workflow')
    );
    expect(createRequestFromNodeMock).toHaveBeenCalledWith(req);
    expect(flowHandler).toHaveBeenCalledWith(request);
    expect(sendNodeResponseMock).toHaveBeenCalledWith(res, flowResponse);
  });

  test('skips requests outside of the workflow routes', async () => {
    const handlers: WorkflowHandlers = {
      flow: vi.fn(),
      step: vi.fn(),
      webhook: {},
    };
    loadWorkflowHandlersMock.mockResolvedValueOnce(handlers);

    const handler = await createWorkflowNodeFetchHandler({
      buildDir: '/custom',
    });
    const req = createNodeRequest('/api/health', 'GET');
    const { res } = createNodeResponse();
    const handled = await handler(req, res);

    expect(handled).toBe(false);
    expect(createRequestFromNodeMock).not.toHaveBeenCalled();
    expect(sendNodeResponseMock).not.toHaveBeenCalled();
  });

  test('logs and responds when the workflow handler throws', async () => {
    const failure = new Error('boom');
    const flowHandler = vi.fn().mockRejectedValue(failure);
    const handlers: WorkflowHandlers = {
      flow: flowHandler,
      step: vi.fn(),
      webhook: {},
    };
    loadWorkflowHandlersMock.mockResolvedValueOnce(handlers);
    createRequestFromNodeMock.mockResolvedValueOnce(
      createRequest('/.well-known/workflow/v1/flow')
    );
    const logger = { error: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const handler = await createWorkflowNodeFetchHandler({
      buildDir: '/custom',
      logger,
    });
    const req = createNodeRequest('/.well-known/workflow/v1/flow');
    const { res, end } = createNodeResponse();

    const handled = await handler(req, res);

    expect(handled).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled workflow request',
      failure
    );
    expect(res.statusCode).toBe(500);
    expect(end).toHaveBeenCalledWith('Internal Server Error');
    expect(sendNodeResponseMock).not.toHaveBeenCalled();
  });
});
