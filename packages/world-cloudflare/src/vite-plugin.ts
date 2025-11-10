type Plugin = any;
let MagicString: any;
try {
  // Load magic-string at runtime to avoid a hard dependency during build/test runs.
  // Prefer the default export when present.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const _ms = require('magic-string');
  MagicString = _ms && _ms.__esModule && _ms.default ? _ms.default : _ms;
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
    enforce: 'post',
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

      // Add a minimal shim to avoid runtime ReferenceError when global client is missing.
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
