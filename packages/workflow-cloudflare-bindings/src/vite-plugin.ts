// @ts-nocheck
/* eslint-disable @typescript-eslint/no-var-requires */
/* Purpose: this file is a Vite plugin shipped as plain JS-compatible code.
   We disable TS checking here and declare `require` so the file can be used in
   mixed environments (Node builds and Worker-safe bundling) without TypeScript
   compilation errors. */
declare function require(name: string): any;

type Plugin = any;
let MagicString: any;
try {
  // Load magic-string at runtime to avoid a hard dependency during build/test runs.
  // Prefer the default export when present.
  const _ms = require('magic-string');
  // Use optional chaining to prefer the default export if present.
  MagicString = _ms?.default ?? _ms;
} catch {
  // Minimal fallback shim used only when magic-string cannot be resolved.
  // This provides the small subset of behavior used by the transformer.
  MagicString = class {
    private _code: string;
    constructor(code: string) {
      this._code = code;
    }
    overwrite(start: number, end: number, content: string) {
      this._code = this._code.slice(0, start) + content + this._code.slice(end);
    }
    append(content: string) {
      this._code = this._code + content;
    }
    toString() {
      return this._code;
    }
    generateMap(_opts?: { hires?: boolean }) {
      return null;
    }
  };
}

/**
 * cloudflareWorkflowTransformer
 *
 * A conservative post-transform Vite plugin that rewrites the generated
 * workflow "flow" bundle so the Worker route delegates workflow execution to
 * the workflow executor container (Durable Object or HTTP service).
 *
 * Detection heuristics:
 * - File contains `import { workflowEntrypoint } from 'workflow/runtime'`
 * - File contains `const workflowCode = \`...`\``
 * - File contains `export const POST = workflowEntrypoint(workflowCode);`
 *
 * Replacement:
 * - Replaces the `export const POST = ...` statement with an async `POST` handler
 *   that:
 *     - parses the Cloudflare queue envelope headers/body,
 *     - optionally fetches workflowRun & events using a runtime-provided world
 *       factory (globalThis.__wf__create_world),
 *     - builds a payload and forwards it to `globalThis.__wf__container_client.execute`
 *       if present, or to env.WORKFLOW_EXECUTOR (Durable Object/service binding)
 *       or env.WORKFLOW_EXECUTOR_URL.
 *
 * The plugin avoids complex AST transforms because the builder emits a stable,
 * well-known bundle shape. The injected handler is intentionally defensive and
 * minimal.
 */
export function cloudflareWorkflowTransformer(): Plugin {
  return {
    name: 'workflow:cloudflare-transformer',
    enforce: 'pre',

    // Resolve id hook: treat cloudflare: scheme, @cloudflare/containers and the
    // workflow-cloudflare-world/container subpath as external to prevent the
    // bundler from attempting to resolve them during SSR/build-time. Returning
    // an object with external:true ensures Rollup/Vite does not try to load the
    // module (and thus avoids encountering the unsupported cloudflare: scheme).
    resolveId(source: string) {
      try {
        if (typeof source === 'string') {
          // Explicitly externalize the exact cloudflare:workers specifier
          // to ensure Rollup/Vite never attempts to resolve it during build.
          if (source === 'cloudflare:workers') {
            return { id: source, external: true } as any;
          }
          // Any cloudflare: scheme import should be external
          if (source.startsWith('cloudflare:')) {
            return { id: source, external: true } as any;
          }
          // Mark the runtime-only containers package and its subpaths external
          if (
            source === '@cloudflare/containers' ||
            source.startsWith('@cloudflare/containers/')
          ) {
            return { id: source, external: true } as any;
          }
          // Also mark the workflow package container subpath external
          if (
            source === 'workflow-cloudflare-world/container' ||
            source.startsWith('workflow-cloudflare-world/container')
          ) {
            return { id: source, external: true } as any;
          }

          // Provide a virtual module for runtime imports so app code that imports
          // `workflow/runtime` or `@workflow/core/runtime` receives a safe shim
          // that forwards to the remote executor rather than invoking core VM/serialize.
          if (
            source === 'workflow/runtime' ||
            source === 'workflow' ||
            source === '@workflow/core/runtime' ||
            source === 'workflow/runtime/index' ||
            source === '@workflow/core/runtime/index'
          ) {
            return {
              id: 'virtual:workflow-remote-shim',
              external: false,
            } as any;
          }
        }
      } catch {
        // ignore and continue resolution
      }
      return null;
    },

    // Virtual module loader: provides a runtime-shim module source for 'virtual:workflow-remote-shim'.
    // The module exports the public runtime API surface but implements dangerous functions
    // (start, workflowEntrypoint, stepEntrypoint) as forwards to the worker-safe container client.
    async load(id: string) {
      if (id !== 'virtual:workflow-remote-shim') return null;

      // The virtual module source below intentionally uses the global container client
      // if present (globalThis.__wf__container_client). If not present at runtime it will
      // dynamically import the bindings package to obtain the default client. This keeps
      // the build-time bundle free of runtime-only dependencies.
      return `
/* virtual module: workflow-remote-shim */
/* This module is injected by the cloudflare-workflow-transformer plugin and provides
   Worker-safe forwarders for runtime APIs that would otherwise call @workflow/core
   serialization/VM paths. */

async function _getClient() {
  if (typeof (globalThis).__wf__container_client !== 'undefined' && typeof (globalThis).__wf__container_client.execute === 'function') {
    return (globalThis).__wf__container_client;
  }
  try {
    // Attempt to dynamically import the bindings package to get the shared client.
    // The package name should resolve in consumer apps that install the bindings.
    const pkg = await import('workflow-cloudflare-bindings').catch(() => null);
    if (pkg) {
      // prefer named export defaultContainerClient, else default export
      return pkg.defaultContainerClient ?? pkg.default ?? (pkg as any).defaultContainerClient;
    }
  } catch (err) {
    // swallow - we'll throw below if no client
  }
  throw new Error('No workflow container client available (install workflow-cloudflare-bindings and call setupGlobalContainerClient(env) or configure WORKFLOW_EXECUTOR_URL).');
}

export async function start(...args) {
  // Caller-facing shim for start(...). Translate args to a compact payload and forward.
  // NOTE: Inputs must be JSON-safe or pre-staged; this shim does not attempt eval-based serialization.
  const payload = {
    action: 'start',
    args
  };
  const client = await _getClient();
  const res = await client.execute(payload, (globalThis as any).__wf__env);
  return res;
}

export function workflowEntrypoint(workflowCode) {
  // Return a handler function that forwards execution to the remote container.
  return async function POST(request, env) {
    // Parse optional request body (queue envelope) and forward minimal payload
    let body = null;
    try {
      body = await request.json().catch(() => null);
    } catch {}
    const payload = {
      action: 'executeWorkflowCode',
      workflowCode,
      body
    };
    const client = await _getClient();
    const res = await client.execute(payload, env);
    if (res instanceof Response) return res;
    return new Response(JSON.stringify(res), { status: res && res.success ? 200 : 500 });
  };
}

export function stepEntrypoint(...args) {
  // Similar shim for step entrypoints. Forwarding wrapper only.
  return async function POST(request, env) {
    let body = null;
    try {
      body = await request.json().catch(() => null);
    } catch {}
    const payload = {
      action: 'step',
      args,
      body
    };
    const client = await _getClient();
    const res = await client.execute(payload, env);
    if (res instanceof Response) return res;
    return new Response(JSON.stringify(res), { status: res && res.success ? 200 : 500 });
  };
}

// Provide a helpful failure for createWorld() which cannot be proxied safely from within Workers.
export function createWorld() {
  throw new Error('createWorld() cannot be used in the Worker build. Install and configure the workflow-cloudflare-bindings plugin and deploy the world runtime separately.');
}
`;
    },

    // Defensive Vite config hook: ensure runtime-only Cloudflare packages and
    // special import schemes are treated as external during build so Rollup/Vite
    // do not attempt to resolve `@cloudflare/containers` or the custom
    // `cloudflare:` scheme during SSR/SSR-bundling.
    //
    // This keeps the plugin self-contained: consumers keep their minimal Vite
    // config while the transformer ensures the container package and related
    // subpaths aren't parsed at build-time.
    config(config: any) {
      // --- optimizeDeps.exclude: add @cloudflare/containers and workflow packages defensively ---
      config.optimizeDeps = config.optimizeDeps || {};
      const existingOptimizeExclude = Array.isArray(config.optimizeDeps.exclude)
        ? config.optimizeDeps.exclude
        : [];
      // include Cloudflare runtime-only package
      const optExcludes = existingOptimizeExclude.slice();
      if (!optExcludes.includes('@cloudflare/containers'))
        optExcludes.push('@cloudflare/containers');
      // also defensively exclude the workspace workflow package and common subpath(s)
      if (!optExcludes.includes('workflow')) optExcludes.push('workflow');
      if (!optExcludes.includes('workflow/runtime'))
        optExcludes.push('workflow/runtime');
      config.optimizeDeps.exclude = optExcludes;

      // --- ssr.external: include direct package & container subpath and workflow runtime ---
      config.ssr = config.ssr || {};
      const existingSsrExternal = Array.isArray(config.ssr.external)
        ? config.ssr.external.slice()
        : [];
      if (!existingSsrExternal.includes('@cloudflare/containers')) {
        existingSsrExternal.push('@cloudflare/containers');
      }
      if (
        !existingSsrExternal.includes('workflow-cloudflare-world/container')
      ) {
        existingSsrExternal.push('workflow-cloudflare-world/container');
      }
      // Add workflow runtime/package to SSR external list to avoid server-side resolution
      if (!existingSsrExternal.includes('workflow')) {
        existingSsrExternal.push('workflow');
      }
      if (!existingSsrExternal.includes('workflow/runtime')) {
        existingSsrExternal.push('workflow/runtime');
      }
      config.ssr.external = existingSsrExternal;

      // --- build.rollupOptions.external: normalize to include our external rules ---
      config.build = config.build || {};
      config.build.rollupOptions = config.build.rollupOptions || {};
      const currentExternal = config.build.rollupOptions.external;

      // Helper: mark known cloudflare-ish ids (and workspace workflow ids) as external
      const isCloudflareId = (id: unknown) => {
        try {
          if (!id || typeof id !== 'string') return false;
          // direct packages and subpaths
          if (
            id === '@cloudflare/containers' ||
            id.startsWith('@cloudflare/containers/')
          )
            return true;
          if (
            id === 'workflow-cloudflare-world/container' ||
            id.startsWith('workflow-cloudflare-world/container')
          )
            return true;
          // workspace workflow package and common runtime subpath
          if (id === 'workflow' || id.startsWith('workflow/')) return true;
          // any import using the cloudflare: scheme should be treated external
          if (id.startsWith('cloudflare:')) return true;
          return false;
        } catch {
          return false;
        }
      };

      if (!currentExternal) {
        // No external set: use function form to capture schemes/subpaths
        config.build.rollupOptions.external = (
          id: unknown,
          ..._rest: unknown[]
        ) => {
          return isCloudflareId(id);
        };
      } else if (Array.isArray(currentExternal)) {
        // preserve existing list but append our function rule
        // rollup accepts mix of strings/regex/functions
        const arr = currentExternal.slice();
        // avoid duplicates of common literal entries
        if (!arr.includes('@cloudflare/containers'))
          arr.push('@cloudflare/containers');
        if (!arr.includes('workflow-cloudflare-world/container'))
          arr.push('workflow-cloudflare-world/container');
        if (!arr.includes('workflow')) arr.push('workflow');
        if (!arr.includes('workflow/runtime')) arr.push('workflow/runtime');
        // Append function rule to cover cloudflare: scheme and subpath prefixes
        arr.push((id: unknown) => isCloudflareId(id));
        config.build.rollupOptions.external = arr;
      } else if (typeof currentExternal === 'function') {
        // Compose functions: keep existing + our check
        const prev = currentExternal;
        config.build.rollupOptions.external = (
          id: unknown,
          ...rest: unknown[]
        ) => {
          return prev(id, ...rest) || isCloudflareId(id);
        };
      } else if (currentExternal instanceof RegExp) {
        // convert to array that includes the regex and our function
        config.build.rollupOptions.external = [
          currentExternal,
          (id: unknown) => isCloudflareId(id),
        ];
      } else {
        // Unknown shape: fall back to wrapper that defers to existing behavior and our rule
        const prev = currentExternal as any;
        config.build.rollupOptions.external = (
          id: unknown,
          ...rest: unknown[]
        ) => {
          try {
            // try previous behavior first if callable
            if (typeof prev === 'function') {
              if (prev(id, ...rest)) return true;
            }
            // otherwise try matching against known literals/regexes in prev if array-like
            if (Array.isArray(prev)) {
              for (const item of prev) {
                if (typeof item === 'string' && item === id) return true;
                if (
                  item instanceof RegExp &&
                  typeof id === 'string' &&
                  item.test(id)
                )
                  return true;
              }
            }
          } catch {
            // ignore and fallback to our rule
          }
          return isCloudflareId(id);
        };
      }

      return config;
    },
    async transform(code: string, id: string) {
      // Only transform relevant JS/TS files
      if (!/\.(js|ts|mjs|cjs|jsx|tsx)$/.test(id)) return null;

      const hasEntrypointImport =
        code.includes(
          "import { workflowEntrypoint } from 'workflow/runtime'"
        ) ||
        code.includes('import { workflowEntrypoint } from "workflow/runtime"');
      if (!hasEntrypointImport) return null;

      if (!code.includes('const workflowCode =')) return null;
      if (!code.includes('export const POST = workflowEntrypoint('))
        return null;

      const postExprIndex = code.indexOf(
        'export const POST = workflowEntrypoint('
      );
      if (postExprIndex === -1) return null;

      // Determine end of the statement to replace
      let postExprEnd = code.indexOf(';', postExprIndex);
      if (postExprEnd === -1) {
        // fallback to newline
        const nl = code.indexOf('\n', postExprIndex);
        postExprEnd = nl === -1 ? postExprIndex + 1 : nl + 1;
      } else {
        postExprEnd += 1;
      }

      const s = new MagicString(code);

      // Handler to inject. It references `workflowCode` which exists in the generated bundle.
      // It attempts to:
      //  - parse queue headers (x-vqs-queue-name etc)
      //  - read the request body (the queue envelope/message)
      //  - optionally use a runtime-provided `globalThis.__wf__create_world(env)` to fetch
      //    workflowRun and events; if that is unavailable, it forwards minimal info to container
      //  - forward to `globalThis.__wf__container_client.execute(payload, env)` if present
      //    or to env.WORKFLOW_EXECUTOR / env.WORKFLOW_EXECUTOR_URL
      const injectedHandler = `
export const POST = async function(request, env) {
  // Parse headers into object (compatible with createQueueHandler)
  const headerEntries = [];
  if (request && request.headers && typeof request.headers.forEach === 'function') {
    request.headers.forEach((v, k) => headerEntries.push([k.toLowerCase(), v]));
  }
  const headers = Object.fromEntries(headerEntries);

  const queueName = headers['x-vqs-queue-name'] || headers['x-vqs-queue-name'.toLowerCase()];
  if (!queueName) {
    return Response.json({ error: 'Missing queue headers' }, { status: 400 });
  }

  // Parse JSON body (queue envelope.message)
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const workflowName = queueName && queueName.startsWith('__wkf_workflow_') ? queueName.slice('__wkf_workflow_'.length) : null;
  const runId = body?.runId ?? body?.workflowRunId ?? null;

  // Try to load workflowRun & events via runtime-provided world factory if available.
  let workflowRun = null;
  let events = null;
  try {
    const factory = (typeof (globalThis as any).__wf__create_world !== 'undefined') ? (globalThis as any).__wf__create_world : undefined;
    if (factory && runId) {
      const world = factory(env);
      workflowRun = await world.runs.get(runId);
      // Load all events in ascending order
      events = [];
      let cursor = null;
      let hasMore = true;
      while (hasMore) {
        const page = await world.events.list({ runId, pagination: { cursor: cursor ?? undefined, sortOrder: 'asc' } });
        events.push(...page.data);
        hasMore = page.hasMore;
        cursor = page.cursor;
      }
    }
  } catch (err) {
    // Ignore errors fetching world state; we'll still forward minimal payload to container
    workflowRun = workflowRun || null;
    events = events || null;
  }

  // Build payload for container executor
  const payload = {
    workflowCode,
    workflowRun: workflowRun || (runId ? { runId, workflowName } : undefined),
    inputs: (workflowRun && workflowRun.input) ? workflowRun.input : (body?.input ?? body?.inputs ?? undefined),
    events,
    context: {
      seed: runId ?? null,
      fixedTimestamp: workflowRun?.startedAt ? +new Date(workflowRun.startedAt) : Date.now(),
      workflowRunId: runId ?? null
    }
  };

  try {
    // If a richer runtime-provided client exists prefer it.
    if (typeof (globalThis as any).__wf__container_client !== 'undefined' && typeof (globalThis as any).__wf__container_client.execute === 'function') {
      const result = await (globalThis as any).__wf__container_client.execute(payload, env);
      if (result instanceof Response) return result;
      if (result && typeof result === 'object') {
        if (result.success) return Response.json({ ok: true });
        if (typeof result.retryAfterSeconds === 'number') {
          return Response.json({ timeoutSeconds: result.retryAfterSeconds }, { status: 503 });
        }
        return Response.json({ error: result.error ?? 'Container execution failed' }, { status: 500 });
      }
      // fallback
      return Response.json({ ok: true });
    }

    // Fallback: Durable Object namespace or service binding
    if (env && (env as any).WORKFLOW_EXECUTOR) {
      const executor = (env as any).WORKFLOW_EXECUTOR;
      // Durable Object namespace style: idFromName + get(id) -> stub.fetch
      if (typeof executor.idFromName === 'function' && typeof executor.get === 'function') {
        const name = runId ?? 'default';
        try {
          const id = executor.idFromName(String(name));
          const stub = executor.get(id);
          const req = new Request('/execute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const resp = await stub.fetch(req);
          if (resp.status === 503) {
            try {
              const bodyJson = await resp.json();
              if (bodyJson && typeof bodyJson.retryAfterSeconds === 'number') {
                return Response.json({ timeoutSeconds: bodyJson.retryAfterSeconds }, { status: 503 });
              }
            } catch {}
            return Response.json({ error: 'Retry' }, { status: 503 });
          }
          if (!resp.ok) {
            const t = await resp.text();
            return Response.json({ error: t || 'Container error' }, { status: resp.status });
          }
          return resp;
        } catch (err) {
          // continue to other fallbacks
          console.error('Executor DO invocation failed', err);
        }
      }
      // Service binding style: executor.fetch
      if (typeof executor.fetch === 'function') {
        const req = new Request('/execute', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const resp = await executor.fetch(req);
        if (resp.status === 503) {
          try {
            const bodyJson = await resp.json();
            if (bodyJson && typeof bodyJson.retryAfterSeconds === 'number') {
              return Response.json({ timeoutSeconds: bodyJson.retryAfterSeconds }, { status: 503 });
            }
          } catch {}
          return Response.json({ error: 'Retry' }, { status: 503 });
        }
        if (!resp.ok) {
          const t = await resp.text();
          return Response.json({ error: t || 'Container error' }, { status: resp.status });
        }
        return resp;
      }
    }

    // Final fallback: use configured executor URL
    const target = (env && (env as any).WORKFLOW_EXECUTOR_URL) || (typeof process !== 'undefined' && process.env && (process.env.WORKFLOW_EXECUTOR_URL));
    if (!target) {
      return Response.json({ error: 'No workflow executor target configured' }, { status: 500 });
    }
    const resp = await fetch(String(target), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (resp.status === 503) {
      try {
        const bodyJson = await resp.json();
        if (bodyJson && typeof bodyJson.retryAfterSeconds === 'number') {
          return Response.json({ timeoutSeconds: bodyJson.retryAfterSeconds }, { status: 503 });
        }
      } catch {}
      return Response.json({ error: 'Retry' }, { status: 503 });
    }
    if (!resp.ok) {
      const t = await resp.text();
      return Response.json({ error: t || 'Container error' }, { status: resp.status });
    }
    return resp;
  } catch (err) {
    console.error('Container dispatch failed', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
};
`;

      // Replace the original export with our handler
      s.overwrite(postExprIndex, postExprEnd, injectedHandler);

      // Conservative handling: avoid destructive global text rewrites on the
      // generated bundle. Aggressive regex replacements are brittle and have
      // previously introduced TypeScript/compile-time issues. Instead:
      //
      // 1) Rely on the plugin's config() and resolveId() hooks to externalize
      //    runtime-only modules (`@cloudflare/containers`, `cloudflare:*`),
      //    which prevents the bundler from attempting to resolve them.
      // 2) If the generated bundle still references the container subpath, do
      //    NOT attempt to remove import lines here. Instead, append a small
      //    runtime loader shim (below) that provides a live exported binding
      //    `WorkflowExecutorContainer` without modifying the original bundle
      //    text. This approach is non-destructive and avoids brittle string/regex
      //    work.
      //
      // If necessary, log the presence of a remaining reference so callers can
      // decide to update generator templates rather than rely on brittle rewrites.
      if (
        code.includes('workflow-cloudflare-world/container') ||
        code.includes('@cloudflare/containers')
      ) {
        // Detected a reference to the runtime subpath in the generated bundle.
        // We will append a runtime loader shim below (no in-place removals).
        // Optionally, one could surface a debug log here for diagnostics.
      }

      // Append a runtime loader shim that provides a live exported binding
      // named WorkflowExecutorContainer. This preserves the consumer API but
      // ensures the container class is only resolved at runtime.
      const loaderShim = `
      // Runtime loader for WorkflowExecutorContainer.
      // Replaces any static import of the container subpath so bundlers don't parse runtime-only packages.
      // NOTE: This copy of the plugin is self-contained and prefers local bindings first.
      export let WorkflowExecutorContainer;
      (async function() {
        try {
          // Prefer a local package-root helper if present (safe to import at runtime).
          // Use a dynamic import of the local index so this only runs in the deployed worker.
          const pkg = await import('./index.js');
          if (pkg && typeof pkg.loadWorkflowExecutorContainer === 'function') {
            try {
              const maybe = await pkg.loadWorkflowExecutorContainer();
              if (maybe) {
                WorkflowExecutorContainer = maybe;
                return;
              }
            } catch (err) {
              // fallthrough to direct subpath import
            }
          }

          // Runtime fallback: attempt to load a local container implementation subpath.
          // This is a last-resort path and will not be evaluated during build-time.
          const mod = await import('./container.js').catch(() => null);
          if (mod && mod.WorkflowExecutorContainer) {
            WorkflowExecutorContainer = mod.WorkflowExecutorContainer;
            return;
          }

          // If no local container implementation is available, leave undefined.
        } catch (err) {
          // Not available in this environment (e.g., local dev SSR); leave undefined.
          (globalThis.console ?? console).warn?.('WorkflowExecutorContainer not available at runtime:', err);
        }
      })();
      `;

      s.append(loaderShim);

      // Minimal container client placeholder to avoid ReferenceError when missing
      // (preserve original behavior).
      if (!code.includes('__wf__container_client')) {
        const shim = `\n// Minimal container client placeholder. Integrations can set globalThis.__wf__container_client\nif (typeof (globalThis as any).__wf__container_client === 'undefined') {\n  (globalThis as any).__wf__container_client = { execute: undefined };\n}\n`;
        s.append(shim);
      }

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true }) as any,
      };
    },
  };
}

// Export a default to make subpath `vite-plugin` provide a default entrypoint
export default cloudflareWorkflowTransformer;
