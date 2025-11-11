# Cloudflare World — Problems & Solutions (Re-architecture Plan)

This document summarizes the problems discovered while integrating Workflow DevKit with Cloudflare Workers, lists their root causes, and proposes a concrete re-architecture and migration plan. It is intended to be a single-source reference for implementing a safe, maintainable split between Worker-safe bindings and a separately-hosted Cloudflare runtime (container) that executes workflows.

---

## Executive summary

- Problem: The current `world-cloudflare` package mixes two very different concerns:
  1. Worker-safe build-time / runtime bindings (Vite transformer, light container-client).
  2. Node/container-only workflow executor (VM-based code depending on `node:vm`, `@cloudflare/containers`, Docker, etc).

  This causes build-time bundlers and `wrangler dev` to attempt to resolve Node-only or `cloudflare:` scheme dependencies and leads to runtime failures (e.g., `vm.runInContext` not available, `eval` disallowed, “unsupported ESM URL scheme cloudflare:”, Durable Object startup crashes).

- Goal: Re-architect so that:
  1. The workflow execution engine runs in a user-hosted, Node-capable environment (Cloudflare Containers or any Node host) — a separate package the user deploys.
  2. The Worker-side project installs only a small, Worker-safe bindings package (Vite plugin + container client) that forwards workflow execution requests to the hosted engine.
  3. The `@workflow/world` interface remains the contract; implementations are split between server-side engine and Worker-side bindings.

---

## Problems (with root cause and evidence)

1. Build-time resolution of runtime-only packages
   - Symptom: `ERR_UNSUPPORTED_ESM_URL_SCHEME: cloudflare:` and bundling errors during `vite`/`wrangler`.
   - Cause: imports of runtime-only modules (`@cloudflare/containers`, `cloudflare:workers`) are reachable from the package root or by static import during build.
   - Evidence: `world-cloudflare/src/container.ts` dynamically imports `@cloudflare/containers` and `vite-plugin.ts` had to externalize `cloudflare:` scheme. The package root still re-exports runtime helpers.

2. Attempting to execute workflows in Cloudflare Workers
   - Symptom: runtime failure: `vm.runInContext is not implemented` or `ReferenceError: WeakRef is not defined`.
   - Cause: `@workflow/core` expects Node `vm` sandboxing and other Node built-ins; Workers do not provide `node:vm` nor some globals.
   - Evidence: `packages/core/src/vm` and `container.ts` use `runInContext`, seedrandom, and deterministic shims.

3. `eval` and serializer usage
   - Symptom: Worker errors like `EvalError: Code generation from strings disallowed for this context` when serializing/deserializing workflow inputs.
   - Cause: core serializer uses `eval`-based revive logic (used by `devalue`/revive flows). Workers forbid string code generation.
   - Evidence: `packages/core/src/serialization.ts` tests and implementation rely on `eval`+`runInContext` revives.

4. Durable Object (DO) export & `wrangler dev` startup crash
   - Symptom: `workerd` crash complaining DO exported constructor is undefined.
   - Cause: DO classes must be exported synchronously at worker evaluation. A dynamic wrapper that leaves exports undefined at startup causes a crash.
   - Evidence: `cli.ts` scaffolds DO binding `WorkflowExecutorContainer`; prior attempts to lazy-load the class caused workerd to see undefined.

5. Container-per-world / provisioning model
   - Symptom: current scaffolding suggests `WorkflowExecutorContainer` might be provisioned per world/run which is inefficient.
   - Cause: deployment config or default scaffolding chooses container instances or DO bindings incorrectly.
   - Evidence: `CONTAINER_DEVELOPMENT.md`, `cli.ts` contain container config; `createWorkflowExecutorContainerClass()` uses container semantics.

6. Accidental import surface
   - Symptom: consumer app installs `workflow` but pulls in `world-cloudflare` runtime code during build.
   - Cause: package naming and exports mix runtime and build-time artifacts; imports from `workflow`/`workflow-cloudflare-world` root can cause transitive runtime-only includes.
   - Evidence: `world-cloudflare/src/index.ts` re-exports both safe and runtime helpers and tries to set global defaults — this invites accidental import.

---

## High-level solution

Split concerns into three package roles and ensure each has a clear boundary:

1. `world-cloudflare-app` (runtime-only, user-hosted)
   - Purpose: The authoritative workflow engine that executes workflows and optionally hosts Durable Objects for coordination.
   - Contains:
     - `container.ts`, `container-executor.ts`, any code requiring `node:vm`, `@cloudflare/containers`, seedrandom, etc.
     - Dockerfile, wrangler container configuration, DO classes exported synchronously for the runtime worker that registers them.
   - Deployed by the user to Cloudflare Containers (or other Node host). Exposes an HTTP `/execute` endpoint (and any management/admin endpoints) to run workflows in Node VM contexts.

2. `workflow-cloudflare-bindings` (Worker-safe)
   - Purpose: Lightweight package installed by app authors (the Worker/SvelteKit app). It contains only Worker-friendly code.
   - Contains:
     - `vite-plugin.ts` (transformation that injects forwarding `POST` handler into the Worker bundle).
     - `container-client.ts` — `execute(payload, env)` that does: DO namespace invocation OR service binding fetch OR POST to `WORKFLOW_EXECUTOR_URL`.
     - `index.ts` + helper `setupGlobalContainerClient(env)` to set `globalThis.__wf__container_client`.
   - Must NOT import `node:vm`, `@cloudflare/containers`, or other Node-only packages. Keep all imports Worker-compatible.

3. `@workflow/world` remains the interface contract
   - `world-cloudflare-app` implements the `World` interface server-side.
   - Worker bindings call `world-cloudflare-app` (via DO/service/URL) to obtain run/events state if needed.

---

## Concrete technical changes

1. Package split and renames
   - Create `workflow/packages/workflow-cloudflare-bindings` and move/copy only the Worker-safe files from current `world-cloudflare`:
     - `vite-plugin.ts` (or a copy adapted to new package)
     - `container-client.ts`
     - `index.ts` that exports plugin and setup helper
   - Rename `workflow/packages/world-cloudflare` -> `workflow/packages/world-cloudflare-app` (server runtime) and remove Worker-safe exports from its package root to avoid accidental imports.
   - Update `package.json` names and README for both packages.

2. Ensure the container is long-lived and multi-run
   - `world-cloudflare-app/container.ts` already handles `/execute`. Confirm Dockerfile and Wrangler container config provision one image that remains running and handles many `/execute` requests.
   - Adjust `wrangler` container config (`max_instances`, `sleepAfter`, pooling) so the deployment does not create one container per run.

3. Durable Objects placement
   - Keep DO classes (e.g., `StreamCoordinator`, `WorkflowExecutorContainer` if used as DO) inside `world-cloudflare-app` and export them synchronously from that runtime worker. Consumer Worker(s) should *not* re-export DO classes.

4. Worker bindings plugin deployment
   - Make the Vite transformer available from `workflow-cloudflare-bindings`.
   - The transformer must continue to:
     - externalize `@cloudflare/containers` + `cloudflare:` scheme during build,
     - replace generated `export const POST = workflowEntrypoint(...)` with forwarding handler that calls `globalThis.__wf__container_client.execute` or falls back to DO/service/URL.

5. Serialization & eval
   - Short-term mitigation:
     - Ensure Worker-side code only sends JSON-safe payloads (primitive inputs or structured JSON). Let the container perform complex revive/deserialize + runInContext.
   - Long-term action:
     - Replace eval-based revive in `@workflow/core/src/serialization.ts` with a Worker-safe approach or gate advanced revive behind a feature flag. This is a core package change and will require tests and careful compatibility considerations.

6. Global defaults and proxies
   - Remove any "magic" that sets `globalThis.__wf__container_client` to a Node/runtime client from the package root of a package that may be imported by Workers. Instead:
     - Worker runtime packages should set the global in their own worker entry or rely on `workflow-cloudflare-bindings.setupGlobalContainerClient(env)` at runtime.

7. CLI & scaffolding updates
   - Update CLI (`world-cloudflare-app/src/cli.ts`) to generate:
     - `wrangler` config + DO definitions for the **runtime** world project,
     - guidance and small snippet for consumer Worker showing how to use `workflow-cloudflare-bindings` plugin and how to either bind the runtime service or set `WORKFLOW_EXECUTOR_URL`.

---

## Migration plan & developer steps (recommended order)

1. Create `workflow-cloudflare-bindings` package (Worker-safe)
   - Copy/adapt `vite-plugin.ts` and `container-client.ts`.
   - Export `cloudflareWorkflowTransformer()` and `setupGlobalContainerClient(env)`.
   - Update docs and examples to use this package in the app's `vite.config`.

2. Rename `world-cloudflare` -> `world-cloudflare-app` and move runtime-only files
   - Move `container.ts`, `container-executor.ts`, `container-proxy.ts`, Dockerfile, wrangler config to the app package.
   - Ensure `world-cloudflare-app` package.json lists runtime-only deps (e.g., `@cloudflare/containers`) and documents deployment.

3. Update `workflow` package docs
   - Document that app authors should install `workflow` (public) + `workflow-cloudflare-bindings` (for Cloudflare) and must not import `world-cloudflare-app` in app code.

4. Update examples:
   - `workbench/sveltekit` and other example apps should use the new bindings package and not import runtime world.
   - Provide example `WORKFLOW_EXECUTOR_URL` env usage and DO binding example.

5. Fix or gate serializer in `@workflow/core`
   - Open separate change to reduce or remove eval-based revive for worker compatibility. This is a larger core change; it can be staged later, but plan for it.

6. Tests & verification
   - Unit test the Vite plugin behavior in the bindings package.
   - Integration test: deploy `world-cloudflare-app` to a dev container; configure example app to call it via `WORKFLOW_EXECUTOR_URL`; run queue messages and assert workflows run without `vm` errors in the Worker.

---

## Risks & mitigations

- Risk: Breaking API contracts between `@workflow/core` and `world` implementations when changing serialization or how worlds are invoked.
  - Mitigation: Keep `@workflow/world` interface unchanged; only change implementation and transport layers first. Add tests.

- Risk: Performance overhead by forwarding every workflow invocation over HTTP/DO to an external container.
  - Mitigation: Optimize transport (keep body minimal), reuse container instances, implement connection pooling, consider batching for step invocations.

- Risk: Serialization edge-cases causing failures when Worker sends payloads that require `eval`-based revive.
  - Mitigation: Short-term: send JSON-safe payloads only; long-term: core serializer changes.

---

## Next actions (short checklist)

- [ ] Add `workflow/packages/workflow-cloudflare-bindings` package with `vite-plugin.ts` and `container-client.ts`.
- [ ] Rename and repurpose `workflow/packages/world-cloudflare` → `workflow/packages/world-cloudflare-app` and move Node/runtime-only files there.
- [ ] Update CLI and README to produce separate artifacts: runtime world deployment and consumer Worker snippets.
- [ ] Add example for service binding and URL-based invocation.
- [ ] Open an issue / PR for `@workflow/core` serializer (remove eval or add worker-safe path).
- [ ] Add integration tests (container + Worker) to validate end-to-end execution.

---

## Notes / references (where to look in the repo)

- Worker-safe transformer and client:
  - `workflow/packages/world-cloudflare/src/vite-plugin.ts`
  - `workflow/packages/world-cloudflare/src/container-client.ts`

- Container & Node VM executor:
  - `workflow/packages/world-cloudflare/src/container.ts`
  - `workflow/packages/world-cloudflare/src/container-executor.ts`
  - `workflow/packages/world-cloudflare/Dockerfile`
  - `workflow/packages/world-cloudflare/CONTAINER_DEVELOPMENT.md`

- Core serializer and VM:
  - `workflow/packages/core/src/serialization.ts`
  - `workflow/packages/core/src/vm/*`

- World interface:
  - `workflow/packages/world/src/*` (queue, runs, storage interfaces)

---

## Plugin shim guidance & implementation notes

The following guidance describes a practical plugin-based strategy to guarantee Worker bundles never execute `dehydrate*`, `start()`, `workflowEntrypoint()` or other core/runtime functions that rely on `eval`/`node:vm`. This text should be appended to the re-architecture plan above so implementers know how to proceed when building the `workflow-cloudflare-bindings` package.

1) Goal
- Ensure every code path in the Worker that would otherwise invoke core serialization or VM-based runtime is replaced at build-time with a Worker-safe forwarder that calls the user-hosted world runtime. This should be enforced by the Vite plugin via two techniques:
  - rewriting generated entrypoints (the existing `cloudflareWorkflowTransformer` behavior), and
  - providing a virtual shim module that replaces imports of runtime entry paths with safe forwarders.

2) Virtual module shim (what the plugin must provide)
- Intercept imports for runtime entry IDs (for example: `workflow/runtime`, `'@workflow/core/runtime'`, or other public runtime paths).
- In the plugin's `resolveId()` hook return a virtual id (e.g., `virtual:workflow-remote-shim`) for those resolved names.
- In the plugin's `load()` hook return JS source for the virtual module. The source should:
  - Export safe forwarding implementations for `start`, `workflowEntrypoint`, `stepEntrypoint`, and any other functions that would call into core serialization/VM paths.
  - Export helpful erroring stubs for functions that cannot be proxied safely (e.g., `createWorld()`), with clear messages instructing authors to use bindings or the runtime service instead.
  - Re-export harmless utilities where possible via dynamic import (only when safe).

3) Rewriting generated `POST` handlers
- Keep and maintain `cloudflareWorkflowTransformer()` behavior that:
  - Detects generated bundles that contain `workflowCode` and `export const POST = workflowEntrypoint(workflowCode)`.
  - Replaces that export with a forwarding POST handler that:
    - parses the queue envelope,
    - optionally fetches run/events from a world factory if available,
    - builds a compact payload, and
    - calls `globalThis.__wf__container_client.execute(payload, env)` (or falls back to DO/service binding/URL).
- This guarantees queue consumers will never execute the VM in the Worker.

4) Worker runtime shim (what the virtual module exports)
- Provide functions that match the public runtime API shape but forward to the container client. Example behaviors:
  - `start(...)` — validate inputs are JSON-safe (or require staging), construct a payload, call `defaultContainerClient.execute(...)`.
  - `workflowEntrypoint(workflowCode)` — return an async handler that forwards the bundled `workflowCode` and metadata to the container for execution.
  - `stepEntrypoint(...)` — forward step invocations similarly.
- If more advanced semantics are needed (streams, Request/Response objects), require that the app pre-stage data (upload to R2 or a server-side endpoint) and pass handles to the container.

5) CI and lint safety nets
- Add a build-time check (simple grep or an ESLint rule) that fails CI if the built Worker bundle includes forbidden tokens or imports:
  - `dehydrateWorkflowArguments(`
  - `(0, eval)(`
  - `runInContext(`
  - `workflowEntrypoint(`
- This serves as an extra safety net against dynamic code-loading edge cases.

6) Developer workflow and templates
- Update codegen / CLI templates to:
  - Import the runtime shim from the bindings package (virtual id) rather than `@workflow/core` directly.
  - Encourage or enforce use of `startWorkflowRemotely` / the bindings API for app-level workflow triggers.
- Provide clear error messages and docs that explain how to stage complex inputs and why the binding exists.

7) Implementation checklist for the bindings package
- [ ] Implement `resolveId` and `load` to provide `virtual:workflow-remote-shim` for runtime import paths.
- [ ] Copy/adapt `cloudflareWorkflowTransformer()` and ensure it runs `enforce: 'pre'`.
- [ ] Implement `defaultContainerClient.execute()` (or reuse the existing client) and export `setupGlobalContainerClient(env)` for runtime.
- [ ] Export the runtime shim code as the virtual module source that uses `defaultContainerClient`.
- [ ] Add CI check to scan for forbidden strings in the final bundle.
- [ ] Update example apps (workbench) and docs to demonstrate how to add the plugin to `vite.config` and use the runtime shim instead of calling core runtime functions directly.

8) Important caveats
- The plugin approach secures static imports and normal build-time bundles processed by Vite/Rollup. It cannot fully prevent malicious or dynamic runtime code that uses unbounded dynamic import/eval to fetch the core runtime at runtime. Combine the plugin with CI checks, code reviews, and template updates to get strong practical guarantees.
- Complex types (streams, Request/Response, arbitrary objects) must be staged or uploaded to the world runtime before calling `start()` from a Worker. Provide clear docs and helper APIs for staging flows.

---

If you'd like, I can implement this plugin shim inside `workflow/packages/workflow-cloudflare-bindings` next:
- create the bindings package skeleton,
- implement the virtual module shim,
- include the `cloudflareWorkflowTransformer()` and `defaultContainerClient`,
- add a small CI check script to detect disallowed tokens in the built Worker bundle.

Which of those sub-steps would you like me to perform first?

---

## D) Completed: world-cloudflare package runtime cleanup (summary of changes)

I proceeded to implement the requested D) work: I updated the `world-cloudflare` package to make it safe as a runtime-only package and completed the following items. These changes have been applied to the repository and are documented below.

What I changed in `world-cloudflare` (completed)
- Removed runtime globals from the package root:
  - No longer sets `globalThis.__wf__create_world` or `globalThis.__wf__container_client` at module evaluation time. Global wiring now belongs to the Worker bindings (`workflow-cloudflare-bindings`) or to runtime app entrypoints.
- Removed build-time / Worker-safe exports from the package root:
  - Removed direct `vite-plugin` and `container-client` root exports from the package's published `exports` map so importing `workflow-cloudflare-world` in a Worker does not pull runtime-only files.
  - Kept the `container-proxy` export (for runtime use) and ensured the package root only exports artifacts intended for runtime apps (containers).
- Fixed a blocking TypeScript build error:
  - Removed an unused import that caused `tsc` to fail during workspace build.
- Added clear runtime-only documentation:
  - Updated `packages/world-cloudflare/README.md` with a clear "RUNTIME-ONLY" note instructing consumers not to install or import this package into Worker app bundles and to use `workflow-cloudflare-bindings` instead.
  - Added `packages/world-cloudflare/REARCHITECTURE.md` describing the re-architecture work, what was moved to bindings, and operational guidance for runtime deployment.
- Verified workspace build:
  - After the above changes, ran the workspace build. The previous blocking error (unused import / global side-effect) was resolved and the repository build completed successfully.

Why this fixes the core problem
- By ensuring `world-cloudflare` does not expose or set runtime globals or export Worker-safe utilities at the package root, we prevent accidental bundling of Node/VM/container code into Worker bundles during Vite/`wrangler` builds.
- Consumer Worker apps will now use the `workflow-cloudflare-bindings` package (Vite plugin + client) to forward execution to the runtime container, so `dehydrate*()` and `runInContext()` are executed only in the Node container runtime.

Files changed (high level)
- Modified:
  - `packages/world-cloudflare/src/index.ts` — removed global assignments and removed unused import.
  - `packages/world-cloudflare/package.json` — removed `./vite-plugin` and `./container-client` from top-level `exports` to avoid accidental import by consumer bundles.
  - `packages/world-cloudflare/README.md` — added an explicit RUNTIME-ONLY note and guidance pointing consumers to the bindings package.
- Added:
  - `packages/world-cloudflare/REARCHITECTURE.md` — summary of the re-architecture and migration notes.

Next recommended actions (you asked these to be done later)
- Keep the `workflow-cloudflare-bindings` plugin `// @ts-nocheck` for now; plan a typed refactor later to remove the pragma and bring plugin code to full TS lint/typing standards.
- When ready, add the `workflow/scripts/check-bundles-forbidden.sh` into CI as a post-build check to prevent regressions.
- I will wait for your confirmation before updating example apps (workbench) to use the new bindings package.

If you want, I can produce a concise PR-style changelog that lists the exact file diffs (line-level) applied in this D) work. Would you like that now?
