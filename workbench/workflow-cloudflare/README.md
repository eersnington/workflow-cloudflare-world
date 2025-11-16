# Workflow + Cloudflare Worker Example

Steps:

1. Generate the workflow bundles and manifest:

   ```bash
   pnpm run build
   ```

2. Run locally with Wrangler:

   ```bash
   pnpm dlx wrangler dev
   ```

3. Trigger the sample workflow:

   ```bash
   curl -X POST http://127.0.0.1:8787/test \
     -H 'content-type: application/json' \
     --data '{"name":"Ada"}'
   ```

The Worker routes the Workflow endpoints via `createWorkflowCloudflareFetchHandler` using the generated `.well-known/workflow/v1/*.js` modules, and exposes `/test` to call `start(handleGreeting, ...)`.
