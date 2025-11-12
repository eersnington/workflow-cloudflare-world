import type { Storage, World } from '@workflow/world';
import type { CloudflareEnv } from './config.js';

import { createClient, type Drizzle } from './drizzle/index.js';
import { createQueue, handleQueueMessage } from './queue.js';
import {
  createEventsStorage,
  createHooksStorage,
  createRunsStorage,
  createStepsStorage,
} from './storage.js';
import { createStreamer } from './streamer.js';
import { StreamCoordinator } from './stream-coordinator.js';
import {
  getWorkflowExecutorContainer,
  isWorkflowExecutorContainerAvailable,
  loadWorkflowExecutorContainer,
} from './container-proxy.js';

/**
 * Construct a Cloudflare-backed World implementation.
 * The returned object satisfies the `World` interface from `@workflow/world`.
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

function createStorage(drizzle: Drizzle): Storage {
  return {
    runs: createRunsStorage(drizzle),
    events: createEventsStorage(drizzle),
    hooks: createHooksStorage(drizzle),
    steps: createStepsStorage(drizzle),
  };
}

// Runtime exports
export { StreamCoordinator, handleQueueMessage };
export {
  loadWorkflowExecutorContainer,
  getWorkflowExecutorContainer,
  isWorkflowExecutorContainerAvailable,
};

// Types
export type { CloudflareEnv, CloudflareWorldConfig } from './config.js';
export type { MessageBatch } from '@cloudflare/workers-types';
export type {
  WorkflowExecutionContext,
  WorkflowExecutionRequest,
  WorkflowExecutionResponse,
} from './container.js';
