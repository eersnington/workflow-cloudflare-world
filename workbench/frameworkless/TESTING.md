# Testing the Frameworkless Prototype

Everything in this workbench is throwaway R&D. The steps below walk through the full loop: build the bundles, boot the tiny server, kick off a workflow, and inspect the results.

## 1. Install once

```bash
pnpm install
```

## 2. Build the pieces

```bash
# compile the shared helpers
pnpm --filter @workflow/standalone build

# bundle the example workflows + emit manifest.cjs
pnpm --filter @workflow/frameworkless-app build
```

The second command generates `.well-known/workflow/v1/*.js` and `manifest.cjs` (same idea as `workbench/example/manifest.js`, just CommonJS so it works regardless of `"type": "module"`).

## 3. Start the standalone server

```bash
pnpm --filter @workflow/frameworkless-app start
```

- Compiles `server.ts` via `tsc --project tsconfig.server.json`, then runs `node dist/server.js`.
- Listens on `PORT` if provided, otherwise `3000`.
- Leave this process running; stop it with <kbd>Ctrl</kbd>+<kbd>C</kbd> when done.

> If your environment forbids binding to that port (e.g. sandbox restrictions), try `PORT=0 pnpm --filter @workflow/frameworkless-app start` to let Node choose an ephemeral port. Use the printed URL in later steps.

Or, to use the CLI with watch mode:

```bash
# inside the app directory
pnpm workflow dev --port 3000
```

This runs the same standalone server, automatically rebuilds on file changes, and exposes the helper route described below.

## 4. Kick off a workflow via HTTP

Open another terminal and POST to the helper route the server exposes:

```bash
curl -v \
  -X POST http://127.0.0.1:3000/api/test \
  -H "content-type: application/json" \
  --data '{"name":"curl"}'
```

The server will:

1. Load `manifest.cjs` to grab the `hello` workflow metadata.
2. Call `start()` from `workflow/api`, creating a run inside `.workflow-data`.
3. Queue the work to `/.well-known/workflow/v1/flow` and wait until it finishes.
4. Return `{ runId, name }` once `run.returnValue` resolves.

You’ll see request/response logs in the curl terminal and execution logs in the server terminal.

## 5. Drive the same run with the CLI (optional)

Point the CLI at the same embedded world:

```bash
PORT=3000 WORKFLOW_EMBEDDED_DATA_DIR=.workflow-data \
  pnpm workflow inspect --limit 5
```

Want to re-trigger the latest deployment? Use the run ID the `/api/test` response printed:

```bash
PORT=3000 WORKFLOW_EMBEDDED_DATA_DIR=.workflow-data \
  pnpm workflow start wrun_<id-from-previous-step>
```

All CLI commands respect those two environment variables, so keep them set whenever you want to interact with the prototype.

## 6. Manual HTTP testing (debugging only)

Need to bypass `/api/test` and talk to the workflow runtime directly? Reuse a real run ID and include the same headers the queue adapter attaches:

```bash
curl -v \
  -X POST http://127.0.0.1:3000/.well-known/workflow/v1/flow \
  -H "content-type: application/json" \
  -H "x-vqs-queue-name: __wkf_workflow_workflows/hello.ts//hello" \
  -H "x-vqs-message-id: msg_debug_1" \
  -H "x-vqs-message-attempt: 1" \
  --data '{"runId":"wrun_..."}'
```

Swap the queue name and payload if you want to replay a step (`/.well-known/workflow/v1/step`). Missing headers will be rejected by the embedded queue adapter.

## 7. Resetting between runs

Stop the server (`Ctrl+C`) and remove generated data if you need a clean slate:

```bash
rm -rf .well-known workflow-data dist
```

Then repeat from step 2.
