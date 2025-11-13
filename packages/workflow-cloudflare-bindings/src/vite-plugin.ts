/* Purpose: this file is a Vite plugin shipped as plain JS-compatible code.
   We disable TS checking here and declare `require` so the file can be used in
   mixed environments (Node builds and Worker-safe bundling) without TypeScript
   compilation errors. */
declare function require(name: string): any;

type Plugin = any;
let MagicString: any;
let acorn: any;
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

try {
  acorn = require('acorn');
} catch {
  acorn = null;
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
      console.log('[workflow-bindings] resolveId called with:', source);
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

          if (
            /workflow(?:\/|\\)dist(?:\/|\\).*runtime(?:\/|\\)world(?:\.js)?$/.test(
              source
            ) ||
            source === 'workflow/runtime/world'
          ) {
            return {
              id: '\0workflow-cloudflare-world-module',
              external: false,
            };
          }

          if (
            source === '@workflow/world-local' ||
            source.startsWith('@workflow/world-local/')
          ) {
            return {
              id: '\0workflow-world-local-stub',
              external: false,
            };
          }

          if (
            source === '@workflow/world-vercel' ||
            source.startsWith('@workflow/world-vercel/')
          ) {
            return {
              id: '\0workflow-world-vercel-stub',
              external: false,
            };
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
          if (
            source === 'workflow/api' ||
            source === '@workflow/core/api' ||
            source === 'workflow/api/index' ||
            source === '@workflow/core/api/index'
          ) {
            return {
              id: 'virtual:workflow-api-remote-shim',
              external: false,
            } as any;
          }
          if (
            /workflow(?:\/|\\)dist(?:\/|\\).*runtime(?:\/|\\)(?:index)?(?:\.js)?$/.test(
              source
            ) ||
            /workflow(?:\/|\\)dist(?:\/|\\)runtime(?:\.js)?$/.test(source)
          ) {
            return {
              id: 'virtual:workflow-remote-shim',
              external: false,
            } as any;
          }
          if (
            /workflow(?:\/|\\)dist(?:\/|\\).*api(?:\/|\\)(?:index)?(?:\.js)?$/.test(
              source
            ) ||
            /workflow(?:\/|\\)dist(?:\/|\\)api(?:\.js)?$/.test(source)
          ) {
            return {
              id: 'virtual:workflow-api-remote-shim',
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
      console.log('[workflow-bindings] load called with:', id);
      if (id === '\0workflow-cloudflare-world-module') {
        return `
const message = 'workflow-cloudflare-bindings: createWorld() is unavailable in Cloudflare Worker builds. Install and configure the Cloudflare world runtime, then call the APIs exported by workflow-cloudflare-bindings.';

export function createWorld() {
  throw new Error(message);
}

export const getWorld = createWorld;

export function getWorldHandlers() {
  throw new Error(message);
}

export function setWorld() {}
`;
      }

      if (
        id === '\0workflow-world-local-stub' ||
        id === '\0workflow-world-vercel-stub'
      ) {
        return `
throw new Error('${id.includes('local') ? '@workflow/world-local' : '@workflow/world-vercel'} cannot be bundled in Cloudflare Worker builds. Install workflow-cloudflare-bindings and use the remote world instead.');
`;
      }

      if (id === 'virtual:workflow-remote-shim') {
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

function _getEnv(baseEnv) {
  const runtimeEnv =
    typeof (globalThis as any).__wf__env === 'object'
      ? (globalThis as any).__wf__env
      : undefined;
  return {
    WORKFLOW_TARGET_WORLD: 'workflow-cloudflare-world',
    ...(runtimeEnv || {}),
    ...(baseEnv || {})
  };
}

export async function start(...args) {
  // Caller-facing shim for start(...). Translate args to a compact payload and forward.
  // NOTE: Inputs must be JSON-safe or pre-staged; this shim does not attempt eval-based serialization.
  const payload = {
    action: 'start',
    args
  };
  const client = await _getClient();
  return client.execute(payload, _getEnv());
}

export async function runStep(...args) {
  const payload = {
    action: 'runStep',
    args
  };
  const client = await _getClient();
  return client.execute(payload, _getEnv());
}

export async function resumeHook(...args) {
  const payload = {
    action: 'resumeHook',
    args
  };
  const client = await _getClient();
  return client.execute(payload, _getEnv());
}

export async function resumeWebhook(...args) {
  const payload = {
    action: 'resumeWebhook',
    args
  };
  const client = await _getClient();
  return client.execute(payload, _getEnv());
}

export async function getRun(...args) {
  const payload = {
    action: 'getRun',
    args
  };
  const client = await _getClient();
  return client.execute(payload, _getEnv());
}

export async function getHookByToken(...args) {
  const payload = {
    action: 'getHookByToken',
    args
  };
  const client = await _getClient();
  return client.execute(payload, _getEnv());
}

export class Run {
  constructor(value) {
    Object.assign(this, value ?? {});
  }
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
    const res = await client.execute(payload, _getEnv(env));
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
    const res = await client.execute(payload, _getEnv(env));
    if (res instanceof Response) return res;
    return new Response(JSON.stringify(res), { status: res && res.success ? 200 : 500 });
  };
}

// Provide a helpful failure for createWorld() which cannot be proxied safely from within Workers.
export function createWorld() {
  throw new Error('createWorld() cannot be used in the Worker build. Install and configure the workflow-cloudflare-bindings plugin and deploy the world runtime separately.');
}
`;
      }
      if (id === 'virtual:workflow-api-remote-shim') {
        return `
/* virtual module: workflow-api-remote-shim */
export { start, runStep, resumeHook, resumeWebhook, getRun, getHookByToken, Run } from 'virtual:workflow-remote-shim';
export { start as startWorkflow } from 'virtual:workflow-remote-shim';
`;
      }

      return null;
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
      config.resolve = config.resolve || {};
      const aliasEntries = [
        {
          find: /workflow(?:\/|\\)dist(?:\/|\\).*runtime(?:\/|\\)world(?:\.js)?$/,
          replacement: '\0workflow-cloudflare-world-module',
        },
        {
          find: /workflow(?:\/|\\)runtime(?:\/|\\)world$/,
          replacement: '\0workflow-cloudflare-world-module',
        },
        {
          find: '@workflow/world-local',
          replacement: '\0workflow-world-local-stub',
        },
        {
          find: '@workflow/world-vercel',
          replacement: '\0workflow-world-vercel-stub',
        },
        {
          find: /^workflow\/runtime(?:\/index)?$/,
          replacement: 'virtual:workflow-remote-shim',
        },
        {
          find: /^workflow\/api(?:\/index)?$/,
          replacement: 'virtual:workflow-api-remote-shim',
        },
        {
          find: /^@workflow\/core\/runtime(?:\/index)?$/,
          replacement: 'virtual:workflow-remote-shim',
        },
        {
          find: /^@workflow\/core\/api(?:\/index)?$/,
          replacement: 'virtual:workflow-api-remote-shim',
        },
      ];
      if (!config.resolve.alias) {
        config.resolve.alias = aliasEntries;
      } else if (Array.isArray(config.resolve.alias)) {
        config.resolve.alias.push(...aliasEntries);
      } else if (typeof config.resolve.alias === 'object') {
        const flattened = Object.entries(config.resolve.alias).map(
          ([find, replacement]) => ({
            find,
            replacement,
          })
        );
        config.resolve.alias = [...flattened, ...aliasEntries];
      }
      // --- optimizeDeps.exclude: add @cloudflare/containers defensively ---
      config.optimizeDeps = config.optimizeDeps || {};
      const existingOptimizeExclude = Array.isArray(config.optimizeDeps.exclude)
        ? config.optimizeDeps.exclude
        : [];
      // include Cloudflare runtime-only package
      const optExcludes = existingOptimizeExclude.slice();
      if (!optExcludes.includes('@cloudflare/containers'))
        optExcludes.push('@cloudflare/containers');
      config.optimizeDeps.exclude = optExcludes;

      // --- ssr.external: include direct package & container subpath ---
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
      if (!/\.(js|ts|mjs|cjs|jsx|tsx)$/.test(id)) return null;

      const hasEntrypointImport =
        code.includes(
          "import { workflowEntrypoint } from 'workflow/runtime'"
        ) ||
        code.includes('import { workflowEntrypoint } from "workflow/runtime"');
      if (!hasEntrypointImport) return null;

      if (!code.includes('const workflowCode =')) return null;
      if (!code.includes('workflowEntrypoint(')) return null;

      const handlerRange =
        findLegacyPostHandlerRange(code) ??
        findModernPostHandlerRange(code, acorn);
      if (!handlerRange) return null;

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
      s.overwrite(handlerRange.start, handlerRange.end, injectedHandler);

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

function findLegacyPostHandlerRange(
  code: string
): { start: number; end: number } | null {
  const postExprIndex = code.indexOf('export const POST = workflowEntrypoint(');
  if (postExprIndex === -1) return null;
  let postExprEnd = code.indexOf(';', postExprIndex);
  if (postExprEnd === -1) {
    const nl = code.indexOf('\n', postExprIndex);
    postExprEnd = nl === -1 ? postExprIndex + 1 : nl + 1;
  } else {
    postExprEnd += 1;
  }
  return { start: postExprIndex, end: postExprEnd };
}

function findModernPostHandlerRange(
  code: string,
  acornLib: any
): { start: number; end: number } | null {
  if (acornLib) {
    try {
      const ast = acornLib.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowAwaitOutsideFunction: true,
      });
      let range: { start: number; end: number } | null = null;

      const visit = (node: any, parent: any) => {
        if (!node || range) return;
        switch (node.type) {
          case 'Program':
            for (const stmt of node.body) visit(stmt, node);
            break;
          case 'ExportNamedDeclaration':
            if (node.declaration) {
              visit(node.declaration, node);
            }
            break;
          case 'VariableDeclaration': {
            const container =
              parent && parent.type === 'ExportNamedDeclaration'
                ? parent
                : node;
            for (const decl of node.declarations ?? []) {
              if (range) break;
              inspectDeclarator(decl, container);
            }
            break;
          }
          default:
            for (const key in node) {
              if (range) break;
              if (key === 'start' || key === 'end') continue;
              const value = (node as any)[key];
              if (!value) continue;
              if (Array.isArray(value)) {
                for (const child of value) {
                  visit(child, node);
                  if (range) break;
                }
              } else if (typeof value === 'object') {
                visit(value, node);
              }
            }
        }
      };

      const inspectDeclarator = (decl: any, container: any) => {
        if (!decl || decl.type !== 'VariableDeclarator') return;
        if (!decl.id || decl.id.type !== 'Identifier') return;
        if (decl.id.name !== 'POST') return;
        const init = decl.init;
        if (!init) return;
        if (isWorkflowEntrypointCall(init)) {
          range = { start: container.start, end: container.end };
          return;
        }
        if (
          init.type === 'ArrowFunctionExpression' ||
          init.type === 'FunctionExpression'
        ) {
          if (nodeHasWorkflowEntrypointCall(init.body ?? init)) {
            range = { start: container.start, end: container.end };
          }
        }
      };

      visit(ast, null);
      if (range) {
        return consumeTrailingSemicolon(code, range);
      }
    } catch {
      // ignore parse failure and fall back to heuristic
    }
  }
  return findArrowHandlerHeuristic(code);
}

function isWorkflowEntrypointCall(node: any): boolean {
  if (!node || node.type !== 'CallExpression') return false;
  const callee = node.callee;
  return (
    callee &&
    callee.type === 'Identifier' &&
    callee.name === 'workflowEntrypoint'
  );
}

function nodeHasWorkflowEntrypointCall(node: any): boolean {
  if (!node) return false;
  const stack: any[] = [node];
  const seen = new Set<any>();
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);
    if (
      current.type === 'CallExpression' &&
      isWorkflowEntrypointCall(current)
    ) {
      return true;
    }
    for (const key in current) {
      if (key === 'start' || key === 'end') continue;
      const value = current[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const child of value) stack.push(child);
      } else if (typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return false;
}

function findArrowHandlerHeuristic(
  code: string
): { start: number; end: number } | null {
  const postIdx = code.indexOf('const POST');
  if (postIdx === -1) return null;
  const arrowIdx = code.indexOf('=>', postIdx);
  if (arrowIdx === -1) return null;
  const openingBrace = code.indexOf('{', arrowIdx);
  if (openingBrace === -1) return null;
  const closingBrace = findMatchingBrace(code, openingBrace);
  if (closingBrace === -1) return null;
  let end = closingBrace + 1;
  while (end < code.length && /\s/.test(code[end] ?? '')) {
    end += 1;
  }
  if (code[end] === ';') {
    end += 1;
  }
  return { start: postIdx, end };
}

function findMatchingBrace(source: string, startIndex: number): number {
  let depth = 0;
  for (let i = startIndex; i < source.length; i++) {
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(source, i, ch);
      continue;
    }
    if (ch === '/' && source[i + 1] === '/') {
      i = skipLineComment(source, i + 2);
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i = skipBlockComment(source, i + 2);
      continue;
    }
    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function skipString(source: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (quote === '`' && ch === '$' && source[i + 1] === '{') {
      const end = findMatchingBrace(source, i + 1);
      if (end === -1) return source.length;
      i = end + 1;
      continue;
    }
    if (ch === quote) return i;
    i += 1;
  }
  return source.length;
}

function skipLineComment(source: string, start: number): number {
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\n' || ch === '\r') break;
    i += 1;
  }
  return i;
}

function skipBlockComment(source: string, start: number): number {
  let i = start;
  while (i < source.length - 1) {
    if (source[i] === '*' && source[i + 1] === '/') {
      return i + 1;
    }
    i += 1;
  }
  return source.length;
}

function consumeTrailingSemicolon(
  code: string,
  range: { start: number; end: number }
): { start: number; end: number } {
  let end = range.end;
  while (end < code.length && /\s/.test(code[end] ?? '')) {
    end += 1;
  }
  if (code[end] === ';') {
    end += 1;
  }
  return { start: range.start, end };
}
