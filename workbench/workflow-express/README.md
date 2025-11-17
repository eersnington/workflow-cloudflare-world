# Workflow Express Example

A minimal Express app that:

1. Registers the Workflow SWC transform via `workflow-express/register`
2. Builds the handler bundles with `createWorkflowExpressBuilder`
3. Mounts `createWorkflowExpressRouter` ahead of the rest of your middleware stack

## Commands

```bash
pnpm install
pnpm run build    # generates .well-known/workflow/v1/*
pnpm run start    # builds + starts http://localhost:3154
```

While the dev server is running you can trigger the example workflow:

```bash
curl -X POST http://127.0.0.1:3154/trigger \\
  -H 'content-type: application/json' \\
  --data '{"name":"Ada"}'
```

Workflow DevKit routes live under `/.well-known/workflow/v1/*`. The router sits before `express.json()` so Workflow requests see the raw body, while your own routes (`/healthz`, `/trigger`) keep using standard Express middleware.
