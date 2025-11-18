import Module from 'node:module';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { WorkflowFastifyOptions, WebhookHandlers } from './types.js';
import { DEFAULT_OUTPUT_DIR, HANDLER_FILENAMES } from './constants.js';

/**
 * Fastify-native handler for flow requests
 * Implements Nitro-inspired direct Web API integration
 */
export async function handleFlowRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: WorkflowFastifyOptions = {}
): Promise<void> {
  try {
    const handler = await loadHandler(HANDLER_FILENAMES.flow, 'POST', options);
    const webRequest = await createFastifyWebRequest(request);
    const webResponse = await handler(webRequest);
    await sendWebResponseToFastifyReply(webResponse, reply);
  } catch (error) {
    await handleWorkflowError(error, request, reply, 'flow');
  }
}

/**
 * Fastify-native handler for step requests
 */
export async function handleStepRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: WorkflowFastifyOptions = {}
): Promise<void> {
  try {
    const handler = await loadHandler(HANDLER_FILENAMES.step, 'POST', options);
    const webRequest = await createFastifyWebRequest(request);
    const webResponse = await handler(webRequest);
    await sendWebResponseToFastifyReply(webResponse, reply);
  } catch (error) {
    await handleWorkflowError(error, request, reply, 'step');
  }
}

/**
 * Fastify-native handler for webhook requests
 */
export async function handleWebhookRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  options: WorkflowFastifyOptions = {}
): Promise<void> {
  try {
    const handlers = await loadHandler(
      HANDLER_FILENAMES.webhook,
      null,
      options
    );
    const method = request.method?.toUpperCase();
    const handler = (handlers as WebhookHandlers)[method];

    if (!handler || typeof handler !== 'function') {
      reply.status(405).send({ error: 'Method Not Allowed' });
      return;
    }

    const webRequest = await createFastifyWebRequest(request);
    const webResponse = await handler(webRequest);
    await sendWebResponseToFastifyReply(webResponse, reply);
  } catch (error) {
    await handleWorkflowError(error, request, reply, 'webhook');
  }
}

/**
 * Creates a Web API Request from Fastify request with native integration
 * Inspired by Nitro's minimal conversion approach
 */
async function createFastifyWebRequest(
  request: FastifyRequest
): Promise<Request> {
  // Fastify provides protocol and host information directly
  const protocol = request.protocol;
  const host = request.headers.host || 'localhost';
  const url = `${protocol}://${host}${request.url}`;

  const method = request.method?.toUpperCase() ?? 'GET';
  const headers = new Headers();

  // Fastify headers are already normalized
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === 'undefined' || key === 'host') continue; // Skip host as it's in URL

    if (Array.isArray(value)) {
      for (const entry of value) {
        headers.append(key, entry);
      }
    } else if (typeof value === 'string') {
      headers.append(key, value);
    }
  }

  const init: RequestInit = {
    method,
    headers,
  };

  // Fastify's body handling is more sophisticated than Express
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && request.body) {
    // Handle different body types Fastify supports
    if (typeof request.body === 'string') {
      init.body = request.body;
    } else if (Buffer.isBuffer(request.body)) {
      init.body = request.body;
    } else if (request.body && typeof request.body === 'object') {
      // Fastify has already parsed JSON, we need to stringify it
      init.body = JSON.stringify(request.body);
      headers.set('content-type', 'application/json');
    } else if (request.raw?.readable) {
      // Stream the raw request body
      init.body = request.raw as any;
      (init as any).duplex = 'half';
    }
  }

  return new Request(url, init);
}

/**
 * Sends a Web API Response through Fastify Reply
 * Optimized for Fastify's response handling
 */
async function sendWebResponseToFastifyReply(
  webResponse: Response,
  reply: FastifyReply
): Promise<void> {
  // Set status code
  reply.status(webResponse.status);

  // Copy headers from Web API to Fastify
  webResponse.headers.forEach((value: string, key: string) => {
    const lowerKey = key.toLowerCase();

    // Handle cookies specially using Fastify's cookie API
    if (lowerKey === 'set-cookie') {
      // Fastify handles multiple Set-Cookie headers differently
      const cookies = webResponse.headers.getSetCookie?.();
      if (cookies && cookies.length > 0) {
        // Each cookie should be set separately in Fastify
        cookies.forEach((cookie) => {
          reply.header('set-cookie', cookie);
        });
      }
      return;
    }

    reply.header(key, value);
  });

  // Handle response body efficiently
  if (!webResponse.body) {
    reply.send();
    return;
  }

  try {
    // Handle different response body types
    const contentType = webResponse.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // Parse JSON and let Fastify handle serialization
      const jsonData = await webResponse.json();
      reply.send(jsonData);
    } else if (contentType.includes('text/')) {
      // Handle text responses
      const textData = await webResponse.text();
      reply.send(textData);
    } else {
      // Handle binary data or streams
      const buffer = Buffer.from(await webResponse.arrayBuffer());
      reply.send(buffer);
    }
  } catch (error) {
    // Fallback for complex responses
    const buffer = Buffer.from(await webResponse.arrayBuffer());
    reply.send(buffer);
  }
}

/**
 * Centralized error handling for workflow requests
 * Following Fastify's error handling patterns
 */
async function handleWorkflowError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  handlerType: 'flow' | 'step' | 'webhook'
): Promise<void> {
  // Log error with Fastify's logger
  request.log.error(
    {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      handlerType,
      url: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    },
    'Workflow handler error'
  );

  // Send appropriate error response
  if (error instanceof Error) {
    // Check for specific workflow errors
    if (error.message.includes('Workflow bundles missing')) {
      reply.status(500).send({
        error: 'Workflow configuration error',
        message: 'Please run "workflow build" before starting your server',
        hint: 'See https://useworkflow.dev/docs/how-it-works/framework-integrations',
      });
      return;
    }

    if (error.message.includes('not found')) {
      reply.status(404).send({
        error: 'Workflow not found',
        message: error.message,
      });
      return;
    }
  }

  // Generic error response
  reply.status(500).send({
    error: 'Internal Workflow Error',
    handlerType,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Handler cache with performance optimizations
 * Inspired by Nitro's handler caching approach
 */
const handlerCache = new Map<string, any>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Load workflow handler with caching and error handling
 */
async function loadHandler(
  filename: string,
  exportName: string | null,
  options: WorkflowFastifyOptions
): Promise<any> {
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const resolvedPath = join(process.cwd(), outputDir, filename);

  // Check cache first
  if (handlerCache.has(resolvedPath)) {
    const cachedTime = cacheTimestamps.get(resolvedPath) || 0;
    const now = Date.now();

    // Return cached handler if still valid
    if (now - cachedTime < CACHE_TTL) {
      const cached = handlerCache.get(resolvedPath);
      return exportName ? cached?.[exportName] : cached;
    } else {
      // Clear expired cache
      handlerCache.delete(resolvedPath);
      cacheTimestamps.delete(resolvedPath);
    }
  }

  try {
    const module = await loadModule(resolvedPath);

    // Cache the loaded module
    handlerCache.set(resolvedPath, module);
    cacheTimestamps.set(resolvedPath, Date.now());

    if (!exportName) {
      return module;
    }

    const exported = module?.[exportName];
    if (typeof exported !== 'function') {
      throw new Error(
        `Workflow handler ${filename} is missing export "${exportName}". ` +
          'Please run "workflow build" to regenerate handlers.'
      );
    }

    return exported;
  } catch (error) {
    // Clear cache on load failure
    handlerCache.delete(resolvedPath);
    cacheTimestamps.delete(resolvedPath);
    throw error;
  }
}

/**
 * Load module with dual format support (ESM and CommonJS)
 * Enhanced for Fastify's module resolution
 */
async function loadModule(resolvedPath: string): Promise<any> {
  try {
    // Try ESM import first (preferred for Fastify)
    if (resolvedPath.endsWith('.mjs') || resolvedPath.endsWith('.js')) {
      const moduleUrl = pathToFileURL(resolvedPath).href;
      return await import(moduleUrl);
    }

    // Fallback to CommonJS for older files
    const source = await readFile(resolvedPath, 'utf8');
    const NativeModule = (Module as unknown as { Module: any }).Module;
    const mod = new NativeModule(resolvedPath);
    mod.filename = resolvedPath;
    mod.paths = NativeModule._nodeModulePaths?.(dirname(resolvedPath)) ?? [];
    mod._compile(source, resolvedPath);
    return mod.exports;
  } catch (error) {
    throw new Error(
      `Failed to load workflow handler from ${resolvedPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Clear handler cache (useful for HMR)
 */
export function clearHandlerCache(): void {
  handlerCache.clear();
  cacheTimestamps.clear();
}
