import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import type { Server } from 'node:http';
import express, {
  Router,
  type Application,
  type NextFunction,
  type Request as ExpressRequest,
  type RequestHandler,
  type Response as ExpressResponse,
} from 'express';
import { WORKFLOW_ROUTES } from './constants.js';
import {
  loadWorkflowHandlers,
  type WorkflowHttpMethod,
} from './load-handlers.js';

const BODYLESS_HTTP_METHODS = new Set(['GET', 'HEAD']);
type WebReadableStream = import('stream/web').ReadableStream;

type Logger = Pick<Console, 'info' | 'error' | 'debug'>;

export interface WorkflowExpressRouterOptions {
  buildDir?: string;
  logger?: Logger;
}

export interface WorkflowExpressServerOptions
  extends WorkflowExpressRouterOptions {
  port?: number;
  hostname?: string;
  enhanceApp?: (app: Application) => void | Promise<void>;
}

export async function createWorkflowExpressRouter(
  options: WorkflowExpressRouterOptions = {}
): Promise<Router> {
  const buildDir = resolve(
    options.buildDir ?? join(process.cwd(), '.well-known/workflow/v1')
  );
  const handlers = await loadWorkflowHandlers(buildDir);
  const logger = options.logger ?? console;

  const router = Router();

  router.post(
    WORKFLOW_ROUTES.flow,
    createWorkflowRouteHandler(async (req) => handlers.flow(req), {
      logger,
      description: 'workflow/flow',
    })
  );

  router.post(
    WORKFLOW_ROUTES.step,
    createWorkflowRouteHandler(async (req) => handlers.step(req), {
      logger,
      description: 'workflow/step',
    })
  );

  const webhookHandler = createWorkflowRouteHandler(
    async (req, method) => {
      const handler = handlers.webhook[method];
      if (!handler) {
        throw new MethodNotAllowedError(Object.keys(handlers.webhook));
      }
      return handler(req);
    },
    {
      logger,
      description: 'workflow/webhook',
    }
  );

  router.all(WORKFLOW_ROUTES.webhook, webhookHandler);
  router.all(`${WORKFLOW_ROUTES.webhook}/*`, webhookHandler);

  return router;
}

export async function createWorkflowExpressMiddleware(
  options: WorkflowExpressRouterOptions = {}
): Promise<RequestHandler> {
  return await createWorkflowExpressRouter(options);
}

export async function createWorkflowExpressServer(
  options: WorkflowExpressServerOptions = {}
): Promise<Server> {
  const app = express();
  if (options.enhanceApp) {
    await options.enhanceApp(app);
  }
  const router = await createWorkflowExpressRouter(options);
  app.use(router);

  const port = options.port ?? Number.parseInt(process.env.PORT ?? '3154', 10);

  return await new Promise<Server>((resolveServer, rejectServer) => {
    let server: Server;
    const onListen = () => resolveServer(server);
    if (options.hostname) {
      server = app.listen(port, options.hostname, onListen);
    } else {
      server = app.listen(port, onListen);
    }
    server.once('error', (error) => rejectServer(error));
  });
}

class MethodNotAllowedError extends Error {
  allowed: string[];

  constructor(allowed: Array<string | number>) {
    super('Method Not Allowed');
    this.name = 'MethodNotAllowedError';
    this.allowed = allowed
      .filter((entry) => Boolean(entry))
      .map((entry) => String(entry));
  }
}

function createWorkflowRouteHandler(
  handler: (request: Request, method: WorkflowHttpMethod) => Promise<Response>,
  options: {
    logger: Logger;
    description: string;
  }
): RequestHandler {
  return async (
    req: ExpressRequest,
    res: ExpressResponse,
    next: NextFunction
  ) => {
    try {
      const method = normalizeMethod(req.method);

      const request = createRequestFromExpress(req);
      const response = await handler(request, method);
      if (response.status >= 500) {
        options.logger.error?.(
          `Workflow handler ${options.description} returned ${response.status} for ${req.method} ${req.originalUrl}`
        );
      }
      await sendResponse(res, response);
    } catch (error) {
      if (error instanceof MethodNotAllowedError) {
        respondMethodNotAllowed(res, error.allowed);
        return;
      }
      next(error);
    }
  };
}

function respondMethodNotAllowed(
  res: ExpressResponse,
  allowed: Array<string | number>
) {
  const entries = allowed.filter(Boolean).map((entry) => String(entry));
  if (entries.length > 0) {
    res.setHeader('Allow', entries.join(', '));
  }
  res.status(405).send('Method Not Allowed');
}

function normalizeMethod(method?: string): WorkflowHttpMethod {
  return (method ?? 'GET').toUpperCase() as WorkflowHttpMethod;
}

function createRequestFromExpress(req: ExpressRequest): Request {
  const protocol = req.protocol || (req.secure ? 'https' : 'http');
  const host = req.get('host') ?? 'localhost';
  const url = `${protocol}://${host}${req.originalUrl ?? req.url ?? ''}`;
  const method = normalizeMethod(req.method);
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'undefined') continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.append(key, value);
    }
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
  };

  if (!BODYLESS_HTTP_METHODS.has(method) && req.readable) {
    init.body = req as unknown as BodyInit;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

async function sendResponse(
  res: ExpressResponse,
  response: Response
): Promise<void> {
  res.status(response.status);

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      return;
    }
    res.setHeader(key, value);
  });

  const headersWithCookies = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = headersWithCookies.getSetCookie?.();
  if (cookies && cookies.length > 0) {
    res.setHeader('set-cookie', cookies);
  }

  if (!response.body) {
    res.end();
    return;
  }

  if (typeof (Readable as any).fromWeb === 'function') {
    const nodeStream = Readable.fromWeb(
      response.body as unknown as WebReadableStream
    );
    nodeStream.on('error', (error) => {
      res.destroy(error as Error);
    });
    nodeStream.pipe(res);
    return;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}
