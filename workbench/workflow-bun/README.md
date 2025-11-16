# Workflow Bun Example

This sandbox demonstrates using the `workflow-bun` package to:

1. Compile workflows/steps into `.well-known/workflow/v1/*`
2. Serve the generated handlers through `Bun.serve()`

## Commands

```bash
pnpm install
pnpm run build        # generates .well-known/workflow/v1/*
pnpm run start        # runs Bun.serve on http://localhost:3153
```

Make sure you have Bun installed locally. The server exposes the Workflow DevKit routes and can be hit with `curl` or from application code using `workflow/api`.

Trigger the sample workflow via the custom `/test` route:

```bash
curl -X POST http://127.0.0.1:3153/test \
  -H 'content-type: application/json' \
  --data '{"name":"Ada"}'
```
