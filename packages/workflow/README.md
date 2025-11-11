<div align="center">
  <a href="https://useworkflow.dev">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://useworkflow.dev/workflow-circle-symbol-dark.svg">
      <img alt="Workflow DevKit logo" src="https://useworkflow.dev/workflow-circle-symbol-light.svg" height="128">
    </picture>
  </a>
  <h1>Workflow DevKit</h1>
</div>

**Workflow DevKit** is a durable functions framework for JavaScript/TypeScript that enables you to write long-running, stateful application logic on top of stateless compute. The runtime persists progress as an event log and deterministically replays code to reconstruct state after cold starts, failures, or scale events.

This repository hosts the core Workflow SDK, world implementations for various platforms, and example applications. For full documentation, visit [useworkflow.dev](https://useworkflow.dev).

## Core Concepts

- **Workflows (`"use workflow"`)**: Orchestrator functions that define the high-level logic of a process. They run in a deterministic, sandboxed environment and must not perform side effects directly.
- **Steps (`"use step"`)**: Functions that perform the actual work, such as calling APIs, querying databases, or running business logic. They have full access to the Node.js runtime.
- **Worlds**: Platform-specific implementations that provide the necessary backend primitives (storage, queues, streaming) for the workflow runtime to operate.

## Architecture & Packages

This repository is a monorepo containing the following key packages:

-   **`packages/core`**: The core workflow runtime, primitives, and type definitions (`@workflow/core`).
-   **`packages/workflow`**: The main public package that you install in your applications (`workflow`).
-   **`packages/world`**: Defines the standard interface that all "World" implementations must adhere to (`@workflow/world`).

### World Implementations

Worlds provide the "backend" for the workflow system on a specific platform.

-   **`packages/world-local`**: A filesystem-based world for local development and testing.
-   **`packages/world-vercel`**: A production-ready world for Vercel deployments, using Vercel KV, Postgres, and Queues.
-   **`packages/world-cloudflare`**: A deployable, standalone runtime for Cloudflare, using D1, R2, Queues, and Containers.
-   **`packages/workflow-cloudflare-bindings`**: A lightweight package for consumer applications to connect to a deployed Cloudflare World.

### Framework Integrations

-   **`packages/next`**: Next.js integration (`@workflow/next`).
-   **`packages/sveltekit`**: SvelteKit integration (`@workflow/sveltekit`).

### Tooling

-   **`packages/cli`**: The command-line interface for building and managing workflows (`@workflow/cli`).
-   **`packages/swc-plugin-workflow`**: The SWC compiler plugin that transforms `"use workflow"` and `"use step"` functions at build time.

## Getting Started

The easiest way to get started is by using a framework-specific starter template. Visit [useworkflow.dev/docs/getting-started](https://useworkflow.dev/docs/getting-started) for guides on Next.js, SvelteKit, and more.

### Local Development

1.  **Clone the repository.**
2.  **Install dependencies:** `pnpm install`
3.  **Build all packages:** `pnpm build`

To run a specific example, navigate to its directory in the `workbench` and follow the instructions in its `README.md`.

For example, to run the Next.js Turbopack example:

```bash
cd workbench/nextjs-turbopack
pnpm dev
```

## How It Works

The Workflow DevKit uses a compiler-driven approach. The SWC plugin (`swc-plugin-workflow`) traverses your code at build time and transforms functions marked with `"use workflow"` or `"use step"`.

1.  **Workflow Functions** are compiled to run within a deterministic, sandboxed VM. All external communication happens by dispatching step functions.
2.  **Step Functions** are extracted and exposed as independent, invokable endpoints.
3.  The runtime records every step function call and its result in an event log (the "world").
4.  If a workflow execution is interrupted, the runtime replays the event log, restoring the workflow's state to exactly where it left off without re-executing already completed steps.

This event-sourcing model is what makes workflows durable and resilient to failures.

## Contributing

Contributions are welcome! Please see the [Contributing Guide](https://github.com/vercel/workflow/blob/main/CONTRIBUTING.md) for guidelines on how to submit changes.

## Support

-   **Documentation**: [useworkflow.dev](https://useworkflow.dev)
-   **Questions & Discussions**: [GitHub Discussions](https://github.com/vercel/workflow/discussions)
-   **Bugs & Issues**: [GitHub Issues](https://github.com/vercel/workflow/issues)

## Support

- Questions / discussions: [GitHub Discussions](https://github.com/vercel/workflow/discussions)
- Bugs specific to this world implementation: open an issue in this repo with details about your Worker setup, Wrangler config, and any relevant logs.
