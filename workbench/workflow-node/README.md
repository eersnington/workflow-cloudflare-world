# Workflow Node Example

Minimal setup showing how to:

1. Define a workflow (`workflows/example.ts`)
2. Build handler bundles via `workflow build`
3. Mount workflow routes inside a regular Node server via `createWorkflowNodeFetchHandler`
4. Load workflow functions with `getWorkflow` for `start()`

## Commands

```bash
pnpm install
pnpm run build    # workflow build + tsc
pnpm run start    # starts the local server on http://localhost:3152
```

While the server is running you can trigger the example workflow with:

```bash
curl -X POST http://127.0.0.1:3152/test \
  -H 'content-type: application/json' \
  --data '{"name":"Ada"}'
```

The server exposes the Workflow DevKit routes under `/.well-known/workflow/v1/*`. Use `workflow/api` to start runs from another script or curl the endpoints manually while experimenting.
