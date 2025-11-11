import type { Storage, World } from '@workflow/world';
import type { CloudflareEnv } from './config.js';

import { createClient, type Drizzle } from './drizzle/index.js';
import { createQueue } from './queue.js';
import {
  createEventsStorage,
  createHooksStorage,
  createRunsStorage,
  createStepsStorage,
} from './storage.js';
import { createStreamer } from './streamer.js';

function createStorage(drizzle: Drizzle): Storage {
  return {
    runs: createRunsStorage(drizzle),
    events: createEventsStorage(drizzle),
    hooks: createHooksStorage(drizzle),
    steps: createStepsStorage(drizzle),
  };
}

/**
 * Create a World instance backed by Cloudflare services
 *
 * This function intentionally mirrors the `World` interface defined in
 * `@workflow/world`, returning a single object that spreads queue, storage,
 * and streamer capabilities. Framework integrations rely on this contract
 * remaining stable across World implementations.
 * @param env - Cloudflare environment bindings containing:
 *   - DB: D1 database for workflow state
 *   - WORKFLOW_QUEUE: Queue for workflow tasks
 *   - STEP_QUEUE: Queue for step tasks
 *   - STREAM_BUCKET: R2 bucket for stream storage
 *   - WORKFLOW_EXECUTOR: Container namespace for workflow execution
 *
 * @returns World instance with storage, queue, and streaming capabilities
 *
 * @example
 * ```ts
 * export default {
 *   async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
 *     const world = createWorld(env);
 *     // Use world to create/manage workflow runs
 *     return new Response('OK');
 *   }
 * }
 * ```
 */
export function createWorld(env: CloudflareEnv): World {
  const drizzle = createClient(env.DB);
  const storage = createStorage(drizzle);
  const queue = createQueue(env);
  const streamer = createStreamer(env);

  return {
    ...storage,
    ...streamer,
    ...queue,
  };
}

export type { MessageBatch } from '@cloudflare/workers-types';
// Re-export types and utilities
export type { CloudflareEnv, CloudflareWorldConfig } from './config.js';
export type {
  WorkflowExecutionContext,
  WorkflowExecutionRequest,
  WorkflowExecutionResponse,
} from './container.js';

// NOTE:
// `WorkflowExecutorContainer` is server-only and depends on the
// `@cloudflare/containers` package. Importing it at module-evaluation time
// causes build-time consumers (like Vite configs) to attempt to resolve
// server-only dependencies and can break builds. To keep the package root
// safe for build-time imports, we do NOT export the container class directly.
//
// Consumers that actually need the container class (server/runtime code)
// should use the runtime-safe proxy loader exported from the package root.
// Re-export the proxy's loader/accessors so consumers importing from the
// package root (or subpath) get the runtime-safe dynamic loader rather than
// a module that may import `@cloudflare/containers` at evaluation time.
export {
  loadWorkflowExecutorContainer,
  getWorkflowExecutorContainer,
  isWorkflowExecutorContainerAvailable,
  WorkflowExecutorContainer,
  WorkflowExecutorContainer as ProxyWorkflowExecutorContainer,
  loadWorkflowExecutorContainer as loadWorkflowExecutorContainerProxy,
} from './container-proxy.js';

// Additionally expose the runtime-safe container-proxy helpers from the package root.
// The proxy module intentionally avoids importing Cloudflare runtime-only packages
// at module evaluation time; it provides a lazy loader and a live binding that
// consumers can use when running inside a Cloudflare-compatible runtime.
// container-proxy exports consolidated above; this placeholder removes the duplicate export block.

export { handleQueueMessage } from './queue.js';
export { StreamCoordinator } from './stream-coordinator.js';
