# Cloudflare World Deployment – Known Issues & Workarounds

This repository hit a number of Cloudflare-specific issues while wiring the Workflow DevKit into a SvelteKit Worker. The list below documents each technically relevant blocker, the underlying cause, and how we addressed (or mitigated) it.

## 1. Wrangler Entry Point Must Be the Patched `_worker.js`
- **Symptom:** Deployments failed with “StreamCoordinator not exported” or “queue handler missing”.
- **Cause:** `@sveltejs/adapter-cloudflare` generates `.svelte-kit/cloudflare/_worker.js`, but the Workflow queue handler lives in `build/index.js` unless we patch it. Pointing `wrangler.json.main` at `build/index.js` dropped the extra exports.
- **Resolution:** Always run `pnpm build` (which executes `scripts/patch-worker.mjs`) and set `"main": ".svelte-kit/cloudflare/_worker.js"` so Wrangler uploads the patched bundle that re-exports `StreamCoordinator` + `queue`.

## 2. Queue Consumer Wiring Requires Post-Build Patch
- **Symptom:** Cloudflare Queues provisioning failed with “Queue handler is missing (code 11001)”.
- **Cause:** SvelteKit’s adapter doesn’t know about Workflow’s queue consumer. Wrangler only sees the default fetch export unless we manually add `export const queue` and `export const StreamCoordinator`.
- **Resolution:** `scripts/patch-worker.mjs` overwrites `.svelte-kit/cloudflare/_worker.js` after every build to merge the fetch handler with Workflow’s queue/DO exports. Deployments must run the build first; otherwise queues cannot attach.

## 3. Missing Node Built-ins Without `nodejs_compat`
- **Symptom:** `wrangler deploy` failed to resolve `child_process`, `fs`, `path`, etc.
- **Cause:** SvelteKit’s SSR bundle still references Node built-ins (via Workflow tooling and adapters). Cloudflare Workers only provide those APIs when `nodejs_compat` (v1) is enabled.
- **Resolution:** Add `"compatibility_flags": ["nodejs_compat"]` in `wrangler.json`. Without it, the Worker won’t bundle.

## 4. WeakRef / FinalizationRegistry Crashes on Import
- **Symptom:** Simply importing `workflow-cloudflare-world` threw `ReferenceError: WeakRef is not defined` (and later `FinalizationRegistry`).
- **Cause:** `@workflow/core` always bundles `@workflow/world-local`, which depends on `undici`. Undici instantiates `WeakRef`/`FinalizationRegistry` at module load, but Cloudflare’s runtime (and Miniflare) omit those globals.
- **Resolution:** Added runtime polyfills in `packages/world-cloudflare/src/polyfills.ts` so the package safely polyfills both APIs before re-exporting anything. Consumers no longer need to patch their apps.

## 5. Embedded Serializer Uses `eval`
- **Symptom:** `POST /api/trigger` returned “Failed to serialize workflow arguments” with a nested `EvalError: Code generation from strings disallowed for this context`.
- **Cause:** `dehydrateWorkflowArguments` in `@workflow/core` dynamically builds helper functions via `new Function` when serializing complex types. Cloudflare Workers forbid string-based code generation, so the serializer explodes even for otherwise valid inputs.
- **Resolution:** **Open issue.** Until the core runtime provides an eval-free code path (or detects the environment), avoid passing types that trigger the advanced serializer (stick to JSON-safe primitives) when running on Cloudflare.

---

Keep this document up to date as new Cloudflare-specific edge cases arise, so future work on the world implementation can target the right layer (package vs. app) when fixing them.
