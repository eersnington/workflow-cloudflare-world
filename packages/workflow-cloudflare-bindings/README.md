# workflow-cloudflare-bindings

This package wires Workflow DevKit client apps to a Cloudflare-hosted runtime. Use it inside your Worker or Vite-based project (SvelteKit, Next.js, etc.) so workflow calls can reach the containerized executor deployed with [`workflow-cloudflare-world`](../world-cloudflare/README.md).

> **This is the client/bindings SDK.**  
> Deploy the runtime separately, then install this package in the app that triggers workflows.

---

## What it does

- Provides a **container client** that forwards `workflow/api` calls (start, runStep, resumeHook, …) to the remote runtime via service binding or HTTP endpoint.
- Ships a **Vite plugin** (`cloudflareWorkflowTransformer`) that rewrites generated workflow bundles so they never import the local Node-only world.
- Exposes helpers to register the service binding on `globalThis` for any environment (classic Worker, SvelteKit route handlers, etc.).

---

## Install

```bash
pnpm add workflow-cloudflare-bindings
# or npm / yarn – use the same manager as the rest of your workspace
```

---

## Quick start (Worker entry)

```ts
// src/worker.ts
import { setupGlobalContainerClient } from 'workflow-cloudflare-bindings';
import { start } from 'workflow/api';
import { calc } from './workflows/example';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    // expose the WORKFLOW_RUNTIME binding + optional executor URL
    setupGlobalContainerClient(env);

    if (req.method === 'POST' && new URL(req.url).pathname === '/api/trigger') {
      await start(calc, [9]);
      return new Response(JSON.stringify({ message: 'started' }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('ok');
  },
};
```

### Required bindings (wrangler.toml)

```toml
[[services]]
binding = "WORKFLOW_RUNTIME"      # becomes env.WORKFLOW_RUNTIME
service = "my-workflow-runtime"   # matches the runtime deployment name

# Optional: fallback URL if the service binding is unavailable
[vars]
WORKFLOW_EXECUTOR_URL = "https://my-runtime.example.com/execute"
```

---

## Vite integration (SvelteKit at the moment)

1. Install the package in the app workspace.
2. Add the Vite plugin before your framework adapter.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { workflowPlugin } from 'workflow/sveltekit';
import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-bindings/vite-plugin';

export default defineConfig({
  plugins: [
    workflowPlugin(),                // splits workflows/steps
    cloudflareWorkflowTransformer(), // rewires runtime + API imports
    sveltekit(),
  ],
});
```

3. Ensure your server entry (or `hooks.server.ts`) calls `setupGlobalContainerClient(env)` so the shim can find the executor binding at runtime.

---

## How the shim works

- `resolveId` intercepts imports of `workflow/runtime`, `workflow/api`, and the `@workflow/core/*` aliases, swapping in virtual modules that forward to the remote executor.
- The virtual modules build a payload like `{ action: 'start', args }`, then call `client.execute(payload, env)` on the shared container client.
- `setupGlobalContainerClient(env)` stores a singleton client on `globalThis.__wf__container_client`, optionally caching `env` for later requests in frameworks that only pass it once.
- If you define `WORKFLOW_EXECUTOR_URL`, the client will fall back to fetch that endpoint when the service binding is absent (useful for preview deploys).

---

## Troubleshooting tips

- **Still seeing `WeakRef` or `@workflow/world-local` in your Worker bundle?** Make sure the plugin runs (check `.svelte-kit/output/server/index.js` or Vite logs) and that no tooling pre-bundles `workflow/api` before Vite hooks execute.
- **`setupGlobalContainerClient` not called?** You’ll get `Error: No workflow container client available`. Call it in every request context where workflows might run.
- **Running outside Workers (local dev SSR)?** Provide `WORKFLOW_EXECUTOR_URL` so the client can reach your runtime via HTTP.

---

## Related packages

- [`workflow-cloudflare-world`](../world-cloudflare/README.md): deployable runtime (queues, Durable Objects, container executor).
- `workflow` / `@workflow/core`: main Workflow DevKit SDK used by your app code.

Keep the bindings package updated whenever you upgrade the runtime so the shim stays in sync with the remote API surface.
