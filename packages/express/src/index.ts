import { watch } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  RequestHandler,
} from 'express';
import {
  ExpressBuilder,
  type ExpressBuilderOptions,
  DEFAULT_OUTPUT_DIR,
} from './builder.js';

export type WorkflowMiddlewareOptions = ExpressBuilderOptions & {
  prefix?: string;
  autoBuild?: boolean;
  builder?: ExpressBuilder;
};

/**
 * Express middleware that builds workflow handlers (in dev) and routes workflow requests.
 */
export function workflows(
  options: WorkflowMiddlewareOptions = {}
): RequestHandler {
  const prefix = normalizePrefix(
    options.prefix ?? `/${options.outputDir ?? DEFAULT_OUTPUT_DIR}`
  );
  const shouldAutoBuild = options.autoBuild !== false;
  const shouldWatch = options.watch ?? process.env.NODE_ENV !== 'production';

  const builder =
    options.builder ??
    new ExpressBuilder({
      dirs: options.dirs,
      outputDir: options.outputDir,
      watch: shouldWatch,
      workflowManifestPath: options.workflowManifestPath,
    });

  const bundles = builder.bundlePaths;
  let buildInFlight: Promise<void> | null = shouldAutoBuild
    ? builder.build()
    : null;
  let pendingRebuild = false;

  const ensureBuilt = async () => {
    if (!shouldAutoBuild) return;
    if (buildInFlight) {
      return buildInFlight;
    }

    buildInFlight = (async () => {
      try {
        await builder.build();
      } finally {
        buildInFlight = null;
        if (pendingRebuild) {
          pendingRebuild = false;
          await ensureBuilt();
        }
      }
    })();

    return buildInFlight;
  };

  if (shouldWatch) {
    for (const dir of builder.watchDirectories) {
      try {
        watch(dir, { recursive: true }, (_event, filename) => {
          if (!filename) return;
          // debounce rebuilds by queuing a single rebuild when one is already running
          if (buildInFlight) {
            pendingRebuild = true;
            return;
          }
          buildInFlight = builder.build().finally(() => {
            buildInFlight = null;
            if (pendingRebuild) {
              pendingRebuild = false;
              void ensureBuilt();
            }
          });
        });
      } catch {
        // ignore missing directories; they'll be created on first build
      }
    }
  }

  const loadFlowHandler = async () =>
    loadWebHandler<WorkflowHandler>(bundles.flow, 'POST');
  const loadStepHandler = async () =>
    loadWebHandler<WorkflowHandler>(bundles.step, 'POST');
  const loadWebhookHandlers = async () =>
    loadWebHandler<Record<string, WorkflowHandler>>(bundles.webhook);

  return async function workflowMiddleware(req, res, next) {
    try {
      const requestPath = stripTrailingSlash(
        req.path || req.originalUrl || req.url || ''
      );

      if (!requestPath.startsWith(prefix)) {
        return next();
      }

      await ensureBuilt();

      if (
        requestPath === `${prefix}/flow` &&
        req.method?.toUpperCase() === 'POST'
      ) {
        const handler = await loadFlowHandler();
        const response = await handler(await toWebRequest(req));
        await sendWebResponse(res, response);
        return;
      }

      if (
        requestPath === `${prefix}/step` &&
        req.method?.toUpperCase() === 'POST'
      ) {
        const handler = await loadStepHandler();
        const response = await handler(await toWebRequest(req));
        await sendWebResponse(res, response);
        return;
      }

      if (requestPath.startsWith(`${prefix}/webhook/`)) {
        const handlers = await loadWebhookHandlers();
        const method = req.method?.toUpperCase() ?? 'GET';
        const handler = handlers?.[method];

        if (!handler) {
          res.status(405).send('Method Not Allowed');
          return;
        }

        const response = await handler(await toWebRequest(req));
        await sendWebResponse(res, response);
        return;
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

type WorkflowHandler = (request: Request) => Promise<Response>;

function normalizePrefix(prefix: string) {
  if (prefix.endsWith('/')) return prefix.slice(0, -1);
  return prefix;
}

function stripTrailingSlash(path: string) {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

async function toWebRequest(req: ExpressRequest): Promise<Request> {
  const origin = `${req.protocol}://${req.get('host') ?? 'localhost'}`;
  const url = new URL(req.originalUrl || req.url || '/', origin).toString();
  const method = (req.method || 'GET').toUpperCase();
  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'undefined') continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
      continue;
    }
    headers.append(key, value);
  }

  const init: RequestInit & { duplex?: 'half' } = { method, headers };

  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    if (Buffer.isBuffer(req.body)) {
      init.body = req.body;
    } else if (typeof req.body === 'string') {
      init.body = req.body;
    } else if (req.body && typeof req.body === 'object') {
      init.body = JSON.stringify(req.body);
      headers.set(
        'content-type',
        headers.get('content-type') || 'application/json'
      );
    } else if (req.readable) {
      init.body = req;
      init.duplex = 'half';
    }
  }

  return new Request(url, init);
}

async function sendWebResponse(res: ExpressResponse, webResponse: Response) {
  res.status(webResponse.status);

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      const cookies = (
        webResponse.headers as Headers & { getSetCookie?: () => string[] }
      ).getSetCookie?.();
      if (cookies && cookies.length > 0) {
        for (const cookie of cookies) {
          res.append('set-cookie', cookie);
        }
        return;
      }
    }
    res.setHeader(key, value);
  });

  if (!webResponse.body) {
    res.end();
    return;
  }

  const contentType = webResponse.headers.get('content-type') || '';

  try {
    if (contentType.includes('application/json')) {
      res.json(await webResponse.json());
      return;
    }

    if (contentType.startsWith('text/')) {
      res.send(await webResponse.text());
      return;
    }
  } catch {
    // fall back to sending raw buffer
  }

  const buffer = Buffer.from(await webResponse.arrayBuffer());
  res.send(buffer);
}

async function loadWebHandler<T>(bundlePath: string, key?: string): Promise<T> {
  const url = pathToFileURL(bundlePath).href;
  const mod = await import(`${url}?update=${Date.now()}`);
  if (key && key in mod) {
    return mod[key] as T;
  }
  return (mod.default ?? mod) as T;
}

export {
  ExpressBuilder,
  DEFAULT_OUTPUT_DIR,
  DEFAULT_WORKFLOW_DIRS,
  HANDLER_FILENAMES,
} from './builder.js';
export default workflows;
