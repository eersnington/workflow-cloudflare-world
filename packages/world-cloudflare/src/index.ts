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
 * @param env - Cloudflare environment bindings containing:
 *   - DB: D1 database for workflow state
 *   - WORKFLOW_QUEUE: Queue for workflow tasks
 *   - STEP_QUEUE: Queue for step tasks
 *   - STREAM_BUCKET: R2 bucket for stream storage
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

// Re-export types and utilities
export type { CloudflareEnv, CloudflareWorldConfig } from './config.js';
export { handleQueueMessage } from './queue.js';
