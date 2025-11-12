/**
 * Lazy loader for the WorkflowExecutorContainer implementation.
 *
 * This module keeps references to the runtime-only container class without
 * pulling in `@cloudflare/containers` at module evaluation time. Consumers
 * should call `loadWorkflowExecutorContainer()` at runtime when the container
 * environment is available (for example, inside a Cloudflare Container or Node.js
 * process).
 */

let workflowExecutorContainer: any | undefined;
let inflightLoad: Promise<any | undefined> | null = null;

/**
 * Dynamically import and return the WorkflowExecutorContainer implementation.
 * If the class has already been loaded, the cached reference is returned.
 */
export async function loadWorkflowExecutorContainer(): Promise<
  any | undefined
> {
  if (workflowExecutorContainer) return workflowExecutorContainer;

  if (inflightLoad) {
    await inflightLoad;
    return workflowExecutorContainer;
  }

  inflightLoad = (async () => {
    try {
      const mod = await import('./container.js');
      const ctor =
        (mod as any).WorkflowExecutorContainer ?? (mod as any).default;
      if (typeof ctor === 'function') {
        workflowExecutorContainer = ctor;
      } else {
        workflowExecutorContainer = undefined;
      }
      return workflowExecutorContainer;
    } finally {
      inflightLoad = null;
    }
  })();

  return inflightLoad;
}

/**
 * Returns the cached WorkflowExecutorContainer constructor (if loaded).
 */
export function getWorkflowExecutorContainer(): any | undefined {
  return workflowExecutorContainer;
}

/**
 * Indicates whether the WorkflowExecutorContainer has been successfully loaded.
 */
export function isWorkflowExecutorContainerAvailable(): boolean {
  return typeof workflowExecutorContainer === 'function';
}
