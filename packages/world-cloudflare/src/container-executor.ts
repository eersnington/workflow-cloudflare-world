/**
 * Entry point for the WorkflowExecutorContainer
 * This runs inside the container environment
 *
 * Notes:
 * - The concrete container implementation may be runtime-only and loaded
 *   dynamically (see `createWorkflowExecutorContainerClass()` in ./container.js).
 * - Here we attempt to obtain the concrete class; if unavailable (local dev,
 *   unsupported environment), we export a stub class that throws when used so
 *   the runtime fails with a clearer error instead of causing an unexpected
 *   module-resolution crash.
 */

import { createWorkflowExecutorContainerClass } from './container.js';

let WorkflowExecutorContainer: any | undefined;

try {
  // Try to load the concrete implementation using top-level await (will work
  // in ESM-aware runtimes). The loader itself handles dynamic imports and
  // will return undefined if the runtime package cannot be resolved.
  WorkflowExecutorContainer = await (async () => {
    try {
      const cls = await createWorkflowExecutorContainerClass();
      return cls ?? undefined;
    } catch (err) {
      // loader threw — log and return undefined so we can export a clear stub
      // Use a typed access to globalThis to avoid TS errors about `console` on globalThis
      ((globalThis as any).console ?? console)?.warn?.(
        'createWorkflowExecutorContainerClass failed:',
        err
      );
      return undefined;
    }
  })();
} catch (err) {
  // If top-level await is not usable in this environment, ensure we still set
  // a safe fallback. Consumers that need the real implementation should call
  // the loader directly via the package's `loadWorkflowExecutorContainer` helper.
  WorkflowExecutorContainer = undefined;
}

// If not available, export a stub class that throws on instantiation so the
// failure is explicit when someone attempts to use the container in an
// unsupported environment (such as local Node without Cloudflare runtime).
if (!WorkflowExecutorContainer) {
  class WorkflowExecutorContainerUnavailable {
    constructor() {
      throw new Error(
        'WorkflowExecutorContainer is not available in this environment. ' +
          'This usually means the Cloudflare container runtime is unavailable locally. ' +
          'Call `await import(\"workflow-cloudflare-world\").loadWorkflowExecutorContainer()` ' +
          'or run in a Cloudflare-compatible environment.'
      );
    }
  }
  WorkflowExecutorContainer = WorkflowExecutorContainerUnavailable;
}

// Export the container class for the Durable Object system
export { WorkflowExecutorContainer };

// Container-specific initialization if needed
console.log('Workflow Executor Container initialized');
