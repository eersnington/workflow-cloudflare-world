// Worker-safe bindings package entrypoint
// Exports:
//  - ContainerClient: a Worker-safe client for invoking the runtime executor (DO / service binding / URL)
//  - defaultContainerClient: a shared client instance
//  - setupGlobalContainerClient(env): helper to set globalThis.__wf__container_client and optionally __wf__env

import { ContainerClient, defaultContainerClient } from './container-client.js';

/**
 * Helper to set up a global container client reference that the injected runtime
 * handlers (from the transformer) will look for.
 *
 * Usage:
 *   import { setupGlobalContainerClient } from 'workflow-cloudflare-bindings';
 *   setupGlobalContainerClient(env);
 *
 * This function will only set the global if it is not already defined, allowing
 * users to override in their own worker entry.
 */
export function setupGlobalContainerClient(env?: Record<string, any>) {
  if (typeof (globalThis as any).__wf__container_client === 'undefined') {
    (globalThis as any).__wf__container_client = defaultContainerClient;
  }
  if (env) {
    // store a reference to env for shims that may want to use it
    (globalThis as any).__wf__env = env;
  }
}

export { ContainerClient, defaultContainerClient };
