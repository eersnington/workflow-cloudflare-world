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
- symptom: deployed worker crashes on `WeakRef` from `@workflow/world-local`
- cause: Vite optimizer pre-bundles `workflow/api` before plugin rewrites, so local world code ships in worker
- current status: unresolved, need to exclude `workflow/api` from optimizeDeps/ssr/external so `resolveId` can redirect to `virtual:workflow-api-remote-shim`
```ts
// todo in plugin config()
optExcludes.push('workflow/api', '@workflow/core/api');
```
