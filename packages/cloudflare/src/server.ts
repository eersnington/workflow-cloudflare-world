import { join, resolve } from 'node:path';
import { WORKFLOW_ROUTES } from './constants.js';
import {
  createWorkflowHandlersFromModules,
  loadWorkflowHandlers,
  type HandlerModule,
  type WorkflowHandler,
  type WorkflowHandlers,
  type WorkflowHttpMethod,
} from './load-handlers.js';

type MaybePromise<T> = T | Promise<T>;

type CloudflareExecutionContext = {
  waitUntil?(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
};

export interface WorkflowCloudflareFetchHandlerOptions<
  Env = Record<string, unknown>,
  Ctx = CloudflareExecutionContext,
> {
  buildDir?: string;
  handlers?: WorkflowHandlers;
  modules?: {
    flow: HandlerModule;
    step: HandlerModule;
    webhook: Partial<Record<WorkflowHttpMethod, WorkflowHandler>>;
  };
  logger?: Pick<Console, 'info' | 'error' | 'debug'>;
  /**
   * Optional hook that lets you observe when the Workflow handler
   * is about to process a request. Useful for debugging.
   */
  onBeforeHandle?: (request: Request, env: Env, ctx: Ctx) => MaybePromise<void>;
}

export type WorkflowCloudflareFetchHandler<
  Env = Record<string, unknown>,
  Ctx = CloudflareExecutionContext,
> = (request: Request, env: Env, ctx: Ctx) => Promise<Response | undefined>;

export interface WorkflowCloudflareWorkerOptions<
  Env = Record<string, unknown>,
  Ctx = CloudflareExecutionContext,
> extends WorkflowCloudflareFetchHandlerOptions<Env, Ctx> {
  /**
   * Custom fetch handler for all non-workflow routes.
   */
  fetch?: WorkflowCloudflareCustomFetch<Env, Ctx>;
  /**
   * Custom response when no route matches.
   */
  notFoundResponse?: Response | (() => Response | Promise<Response>);
}

export type WorkflowCloudflareCustomFetch<
  Env = Record<string, unknown>,
  Ctx = CloudflareExecutionContext,
> = (request: Request, env: Env, ctx: Ctx) => Promise<Response>;

export async function createWorkflowCloudflareFetchHandler<
  Env = Record<string, unknown>,
  Ctx = CloudflareExecutionContext,
>(
  options: WorkflowCloudflareFetchHandlerOptions<Env, Ctx> = {}
): Promise<WorkflowCloudflareFetchHandler<Env, Ctx>> {
  const logger = options.logger ?? console;
  const handlers =
    options.handlers ??
    (options.modules
      ? createWorkflowHandlersFromModules(options.modules)
      : await loadWorkflowHandlers(
          resolve(
            options.buildDir ?? join(process.cwd(), '.well-known/workflow/v1')
          )
        ));

  return async (request, env, ctx) => {
    const pathname = getRequestPathname(request);
    if (!matchesWorkflowRoute(pathname)) {
      return undefined;
    }

    try {
      await options.onBeforeHandle?.(request, env, ctx);
      const response = await dispatchWorkflowRequest(request, handlers);
      if (response.status >= 500) {
        logger.error?.(
          `Workflow handler returned ${response.status} for ${request.method} ${request.url}`
        );
      }
      return response;
    } catch (error) {
      logger.error?.('Unhandled workflow request', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  };
}

export async function createWorkflowCloudflareWorker<
  Env = Record<string, unknown>,
  Ctx = CloudflareExecutionContext,
>(options: WorkflowCloudflareWorkerOptions<Env, Ctx> = {}) {
  const workflowHandler = await createWorkflowCloudflareFetchHandler<Env, Ctx>(
    options
  );

  const fallbackResponse = (): Promise<Response> => {
    if (typeof options.notFoundResponse === 'function') {
      return Promise.resolve(options.notFoundResponse());
    }
    return Promise.resolve(
      options.notFoundResponse ?? new Response('Not Found', { status: 404 })
    );
  };

  return {
    fetch(request: Request, env: Env, ctx: Ctx) {
      return workflowHandler(request, env, ctx).then((workflowResponse) => {
        if (workflowResponse) {
          return workflowResponse;
        }
        if (options.fetch) {
          return options.fetch(request, env, ctx);
        }
        return fallbackResponse();
      });
    },
  };
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

function getRequestPathname(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return '/';
  }
}

function matchesWorkflowRoute(pathname: string): boolean {
  if (pathname === WORKFLOW_ROUTES.flow || pathname === WORKFLOW_ROUTES.step) {
    return true;
  }
  return (
    pathname === WORKFLOW_ROUTES.webhook ||
    pathname.startsWith(`${WORKFLOW_ROUTES.webhook}/`)
  );
}
