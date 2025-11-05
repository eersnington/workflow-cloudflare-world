import { Buffer } from 'node:buffer';
import { constants } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Script } from 'node:vm';
import { createRequestAdapter } from './create-request-adapter.js';
import { ensureFetchSupport } from './fetch-support.js';

const HANDLER_FILENAMES = {
  step: 'step',
  workflow: 'flow',
  webhook: 'webhook',
};

export interface StandaloneServerOptions {
  buildDir: string;
  port?: number;
  hostname?: string;
  logger?: Partial<Console>;
  manifestPath?: string;
  customHandler?: (
    req: IncomingMessage,
    res: ServerResponse,
    context: { manifest?: Record<string, unknown> }
  ) => Promise<boolean> | boolean;
}

export interface StandaloneServer {
  url: string;
  server: Server;
  manifest?: Record<string, unknown>;
  close: () => Promise<void>;
}

type HandlerModule = {
  POST?: (request: Request) => Promise<Response>;
};

export async function createStandaloneServer(
  options: StandaloneServerOptions
): Promise<StandaloneServer> {
  if (!options.buildDir) {
    throw new Error('buildDir is required to bootstrap the standalone server');
  }

  await ensureFetchSupport();

  const logger = options.logger ?? console;
  const buildDir = resolve(options.buildDir);

  const [stepHandler, workflowHandler, webhookHandler] = await Promise.all([
    loadHandler(buildDir, HANDLER_FILENAMES.step),
    loadHandler(buildDir, HANDLER_FILENAMES.workflow),
    loadHandler(buildDir, HANDLER_FILENAMES.webhook),
  ]);

  if (!stepHandler || !workflowHandler) {
    throw new Error(
      'Failed to load workflow handlers. Ensure you ran `workflow build --target standalone` first.'
    );
  }

  const manifest = await loadManifest(options.manifestPath);

  const server = createServer(async (req, res) => {
    try {
      if (options.customHandler) {
        const handled = await options.customHandler(req, res, { manifest });
        if (handled || res.writableEnded) {
          return;
        }
      }
      await handleRequest({
        req,
        res,
        stepHandler,
        workflowHandler,
        webhookHandler,
        logger,
      });
    } catch (error) {
      logger.error?.('Unhandled error in standalone server', error);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const port = options.port ?? 0;
  const hostname = options.hostname ?? '127.0.0.1';

  await new Promise<void>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(port, hostname, () => {
      server.off('error', rejectPromise);
      resolvePromise();
    });
  });

  const addressInfo = server.address();
  const url = deriveServerUrl(addressInfo, hostname);

  logger.info?.(`Workflow standalone server listening on ${url}`);

  return {
    url,
    server,
    manifest,
    close: () =>
      new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) {
            rejectPromise(error);
            return;
          }
          resolvePromise();
        });
      }),
  };
}

async function handleRequest({
  req,
  res,
  stepHandler,
  workflowHandler,
  webhookHandler,
  logger,
}: {
  req: IncomingMessage;
  res: ServerResponse;
  stepHandler: (request: Request) => Promise<Response>;
  workflowHandler: (request: Request) => Promise<Response>;
  webhookHandler?: (request: Request) => Promise<Response>;
  logger: Partial<Console>;
}) {
  if (!req.url) {
    res.statusCode = 400;
    res.end('Invalid request');
    return;
  }

  const hostHeader = req.headers.host ?? 'localhost';
  const fullUrl = `http://${hostHeader}${req.url}`;

  const adapt = createRequestAdapter({ baseUrl: `http://${hostHeader}` });
  const body =
    req.method && (req.method === 'GET' || req.method === 'HEAD')
      ? undefined
      : req;

  const request = await adapt({
    method: req.method,
    url: fullUrl,
    headers: req.headers,
    body,
  });

  const url = new URL(request.url);
  const handler = resolveHandler(url.pathname, {
    stepHandler,
    workflowHandler,
    webhookHandler,
  });

  if (!handler) {
    res.statusCode = 404;
    res.end('Not Found');
    return;
  }

  logger.debug?.(
    `Dispatching ${request.method} ${url.pathname} to workflow handler`
  );

  const response = await handler(request);

  res.statusCode = response.status;
  res.statusMessage = response.statusText || res.statusMessage;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body) {
    res.end();
    return;
  }

  const arrayBuffer = await response.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

async function loadManifest(
  manifestPath?: string
): Promise<Record<string, unknown> | undefined> {
  if (!manifestPath) {
    return undefined;
  }

  const resolvedPath = resolve(manifestPath);
  try {
    const fileUrl = pathToFileURL(resolvedPath).href;
    if (resolvedPath.endsWith('.json')) {
      const raw = await readFile(resolvedPath, 'utf8');
      return JSON.parse(raw) as Record<string, unknown>;
    }
    const mod = (await import(fileUrl)) as { default?: unknown };
    if (mod && typeof mod === 'object' && 'default' in mod) {
      return mod.default as Record<string, unknown>;
    }
    return mod as Record<string, unknown>;
  } catch (error) {
    console.warn(`Failed to load workflow manifest at ${resolvedPath}`, error);
    return undefined;
  }
}

async function loadHandler(
  buildDir: string,
  fileBaseName: string
): Promise<((request: Request) => Promise<Response>) | undefined> {
  const handlerPath = await resolveHandlerFile(buildDir, fileBaseName);

  if (!handlerPath) {
    return undefined;
  }

  const moduleUrl = pathToFileURL(handlerPath).href;
  let mod: HandlerModule | { default?: HandlerModule };

  if (handlerPath.endsWith('.mjs')) {
    mod = (await import(moduleUrl)) as HandlerModule;
  } else {
    try {
      const handlerRequire = createRequire(handlerPath);
      mod = handlerRequire(handlerPath) as
        | HandlerModule
        | {
            default?: HandlerModule;
          };
    } catch (error) {
      if (isCommonJsInEsModuleError(error)) {
        mod = await loadCommonJsFallback(handlerPath);
      } else {
        throw error;
      }
    }
  }

  const handlerModule = (
    mod && 'POST' in mod && typeof mod.POST === 'function'
      ? mod
      : mod && 'default' in mod && mod.default
        ? (mod.default as HandlerModule)
        : mod
  ) as HandlerModule;

  if (!handlerModule || typeof handlerModule.POST !== 'function') {
    throw new Error(
      `Handler file "${handlerPath}" does not export a POST function.`
    );
  }

  return handlerModule.POST.bind(handlerModule);
}

async function resolveHandlerFile(
  buildDir: string,
  fileBaseName: string
): Promise<string | undefined> {
  const candidates = ['.js', '.mjs', '.cjs'].map((ext) =>
    join(buildDir, `${fileBaseName}${ext}`)
  );

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.F_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

function deriveServerUrl(
  address: string | import('node:net').AddressInfo | null,
  fallbackHost: string
): string {
  if (!address) {
    return `http://${fallbackHost}`;
  }

  if (typeof address === 'string') {
    if (address.startsWith('http')) {
      return address;
    }
    return `http://${address}`;
  }

  const host = address.address === '::' ? '127.0.0.1' : address.address;
  return `http://${host}:${address.port}`;
}

function resolveHandler(
  pathname: string,
  handlers: {
    stepHandler: (request: Request) => Promise<Response>;
    workflowHandler: (request: Request) => Promise<Response>;
    webhookHandler?: (request: Request) => Promise<Response>;
  }
) {
  switch (pathname) {
    case '/.well-known/workflow/v1/step':
      return handlers.stepHandler;
    case '/.well-known/workflow/v1/flow':
      return handlers.workflowHandler;
    default:
      if (
        pathname.startsWith('/.well-known/workflow/v1/webhook') &&
        handlers.webhookHandler
      ) {
        return handlers.webhookHandler;
      }
      return undefined;
  }
}

function isCommonJsInEsModuleError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message || '';
  return (
    message.includes('module is not defined in ES module scope') ||
    message.includes('module is not defined')
  );
}

async function loadCommonJsFallback(
  handlerPath: string
): Promise<HandlerModule> {
  const source = await readFile(handlerPath, 'utf8');
  const wrapperSource = `(function (exports, require, module, __filename, __dirname) {${source}\n})`;

  const script = new Script(wrapperSource, {
    filename: handlerPath,
  });

  const compiledWrapper = script.runInThisContext();
  const module = { exports: {} as HandlerModule };
  const localRequire = createRequire(handlerPath);
  compiledWrapper(
    module.exports,
    localRequire,
    module,
    handlerPath,
    dirname(handlerPath)
  );

  return module.exports;
}
