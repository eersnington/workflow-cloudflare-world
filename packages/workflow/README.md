<div align="center">
  <a href="https://useworkflow.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://useworkflow.dev/workflow-circle-symbol-dark.svg">
      <img alt="Workflow DevKit logo" src="https://useworkflow.dev/workflow-circle-symbol-light.svg" height="128">
    </picture>
  </a>
  <h1>Workflow Cloudflare World (RFC)</h1>
</div>

> This is an experimental Cloudflare-focused fork that hosts the runtime (`workflow-cloudflare-world`), the app bindings (`workflow-cloudflare-bindings`), and the SvelteKit demo workbench. It is **not** the upstream Workflow DevKit repo. For official docs visit [useworkflow.dev](https://useworkflow.dev).

## What’s in this repo

- `packages/world-cloudflare`: the deployable Cloudflare world that uses D1, Queues, R2, Durable Objects, and Cloudflare Containers to execute workflows off-app.
- `packages/workflow-cloudflare-bindings`: the client/bindings package that rewrites workflow handlers and forwards `workflow/api` calls to the remote runtime.
- `workbench/svelte-cf`: a SvelteKit + Workers starter wired to the bindings package and Wrangler service bindings.
- `problems.md`: running RFC / issue log describing current blockers (notably the Vite transformer gap).

Everything else in this repo exists only to support the Cloudflare world experiments.

## Quick start

1. Scaffold and deploy the runtime:

    ```bash
    npx workflow-cloudflare-world init my-workflow-runtime
    cd my-workflow-runtime
    pnpm install
    wrangler d1 create <db-name>
    wrangler d1 migrations apply <db-name>
    wrangler deploy
    ```

    The CLI drops `wrangler.toml`, Dockerfile + container config, and the initial D1 migration so the worker/runtime can run queues, streams, and containers out of the box.

2. Connect your app (e.g., SvelteKit Worker):

    ```bash
    pnpm add workflow-cloudflare-bindings
    ```

    ```ts
    // vite.config.ts
    import { cloudflareWorkflowTransformer } from 'workflow-cloudflare-bindings/vite-plugin';
    export default defineConfig({
      plugins: [
        cloudflareWorkflowTransformer(),
        sveltekit(),
      ],
    });
    ```

    ```toml
    [[services]]
    binding = "WORKFLOW_RUNTIME"
    service = "my-workflow-runtime"
    ```

    ```ts
    // hooks.server.ts (SvelteKit) or Worker entry
    import { setupGlobalContainerClient } from 'workflow-cloudflare-bindings';
    export const handle = async ({ event, resolve }) => {
      setupGlobalContainerClient(event.platform?.env);
      return resolve(event);
    };
    ```

    With the binding set, calls to `workflow/api` are proxied to the containerized executor running in your Cloudflare account.

## How the Cloudflare world works

- **Queues**: `WORKFLOW_QUEUE` handles workflow jobs, `STEP_QUEUE` handles step retries. `handleQueueMessage` dispatches workflow jobs to the container executor via service binding or HTTPS, while step jobs run directly in the Worker.
- **Storage**: A D1 schema (see `packages/world-cloudflare/src/drizzle/schema.ts`) persists runs, steps, events, and hooks. The CLI copies the base migration into new projects.
- **Streaming**: A `StreamCoordinator` Durable Object fans out chunks to readers and persists them to R2.
- **Containers**: Cloudflare Containers host the Workflow VM because Workers do not support `vm.runInContext`, deterministic Math.random, or other sandbox requirements. The Worker queues jobs into the container via `WORKFLOW_EXECUTOR`.
- **Bindings package**: The Vite plugin swaps `workflow/runtime` imports with remote shims so Workers never bundle `@workflow/world-local`. `setupGlobalContainerClient` stores a singleton client that knows how to talk to the executor via service binding or `WORKFLOW_EXECUTOR_URL`.

For a deeper dive, read:

- [`packages/world-cloudflare/README.md`](packages/world-cloudflare/README.md)
- [`packages/workflow-cloudflare-bindings/README.md`](packages/workflow-cloudflare-bindings/README.md)
- [`packages/world-cloudflare/HOW_IT_WORKS.md`](packages/world-cloudflare/HOW_IT_WORKS.md)

## Status & RFC

This project is still in flux. The runtime + CLI + workbench deploy cleanly, but the bindings plugin must be updated to match modern SvelteKit output (see [problems.md](./problems.md)). Until that transformer lands, Workers may still bundle the local world and crash on Cloudflare.

Contributions, repro cases, and ideas are welcome via GitHub Discussions or issues in this repo. Please include Wrangler config, bindings, and `.svelte-kit` output snippets when reporting bugs.
