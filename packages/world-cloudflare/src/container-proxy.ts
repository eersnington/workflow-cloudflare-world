/**
 * Runtime proxy / loader for the WorkflowExecutorContainer implementation.
 *
 * Purpose:
 * - Avoid importing `@cloudflare/containers` (a runtime-only package) at module
 *   evaluation time so consumers can safely import the package root during
 *   SSR/build-time without triggering resolution of Cloudflare runtime-only
 *   modules.
 * - Provide a lazy loader that attempts to dynamically import the real
 *   implementation from `./container.js` at runtime and expose a live binding
 *   (`WorkflowExecutorContainer`) and a helper `loadWorkflowExecutorContainer`.
 *
 * Notes:
 * - This module purposely does not `import` the container implementation at the
 *   top-level. All loading is done via dynamic `import()` so the real module is
 *   only fetched at runtime (when runtime environment supports it).
 * - Consumers can check `getWorkflowExecutorContainer()` synchronously to see
 *   if the container has already been loaded, or call
 *   `await loadWorkflowExecutorContainer()` to ensure it is loaded.
 */

/**
 * Live binding exported for compatibility with modules that expect a named
 * export `WorkflowExecutorContainer`. Initially `undefined` and populated
 * asynchronously if/when the runtime can load the real implementation.
 */
export let WorkflowExecutorContainer: any | undefined = undefined;

/**
 * Cached promise for an in-flight load to avoid duplicate dynamic imports.
 * If a load is already in progress subsequent callers will await the same
 * promise.
 */
let _loadPromise: Promise<any> | null = null;

/**
 * Attempt to dynamically import and return the real container class.
 * If the container has already been loaded this returns it immediately.
 *
 * Usage:
 *   const Container = await loadWorkflowExecutorContainer();
 *   if (Container) { const inst = new Container(); ... }
 *
 * This function throws if the dynamic import fails.
 */
export async function loadWorkflowExecutorContainer(): Promise<any> {
  // If already set, return immediately.
  if (WorkflowExecutorContainer) return WorkflowExecutorContainer;

  // If a load is already in-flight, return the same promise.
  if (_loadPromise) {
    await _loadPromise;
    return WorkflowExecutorContainer;
  }

  // Start dynamic import and cache the promise.
  _loadPromise = (async () => {
    try {
      // Relative import so bundlers see it as a runtime-only dynamic import.
      // Do NOT use top-level imports here.
      const mod = (await import('./container.js')) as any;
      const cls = mod && (mod.WorkflowExecutorContainer ?? mod.default ?? null);
      if (cls) {
        WorkflowExecutorContainer = cls;
      }
      return WorkflowExecutorContainer;
    } finally {
      // Clear the inflight promise once complete so subsequent attempts can retry.
      _loadPromise = null;
    }
  })();

  await _loadPromise;
  return WorkflowExecutorContainer;
}

/**
 * Synchronous accessor to the already-loaded container class.
 * Returns `undefined` if the implementation has not been loaded yet.
 */
export function getWorkflowExecutorContainer(): any | undefined {
  return WorkflowExecutorContainer;
}

/**
 * Convenience boolean check: has the container implementation been successfully
 * loaded and appears usable?
 */
export function isWorkflowExecutorContainerAvailable(): boolean {
  return (
    typeof WorkflowExecutorContainer === 'function' ||
    typeof WorkflowExecutorContainer === 'object'
  );
}

// NOTE: deliberately removed background eager-load at module evaluation time.
// Consumers should call `loadWorkflowExecutorContainer()` when they want to
// attempt a runtime dynamic import. Removing the background dynamic import
// ensures this module never triggers runtime-only resolution during SSR/build.
