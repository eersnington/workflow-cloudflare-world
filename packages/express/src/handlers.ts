import Module from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import type { WorkflowOptions } from './types.js';
import { DEFAULT_OUTPUT_DIR, HANDLER_FILENAMES } from './constants.js';

/**
 * Express-compatible handler for flow requests
 */
export async function handleFlow(
  req: any,
  res: any,
  options: WorkflowOptions = {}
): Promise<void> {
  try {
    const handler = await loadHandler(HANDLER_FILENAMES.flow, 'POST', options);
    const request = createWebRequest(req);
    const response = await handler(request);
    await sendWebResponse(res, response);
  } catch (error) {
    console.error('[workflow-express] Flow handler error:', error);
    res.status(500).send('Internal Server Error');
  }
}

/**
 * Express-compatible handler for step requests
 */
export async function handleStep(
  req: any,
  res: any,
  options: WorkflowOptions = {}
): Promise<void> {
  try {
    const handler = await loadHandler(HANDLER_FILENAMES.step, 'POST', options);
    const request = createWebRequest(req);
    const response = await handler(request);
    await sendWebResponse(res, response);
  } catch (error) {
    console.error('[workflow-express] Step handler error:', error);
    res.status(500).send('Internal Server Error');
  }
}

/**
 * Express-compatible handler for webhook requests
 */
export async function handleWebhook(
  req: any,
  res: any,
  options: WorkflowOptions = {}
): Promise<void> {
  try {
    const handlers = await loadHandler(
      HANDLER_FILENAMES.webhook,
      null,
      options
    );
    const method = req.method?.toUpperCase();
    const handler = handlers[method];

    if (!handler || typeof handler !== 'function') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const request = createWebRequest(req);
    const response = await handler(request);
    await sendWebResponse(res, response);
  } catch (error) {
    console.error('[workflow-express] Webhook handler error:', error);
    res.status(500).send('Internal Server Error');
  }
}

/**
 * Creates a Web API Request from Express request
 */
function createWebRequest(req: any): Request {
  const protocol = req.protocol || (req.secure ? 'https' : 'http');
  const host = req.get('host') ?? 'localhost';
  const url = `${protocol}://${host}${req.originalUrl ?? req.url ?? ''}`;
  const method = req.method?.toUpperCase() ?? 'GET';
  const headers = new Headers();

  // Copy headers from Express to Web API
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'undefined') continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else {
      headers.append(key, value as string);
    }
  }

  const init: RequestInit = {
    method,
    headers,
  };

  // Add body for methods that support it
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && req.readable) {
    init.body = req as any;
    (init as any).duplex = 'half';
  }

  return new Request(url, init);
}

/**
 * Sends a Web API Response through Express
 */
async function sendWebResponse(res: any, response: Response): Promise<void> {
  res.status(response.status);

  // Copy headers from Web API to Express
  response.headers.forEach((value: string, key: string) => {
    if (key.toLowerCase() === 'set-cookie') {
      // Handle cookies separately
      return;
    }
    res.setHeader(key, value);
  });

  // Handle cookies specially
  const headersWithCookies = response.headers as any;
  const cookies = headersWithCookies.getSetCookie?.();
  if (cookies && cookies.length > 0) {
    res.setHeader('set-cookie', cookies);
  }

  // Send body
  if (!response.body) {
    res.end();
    return;
  }

  // Convert Web API stream to Node.js stream
  const buffer = Buffer.from(await response.arrayBuffer());
  res.end(buffer);
}

const handlerCache = new Map<string, any>();

async function loadHandler(
  filename: string,
  exportName: string | null,
  options: WorkflowOptions
): Promise<any> {
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const resolvedPath = join(process.cwd(), outputDir, filename);

  if (!handlerCache.has(resolvedPath)) {
    const module = await loadModule(resolvedPath);
    handlerCache.set(resolvedPath, module);
  }

  const cached = handlerCache.get(resolvedPath);
  if (!exportName) {
    return cached;
  }

  const exported = cached?.[exportName];
  if (typeof exported !== 'function') {
    throw new Error(
      `Workflow handler ${filename} is missing export "${exportName}". ` +
        'Please run "workflow build" to regenerate handlers.'
    );
  }
  return exported;
}

async function loadModule(resolvedPath: string): Promise<any> {
  if (resolvedPath.endsWith('.mjs')) {
    return import(pathToFileURL(resolvedPath).href);
  }

  const source = await readFile(resolvedPath, 'utf8');
  const NativeModule = (Module as unknown as { Module: any }).Module;
  const mod = new NativeModule(resolvedPath);
  mod.filename = resolvedPath;
  mod.paths = NativeModule._nodeModulePaths?.(dirname(resolvedPath)) ?? [];
  mod._compile(source, resolvedPath);
  return mod.exports;
}
