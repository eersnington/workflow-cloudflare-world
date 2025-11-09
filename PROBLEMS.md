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
- **Cause:** `@workflow/workflow` hard-depends on `@workflow/world-local`, which drags in Undici. Undici instantiates `WeakRef`/`FinalizationRegistry` during module evaluation, but Cloudflare Workers (and Miniflare) do not ship those globals.
- **Resolution:** `packages/world-cloudflare/src/polyfills.ts` now polyfills both APIs before anything else runs, so the world package can coexist with the core bundle without requiring every consumer Worker to add its own shim. Long term the core package should avoid bundling the local world into Cloudflare builds, but the repo-level polyfill unblocks us for now.

## 5. Embedded Serializer Uses `eval`
- **Symptom:** `POST /api/trigger` returns “Failed to serialize workflow arguments” with a nested `EvalError: Code generation from strings disallowed for this context` even when passing primitive arguments like `2`.
- **Cause:** `packages/core/src/serialization.ts` uses a `revive()` helper (`lines 192-199`) that does `(0, eval)(...)` on every `devalue.stringify()` result. `dehydrateWorkflowArguments()` (line ~751) calls that path for every workflow trigger. Cloudflare Workers forbid any string-based code generation, so the serializer explodes before the workflow even enqueues.
- **Resolution:** **Still open.** There is no app-level workaround other than “only send JSON-safe primitives and hope they never hit the eval path”. The real fix has to land in the core package (replace the eval-based revive logic with a Worker-safe parser or gate the advanced serializer behind a feature flag).

## 6. Queue Consumer Used Vercel’s JsonTransport
- **Symptom:** Earlier iterations imported `JsonTransport` from `@vercel/queue` inside `packages/world-cloudflare/src/queue.ts`, which meant Workers were bundling Vercel-only runtime code just to read queue payloads.
- **Cause:** The initial Cloudflare world piggybacked on the Vercel webhook transport to deserialize queue bodies, even though the actual queue producer already used native Cloudflare bindings.
- **Resolution:** Replaced the consumer with Cloudflare-native logic: messages are now sent with `cfQueue.send(..., { contentType: 'json' })` and read via `Request.json()`. This drops the Vercel dependency, keeps the Worker bundle CF-only, and eliminates an extra deserialization hop. Wrangler queue bindings now work without any third-party helpers.

---

Keep this document up to date as new Cloudflare-specific edge cases arise, so future work on the world implementation can target the right layer (package vs. app) when fixing them.
