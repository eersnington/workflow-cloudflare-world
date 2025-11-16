import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { join, resolve } from 'node:path';
import { WORKFLOW_ROUTES } from './constants.js';
import {
  loadWorkflowHandlers,
  type WorkflowHandlers,
  type WorkflowHttpMethod,
} from './load-handlers.js';
import { createRequestFromNode, sendNodeResponse } from './request-adapter.js';

export interface WorkflowNodeServerOptions {
  buildDir?: string;
  port?: number;
  hostname?: string;
  logger?: Pick<Console, 'info' | 'error' | 'debug'>;
}

export interface WorkflowNodeServer {
  url: string;
  close: () => Promise<void>;
  server: ReturnType<typeof createServer>;
}

export async function createWorkflowNodeServer(
  options: WorkflowNodeServerOptions = {}
): Promise<WorkflowNodeServer> {
  const logger = options.logger ?? console;
  const buildDir = resolve(
    options.buildDir ?? join(process.cwd(), '.well-known/workflow/v1')
  );

  const handlers = await loadWorkflowHandlers(buildDir);

  const server = createServer(async (req, res) => {
    await handleIncomingRequest(req, res, handlers, logger);
  });

  const hostname = options.hostname ?? '127.0.0.1';
  const port = options.port ?? Number.parseInt(process.env.PORT || '3152', 10);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, hostname, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });

  const address = server.address();
  const url = deriveServerUrl(address, hostname);
  logger.info?.(`Workflow node server listening on ${url}`);

  return {
    url,
    server,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }
          resolveClose();
        });
      }),
  };
}

async function handleIncomingRequest(
  req: IncomingMessage,
  res: ServerResponse,
  handlers: WorkflowHandlers,
  logger: Pick<Console, 'info' | 'error' | 'debug'>
): Promise<void> {
  try {
    const request = await createRequestFromNode(req);
    const response = await dispatchWorkflowRequest(request, handlers);
    await sendNodeResponse(res, response);
  } catch (error) {
    logger.error?.('Unhandled workflow request', error);
    if (!res.headersSent) {
      res.statusCode = 500;
    }
    res.end('Internal Server Error');
  }
}

async function dispatchWorkflowRequest(
  request: Request,
  handlers: WorkflowHandlers
): Promise<Response> {
  const url = new URL(request.url);
  const method = (request.method ?? 'GET').toUpperCase() as WorkflowHttpMethod;
  const pathname = url.pathname;

  if (pathname === WORKFLOW_ROUTES.flow) {
    return method === 'POST'
      ? handlers.flow(request)
      : methodNotAllowed('POST');
  }

  if (pathname === WORKFLOW_ROUTES.step) {
    return method === 'POST'
      ? handlers.step(request)
      : methodNotAllowed('POST');
  }

  if (pathname.startsWith(WORKFLOW_ROUTES.webhook)) {
    const webhookHandler = handlers.webhook[method];
    if (!webhookHandler) {
      return methodNotAllowed(...Object.keys(handlers.webhook));
    }
    return webhookHandler(request);
  }

  return new Response('Not Found', { status: 404 });
}

function methodNotAllowed(...allowed: Array<string | number>): Response {
  const entries = allowed.filter(Boolean).map((value) => String(value));
  const headers =
    entries.length > 0 ? { Allow: entries.join(', ') } : undefined;
  return new Response('Method Not Allowed', {
    status: 405,
    headers,
  });
}

function deriveServerUrl(
  address: ReturnType<ReturnType<typeof createServer>['address']>,
  fallbackHost: string
): string {
  if (!address) {
    return `http://${fallbackHost}`;
  }

  if (typeof address === 'string') {
    return address.startsWith('http') ? address : `http://${address}`;
  }

  const host = address.address === '::' ? '127.0.0.1' : address.address;
  return `http://${host}:${address.port}`;
}
