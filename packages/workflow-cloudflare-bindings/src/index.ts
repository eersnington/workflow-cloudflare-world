// @ts-nocheck
// Worker-safe bindings package entrypoint
// Exports:
//  - ContainerClient: a Worker-safe client for invoking the runtime executor (DO / service binding / URL)
//  - defaultContainerClient: a shared client instance
//  - setupGlobalContainerClient(env): helper to set globalThis.__wf__container_client and optionally __wf__env
//  - loadCloudflareWorkflowTransformer(): runtime helper to lazily load the transform plugin from the workspace package
//
// NOTE:
// - The ContainerClient implementation below is intentionally self-contained and does not import any
//   runtime-only types or packages. It expects an `env` shape like Cloudflare worker env but typed as
//   a generic Record<string, any> to avoid pulling Node-only types into Worker bundles.
//
// - The Vite plugin (cloudflareWorkflowTransformer) should ideally be copied into this package so apps
//   can import it statically. For now we provide a lazy loader `loadCloudflareWorkflowTransformer()`
//   that will attempt to import the plugin from the `workflow-cloudflare-world` package at runtime.
//   Consumers that need a static plugin import should move the plugin source into this package.

export type ExecResponse = {
  success: boolean;
  result?: any;
  error?: string;
  retryAfterSeconds?: number;
};

export class ContainerClient {
  private executorUrl?: string;

  constructor(opts?: { executorUrl?: string }) {
    this.executorUrl = opts?.executorUrl;
  }

  /**
   * Execute a workflow in the container.
   *
   * @param payload - The execution payload (workflowCode, workflowRun, inputs, events, context)
   * @param env - Optional runtime env (Cloudflare Worker env or similar). Treated as a plain object.
   *
   * @returns parsed JSON body from the container. On 503 the container may return { retryAfterSeconds }.
   */
  async execute(payload: unknown, env?: Record<string, any>): Promise<any> {
    // 1) Try Durable Object namespace / service binding if present
    if (env && (env as any).WORKFLOW_EXECUTOR) {
      const executor = (env as any).WORKFLOW_EXECUTOR;

      try {
        // Durable Object namespace idiom: idFromName + get(id) -> stub.fetch
        if (
          typeof executor.idFromName === 'function' &&
          typeof executor.get === 'function'
        ) {
          const name = String(
            (payload as any)?.workflowRun?.runId ?? 'default'
          );
          try {
            const id = executor.idFromName(name);
            const stub = executor.get(id);
            const resp = await stub.fetch('/execute', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            return await parseContainerResponse(resp);
          } catch (err) {
            // Fall through to next executor option
            // Keep logging minimal but useful
            // eslint-disable-next-line no-console
            console.error(
              'ContainerClient: durable object stub fetch failed',
              err
            );
          }
        }

        // Service-binding style: executor.fetch exists (a Fetcher)
        if (typeof executor.fetch === 'function') {
          try {
            const resp = await executor.fetch('/execute', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            });
            return await parseContainerResponse(resp);
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error('ContainerClient: service binding fetch failed', err);
          }
        }
      } catch (err) {
        // Defensive logging; continue to URL fallback below
        // eslint-disable-next-line no-console
        console.error(
          'ContainerClient: error while using WORKFLOW_EXECUTOR binding',
          err
        );
      }
    }

    // 2) Fallback to executor URL (from constructor opts / env / process.env)
    const url =
      this.executorUrl ||
      (env && (env as any).WORKFLOW_EXECUTOR_URL) ||
      (typeof process !== 'undefined' &&
        (process.env as Record<string, string | undefined>)
          ?.WORKFLOW_EXECUTOR_URL) ||
      'http://workflow-container:8080/execute';

    const resp = await fetch(String(url), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return await parseContainerResponse(resp);
  }
}

/**
 * Parse the container HTTP response into a JS value or throw an informative error.
 * Handles 503 retry shape and returns the parsed JSON for success responses.
 */
async function parseContainerResponse(resp: Response): Promise<any> {
  const text = await resp.text().catch(() => null);
  const parsed = tryParseJson(text);

  if (resp.status === 503) {
    // Allow caller to handle retry semantics; return whatever the container returned.
    if (parsed && typeof parsed === 'object') return parsed;
    return { success: false, retryAfterSeconds: undefined, raw: text };
  }

  if (!resp.ok) {
    const body = parsed ?? text ?? `HTTP ${resp.status}`;
    throw new Error(`Container execute failed: ${resp.status} ${String(body)}`);
  }

  // 200-range responses
  return parsed ?? text;
}

function tryParseJson(text: string | null): any | null {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Default shared client instance
 */
export const defaultContainerClient = new ContainerClient();

export default defaultContainerClient;

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

/**
 * Lazy loader for the Vite plugin exported by the workspace `workflow-cloudflare-world` package.
 *
 * NOTE:
 * - Prefer moving the plugin source into this package for a static import if you need to include
 *   the plugin in a Vite config at build time. The loader below is provided as a safe runtime helper
 *   that attempts to locate the existing plugin without causing build-time resolution of runtime-only
 *   modules.
 *
 * - Vite expects plugins to be provided synchronously at build-time. If you intend to use the plugin
 *   in `vite.config.ts` statically, copy `vite-plugin.ts` into this package and export it directly.
 */
export async function loadCloudflareWorkflowTransformer(): Promise<any | null> {
  try {
    // Try package root first (this should be safe if the package root re-exports the plugin)
    // Dynamic import is used so build-time consumers do not statically resolve runtime-only packages.
    const pkg: any = await import('workflow-cloudflare-world').catch(
      () => null
    );
    if (pkg && typeof pkg.cloudflareWorkflowTransformer === 'function') {
      return pkg.cloudflareWorkflowTransformer;
    }

    // Try subpath fallback (the plugin file). This is also dynamic to avoid build-time resolution.
    const mod: any = await import(
      'workflow-cloudflare-world/src/vite-plugin'
    ).catch(() => null);
    if (mod) {
      return mod.cloudflareWorkflowTransformer ?? mod.default ?? null;
    }

    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      'loadCloudflareWorkflowTransformer: failed to load plugin dynamically',
      err
    );
    return null;
  }
}

/**
 * Synchronous accessor intended for environments where the plugin has been statically
 * imported into the build. Returns `undefined` if not present.
 *
 * NOTE: Vite plugins are normally provided in `vite.config.ts` at build-time. The recommended
 * pattern is to statically export the plugin from this package (move the plugin source here)
 * so you can `import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-bindings'`
 * directly. This function exists as a best-effort helper and will return `undefined` in most build-time
 * contexts unless you explicitly attach the plugin to the global (not recommended).
 */
export function getCloudflareWorkflowTransformerIfLoaded(): any | undefined {
  const g = globalThis as any;
  return g.__wf__cloudflare_workflow_transformer ?? undefined;
}
