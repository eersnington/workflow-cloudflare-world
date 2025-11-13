# problems.md

THis is the logs of problems that I've faced while building a "world-cloudflare" and "workflow" bindings for apps hosted on workers.

1. wrangler main export missing queue/DO
- symptom: deploy failed with “queue handler missing” / “StreamCoordinator not exported”
- cause: adapter uploaded default `_worker.js` without workflow queue exports
- fix: always run `pnpm build` (executes patch script) and point wrangler at `.svelte-kit/cloudflare/_worker.js`
```toml
# wrangler.toml
main = ".svelte-kit/cloudflare/_worker.js"
```

2. static imports pulled node-only deps into worker
- symptom: bundler hit `cloudflare:` scheme and died, later `unicorn-magic` esm errors
- cause: world runtime files were statically imported during build
- fix: lazy-load container code, patch `npm-run-path` to use namespace import
```js
// npm-run-path patch
const unicorn = require('unicorn-magic');
const { toPath } = unicorn;
```

3. durable objects had to exist synchronously
- symptom: `Uncaught TypeError: ExportedHandler missing members` during wrangler dev
- cause: exported DO classes were defined via async loader, leaving `undefined` at evaluation
- fix: export placeholder classes synchronously, then hot-swap in initializer
```js
export class WorkflowExecutorContainer {}
(async () => {
  const real = await load();
  Object.assign(WorkflowExecutorContainer, real.WorkflowExecutorContainer);
})();
```

4. relative dynamic import broke in temp worker dir
- symptom: `Error: No such module "../../src/worker"` inside dev temp path
- cause: dynamic import used relative path to repo source; wrangler copies compiled bundle elsewhere
- fix: resolve URL via `new URL('./worker.js', import.meta.url)` within bundled output

5. serializer + vm stack incompatible with workers
- symptom: `/api/trigger` threw `EvalError` and later `vm.runInContext` missing
- cause: workflow runtime uses `eval` + `node:vm`; workers forbid both
- fix: move workflow execution into cloudflare container runtime, leave worker to proxy steps/hooks only

6. bindings plugin still lets `workflow/api` slip through
- When `/api/trigger` runs in the deployed Worker it crashes with `ReferenceError: WeakRef is not defined`.
- The Worker bundle still includes the entire `@workflow/world-local` package; the dry-run build at `dist/index.js` shows the queue/fs/storage/streamer code from that package and no virtual shim.
- `pnpm run dev` only runs the Node server version, so the crash never appears there.
- `pnpm wrangler dev` keeps rebuilding until it throws “manifest-full.js not found.”
- Files I looked at: `packages/workflow-cloudflare-bindings/src/vite-plugin.ts`, `workbench/svelte-cf/svelte.config.js`, `workbench/svelte-cf/src/hooks.server.ts`, `workbench/svelte-cf/src/routes/api/trigger/+server.ts`, `dist/index.js` from the dry-run build, and the logs under `~/Library/Preferences/.wrangler/logs/` that contain the WeakRef stack trace.


```ts
// todo in plugin config()
optExcludes.push('workflow/api', '@workflow/core/api');
```

```bash
➜  svelte-cf git:(cloudflare-world) ✗ pnpm wrangler tail

 ⛅️ wrangler 4.47.0
───────────────────
Successfully created tail, expires at 2025-11-13T11:37:28Z
Connected to workflow-svelte-cf-app, waiting for logs...
POST https://workflow-svelte-cf-app.******.workers.dev/api/trigger - Ok @ 11/13/2025, 12:10:36 PM
  (error)
[500] POST /api/trigger
ReferenceError: WeakRef is not defined
    at module.exports (index.js:45380:16)
    at ../../node_modules/.pnpm/undici@6.22.0/node_modules/undici/lib/web/fetch/request.js (index.js:45394:87)
    at __require2 (index.js:12:50)
    at ../../node_modules/.pnpm/undici@6.22.0/node_modules/undici/lib/web/fetch/index.js (index.js:46106:47)
    at __require2 (index.js:12:50)
    at ../../node_modules/.pnpm/undici@6.22.0/node_modules/undici/index.js (index.js:51567:21)
    at __require2 (index.js:12:50)
    at ../../node_modules/.pnpm/@workflow+world-local@4.0.1-beta.6_@opentelemetry+api@1.9.0/node_modules/@workflow/world-local/dist/queue.js (index.js:51744:29)
    at __init (index.js:9:56)
    at ../../node_modules/.pnpm/@workflow+world-local@4.0.1-beta.6_@opentelemetry+api@1.9.0/node_modules/@workflow/world-local/dist/index.js (index.js:52569:5)
```
