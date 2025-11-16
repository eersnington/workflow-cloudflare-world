import { join, resolve } from 'node:path';
import { WORKFLOW_ROUTES } from './constants.js';
import {
  loadWorkflowHandlers,
  type WorkflowHandlers,
  type WorkflowHttpMethod,
} from './load-handlers.js';

type BunServeOptions = Parameters<typeof Bun.serve>[0];
type BunServerInstance = ReturnType<typeof Bun.serve>;
type BunFetchHandler = NonNullable<BunServeOptions['fetch']>;
type BunRequest = Parameters<BunFetchHandler>[0];

export interface WorkflowBunServerOptions {
  buildDir?: string;
  port?: number;
  hostname?: string;
  development?: boolean;
  fetch?: WorkflowBunFetchHandler;
  logger?: Pick<Console, 'info' | 'error' | 'debug'>;
}

export type WorkflowBunFetchHandler = (
  request: BunRequest,
  server: BunServerInstance
) => Promise<Response> | Response;

export async function createWorkflowBunServer(
  options: WorkflowBunServerOptions = {}
) {
  const fetchHandler = await createWorkflowBunFetchHandler({
    buildDir: options.buildDir,
    fetch: options.fetch,
    logger: options.logger,
  });

  const serve = getBunServe();
  const port = options.port ?? Number.parseInt(process.env.PORT || '3152', 10);

  return serve({
    port,
    hostname: options.hostname,
    development: options.development,
    fetch: fetchHandler,
  });
}

export async function createWorkflowBunFetchHandler(
  options: {
    buildDir?: string;
    fetch?: WorkflowBunFetchHandler;
    logger?: Pick<Console, 'info' | 'error' | 'debug'>;
  } = {}
): Promise<WorkflowBunFetchHandler> {
  const buildDir = resolve(
    options.buildDir ?? join(process.cwd(), '.well-known/workflow/v1')
  );
  const handlers = await loadWorkflowHandlers(buildDir);
  const logger = options.logger ?? console;

  return async (request: BunRequest, server: BunServerInstance) => {
    const workflowResponse = await dispatchWorkflowRequest(request, handlers);
    if (workflowResponse) {
      if (workflowResponse.status >= 500) {
        logger.error?.(
          `Workflow handler returned ${
            workflowResponse.status
          } for ${request.method} ${request.url}`
        );
      }
      return workflowResponse;
    }

    if (options.fetch) {
      return options.fetch(request, server);
    }

    return new Response('Not Found', { status: 404 });
  };
}

async function dispatchWorkflowRequest(
  request: BunRequest,
  handlers: WorkflowHandlers
): Promise<Response | undefined> {
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

  if (
    pathname === WORKFLOW_ROUTES.webhook ||
    pathname.startsWith(`${WORKFLOW_ROUTES.webhook}/`)
  ) {
    const webhookHandler = handlers.webhook[method];
    if (!webhookHandler) {
      return methodNotAllowed(...Object.keys(handlers.webhook));
    }
    return webhookHandler(request);
  }

  return undefined;
}

function methodNotAllowed(...allowed: Array<string | number>): Response {
  const entries = allowed.filter(Boolean).map((item) => String(item));
  const headers =
    entries.length > 0 ? { Allow: entries.join(', ') } : undefined;
  return new Response('Method Not Allowed', {
    status: 405,
    headers,
  });
}

function getBunServe(): (options: BunServeOptions) => BunServerInstance {
  const bunGlobal = (
    globalThis as {
      Bun?: { serve?: (options: BunServeOptions) => BunServerInstance };
    }
  ).Bun;
  if (!bunGlobal?.serve) {
    throw new Error(
      'Bun.serve is not available. Ensure this helper runs in the Bun runtime.'
    );
  }
  return bunGlobal.serve.bind(bunGlobal);
}
