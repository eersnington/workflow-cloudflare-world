import type { Storage, World } from '@workflow/world';
import type { CloudflareEnv } from './config.js';
import { defaultContainerClient } from './container-client.js';
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
// should dynamically import it via the helper provided below, or import the
// dedicated subpath `workflow-cloudflare-world/container` after the package
// is built (see package.json `exports`).
export async function loadWorkflowExecutorContainer() {
  const mod = await import('./container.js');
  return mod.WorkflowExecutorContainer;
}

export { ContainerClient, defaultContainerClient } from './container-client.js';
export { handleQueueMessage } from './queue.js';
export { StreamCoordinator } from './stream-coordinator.js';
// Cloudflare-specific tooling exports
export { cloudflareWorkflowTransformer } from './vite-plugin.js';

// Expose a global factory so injected handlers can obtain a Cloudflare World instance.
// Integrations may optionally override this global before handlers run.
if (typeof (globalThis as any).__wf__create_world === 'undefined') {
  (globalThis as any).__wf__create_world = function (env: CloudflareEnv) {
    return createWorld(env);
  };
}

// Provide a default container client on the global if not already provided by runtime.
// This allows the injected POST handler to call `globalThis.__wf__container_client.execute(...)`.
if (typeof (globalThis as any).__wf__container_client === 'undefined') {
  (globalThis as any).__wf__container_client = defaultContainerClient;
}
