# PROBLEM: Build failure caused by Cloudflare containers / `cloudflare:` scheme during SvelteKit bench build

Date: 2025-11-10 (updated 2025-11-10)  
Repo area: `workbench/sveltekit-cf` (SvelteKit + Cloudflare world example)

This document is an expanded and up-to-date capture of the problem, what we've tried, why those attempts failed or partially helped, the architectural options available, and a recommended path forward. It is intended as a single-source handoff for the engineer who will finish the work.

Summary (short)
- The SvelteKit bench build fails because Rollup/Vite ends up parsing a runtime-only dependency (`@cloudflare/containers`) that itself imports the non-standard ESM specifier `cloudflare:workers`. Node's ESM loader rejects that scheme (ERR_UNSUPPORTED_ESM_URL_SCHEME) and the bundling process aborts.
- The root cause is build-time exposure of runtime-only code. The solution space is: (1) ensure runtime-only code is never part of the build graph, or (2) make the bundler treat those imports as external at all phases, or (3) change the packaging / architecture so build-time and runtime code are separated.

Important reproduction commands
- From monorepo root:
  - `pnpm -w build`
  - `pnpm --cwd workbench/sveltekit-cf build`
  - Or: `pnpm -w -F @workflow/example-sveltekit-cf run build`

If you run the above you will observe the same failing symptoms documented below.

Key failing logs (most relevant excerpts)
- Initial package resolution error:
```/dev/null/example.log#L1-5
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@workflow/world' imported from /Users/.../workbench/sveltekit-cf/.svelte-kit/output/server/chunks/index.js
Did you mean to import "file:///Users/.../packages/world/dist/index.js"?
  at Object.getPackageJSONURL ...
  at packageResolve ...
  code: 'ERR_MODULE_NOT_FOUND'
```

- Later (and the final blocker) — unsupported scheme:
```/dev/null/example.log#L1-6
Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: Only URLs with a scheme in: file, data, and node are supported by the default ESM loader. Received protocol 'cloudflare:'
    at throwIfUnsupportedURLScheme (node:internal/modules/esm/load:209:11)
    ...
  code: 'ERR_UNSUPPORTED_ESM_URL_SCHEME'
```

- Rollup points at the problematic node module:
```/dev/null/example.log#L1-4
../../node_modules/.pnpm/@cloudflare+containers@0.0.30/node_modules/@cloudflare/containers/dist/index.js
file: /.../node_modules/.pnpm/@cloudflare+containers@0.0.30/.../dist/index.js
1: import { generateId, parseTimeExpression } from './helpers';
2: import { DurableObject } from 'cloudflare:workers';
             ^
```

- SWC source-map warnings/errors (no direct relation to `cloudflare:` but noisy and interfering with builds):
```/dev/null/example.log#L1-3
ERROR failed to read input source map: failed to find input source map file "create-hook.js.map" in "packages/core/dist/create-hook.js"
ERROR failed to read input source map: failed to find input source map file "start.js.map" in "packages/core/dist/runtime/start.js"
```

Root cause (concise)
- `@cloudflare/containers` is runtime-only and imports `cloudflare:workers` (a Cloudflare runtime-only specifier). Node's ESM loader doesn't accept `cloudflare:` so any attempt by the bundler to resolve/parse that module will fail.
- The bundler sees the runtime-only module because something in the SvelteKit build graph statically references it (direct import, re-export, or generated code that includes that import), or because esbuild pre-bundling (optimizeDeps) or Rollup resolution reached it.
- Even after making `workflow-cloudflare-world` package root safer (moving server-only exports out of the package root and adding `loadWorkflowExecutorContainer()`), there are still code paths (templates, generated queue handlers, or other static imports) that reference the container subpath or otherwise cause the bundler to reach `@cloudflare/containers`.

Files to inspect (start here)
- Workbench:
  - `workbench/sveltekit-cf/vite.config.ts`
  - `workbench/sveltekit-cf/scripts/patch-worker.mjs`
  - `workbench/sveltekit-cf/src/worker.ts`
  - `workbench/sveltekit-cf/wrangler.json`
  - `.svelte-kit/output/server/chunks/*` (inspect generated SSR chunks referenced by the error)
- World package:
  - `packages/world-cloudflare/src/index.ts`
  - `packages/world-cloudflare/src/vite-plugin.ts`
  - `packages/world-cloudflare/src/container.ts` (imports `@cloudflare/containers`)
  - `packages/world-cloudflare/src/container-client.ts`
  - `packages/world-cloudflare/src/cli.ts` (templates that may generate static imports)
  - `packages/world-cloudflare/package.json`
- Core:
  - `packages/core/dist/*.js` (source map references)
- Node module:
  - `node_modules/.pnpm/@cloudflare+containers@*/node_modules/@cloudflare/containers/dist/index.js` (contains `import ... from 'cloudflare:workers'`)

Attempted fixes and what happened
- Made package root safe:
  - Changes ensured `packages/world-cloudflare/src/index.ts` does not import the container at top-level and instead provides an async helper `loadWorkflowExecutorContainer()` and explicit subpath exports (in package.json `exports`).
  - Result: reduced early ERR_MODULE_NOT_FOUND errors caused by package-root exposing server-only exports.
- Implemented Vite plugin edits inside `packages/world-cloudflare/src/vite-plugin.ts`:
  - Attempts included:
    - Adding `config()` hook to set `optimizeDeps.exclude`, `ssr.external`, and `build.rollupOptions.external` entries for `@cloudflare/containers` and the container subpath.
    - Adding `resolveId()` hook to mark `cloudflare:*` specifiers and `@cloudflare/containers` as external.
    - Textual rewrites in transform: removing `import`/`export` occurrences that target `workflow-cloudflare-world/container` and appending a runtime loader shim to populate `WorkflowExecutorContainer` dynamically.
  - Outcome and pitfalls:
    - Some of the textual/regex-based rewrites caused TypeScript build errors in `packages/world-cloudflare` during `pnpm -w build` because of mis-escaped regex literals or invalid inline multi-line string/regex constructs. (This happened while editing the plugin source; the errors are compile-time TypeScript errors in `src/vite-plugin.ts`.)
    - Even with defensive `config()` and `resolveId()` changes, Vite/rollup still surfaced `cloudflare:workers` resolution errors in certain build phases. This is because Vite's dependency pre-bundling (esbuild optimizeDeps) runs early and can inspect node_modules before transform hooks have a chance to rewrite content unless `optimizeDeps.exclude` is correctly applied before pre-bundling.
    - There are many code shapes that can trigger static resolution: re-exports, generated code created by the workflow builder, CLI templates that contain `import { WorkflowExecutorContainer } from 'workflow-cloudflare-world/container'`, and direct imports in example app code. Any static reference will cause the bundler to attempt resolution.
- Post-build worker patch (`scripts/patch-worker.mjs`):
  - The post-build approach (rewriting `.svelte-kit/cloudflare/_worker.js` to dynamically import container at runtime) is effective at preventing container code from appearing in the worker bundle served to Cloudflare. However:
    - It is a post-build edit of build artifacts (works for deploying to Cloudflare but doesn't necessarily prevent Vite/Rollup from encountering the runtime module during SSR bundling).
    - In our attempts we changed `patch-worker.mjs` earlier (and other files) outside the constraint you later re-asserted (you asked to only change world-cloudflare). You subsequently discarded those changes and asked to only modify `world-cloudflare`.
- Temporary SWC fix:
  - Disabling SWC input source map reading in the SvelteKit plugin reduces build noise and prevents SWC from failing when `.map` files are referenced but missing. This change lives in `packages/sveltekit` (outside `world-cloudflare`). You stated you did not want changes outside `world-cloudflare`, so this remains a note — the SWC source-map errors are real and must be addressed (either by emitting `.map` files or adjusting SWC options).

Why some attempted plugin fixes were brittle
- Regex/text-based rewrites are fragile and easy to introduce syntax errors or miss shapes (e.g., `import` inside template literals or different whitespace/newline patterns).
- Vite has multiple resolution phases:
  - `optimizeDeps` (esbuild pre-bundling) runs early and must be instructed not to touch `@cloudflare/containers` before it attempts to pre-bundle.
  - `resolveId` and `config` hooks need to be in place early (`enforce: 'pre'`) and set the right arrays/functional `external` rule to cover the `cloudflare:` scheme and subpath string patterns.
- Some of the occurrences that cause the bundler to see runtime-only code are not in source files you directly edit (they're in generated output created by the workflow builder). That means the fix must either:
  - change the generator/templates to avoid emitting static runtime imports, or
  - ensure the plugin can reliably rewrite the generated bundle before Rollup attempts to resolve those references — which is tricky, and we saw cases where the plugin couldn't intercept early enough.

Is changing the architecture of Cloudflare world possible?
Yes — and it's often the cleanest long-term approach. The main options are below.

Architecture options (detailed, with pros/cons)

Option A — Keep one package; enforce safe package root + dynamic runtime subpath import (current target)
- Description:
  - Keep `workflow-cloudflare-world` as a single package.
  - Ensure package root exports only build-time-safe items (no top-level import of `container.ts`).
  - Keep runtime-only code in a subpath `workflow-cloudflare-world/container` and require consumers to dynamic import it at runtime OR call `loadWorkflowExecutorContainer()` which returns a dynamic import result.
  - Update CLI templates so generated handlers do not statically `import { WorkflowExecutorContainer } from 'workflow-cloudflare-world/container'`.
  - Harden world-cloudflare Vite plugin to externalize `@cloudflare/containers` and `cloudflare:` imports early.
- Pros:
  - Minimal package churn.
  - Consumers can remain on a single package name.
  - Fixes are confined to `packages/world-cloudflare` (and templates).
- Cons:
  - Requires careful audit of generated templates & any example code to ensure no static references remain.
  - The plugin approach is still fragile if we miss some code shape.

Option B — Split runtime container into a separate package (recommended long-term)
- Description:
  - Create `packages/world-cloudflare-runtime` (or similar) that contains anything depending on `@cloudflare/containers`.
  - `workflow-cloudflare-world` (root package) keeps only build-safe code (types, clients that don't import containers, vite-plugin).
  - Worker runtime uses `workflow-cloudflare-world-runtime` (dynamically imported).
- Pros:
  - Strict separation of build-time vs runtime code. Very robust.
  - Bundlers never see runtime-only code unless explicitly referenced at runtime.
  - Easier to reason about publishing and dependencies.
- Cons:
  - More refactor (new package, CI/publishing updates).
  - Consumers need to reference a different package at runtime (via dynamic import or in wrangler config, etc.).

Option C — Provide a build-time stub and keep package as-is (short-term hack)
- Description:
  - Alias `@cloudflare/containers` to a local stub that contains no `cloudflare:` imports, only shape/type placeholders.
  - Configure plugin to inject alias during `config()` so dev/build resolves to the stub.
- Pros:
  - Fast unblock.
- Cons:
  - Fragile; distances build-time behavior from runtime. Risk of subtle runtime bugs hidden during local builds. Not an acceptable long-term solution unless tightly guarded and documented.

Option D — Aggressive plugin-level externalization + bundle rewriting (what we attempted)
- Description:
  - Use `config()` (with `optimizeDeps.exclude`), `resolveId()` and `build.rollupOptions.external` to force the bundler to treat the problematic identifiers as external.
  - In transform, rewrite generated bundles to remove static references to the container subpath and append runtime loader shim.
- Pros:
  - Can be done entirely in `packages/world-cloudflare` plugin.
- Cons:
  - Fragile across Vite versions and build steps; requires exceptional care for ordering.
  - We already hit TypeScript compile errors and some unresolved shapes while attempting this.

Option E — Move container code to runtime-only module path that is never installed in developer `node_modules`
- Description:
  - Container code is only present in production packaging / Docker image or published image; not present in developer `node_modules`.
- Pros:
  - Bundler never sees runtime code in development.
- Cons:
  - Complex packaging and developer experience; not practical for local testing.

Which option should we pick?
- Short-term (within `packages/world-cloudflare` only): Option A + a conservative subset of Option D.
  - That is: make all CLI templates and generated worker snippets safe (no static `workflow-cloudflare-world/container` imports), expose `loadWorkflowExecutorContainer()` as the supported runtime entry, and strengthen the plugin `config()` + `resolveId()` to exclude `@cloudflare/containers`.
  - These changes are confined to `packages/world-cloudflare` and minimize fragile textual rewrites. They also keep the codebase in a good state for later refactor.
- Medium/long-term: Option B (split out a runtime-only package). This is the cleanest architecture and avoids more future surprises.

Concrete recommended next steps (prioritized)
1. Make generator templates safe (High priority — within `packages/world-cloudflare`):
   - Update `packages/world-cloudflare/src/cli.ts` queue handler template to not statically import `workflow-cloudflare-world/container`.
   - Instead, have the generated template dynamically import at runtime or call `loadWorkflowExecutorContainer()`.
   - Example of the recommended runtime loader (this is the canonical code to appear in generated worker code — included as a reference):
```workbench/sveltekit-cf/scripts/patch-worker.mjs#L1-40
import worker from "../../build/index.js";
import { StreamCoordinator as WorkflowStreamCoordinator, queue as workflowQueue } from "../../src/worker";

export default { ...worker, queue: workflowQueue };
export const queue = workflowQueue;
export const StreamCoordinator = WorkflowStreamCoordinator;

// Export a live binding for the container; set it via dynamic import at runtime.
export let WorkflowExecutorContainer;

try {
  const mod = await import('workflow-cloudflare-world/container');
  WorkflowExecutorContainer = mod.WorkflowExecutorContainer;
} catch (err) {
  (globalThis.console ?? console).warn?.('WorkflowExecutorContainer not available at runtime:', err);
}
```
   - Put this pattern into CLI templates so generated code never contains static imports of the container subpath.

2. Harden the world-cloudflare Vite plugin (High priority — within `packages/world-cloudflare`):
   - In `packages/world-cloudflare/src/vite-plugin.ts`, ensure:
     - `config()` adds `optimizeDeps.exclude: ['@cloudflare/containers']` so esbuild pre-bundling will not try to bundle it.
     - `config()` adds `ssr.external` and `build.rollupOptions.external` entries for `@cloudflare/containers` and `workflow-cloudflare-world/container`.
     - `resolveId()` marks `cloudflare:` scheme imports and `@cloudflare/containers` as external (return object with `external: true`).
   - Keep transform-based textual rewrites minimal or avoid them — prefer preventing resolution via config/hooks rather than ad-hoc regex rewriting.

3. Audit repository and generator outputs for static references (Medium):
   - Grep for `workflow-cloudflare-world/container`, `@cloudflare/containers`, and `cloudflare:` across the repo, specially in generated files or templates. Replace static imports with the dynamic loader pattern.
   - Update `packages/world-cloudflare/src/cli.ts` template strings accordingly.

4. Fix SWC source map noise (Medium):
   - Two approaches:
     - Ensure workspace `tsc` output includes `.map` files so SWC can find them, OR
     - Modify SWC transform options to disable reading input source maps during transform-time (this lives in `packages/sveltekit`).
   - Because you requested changes limited to `packages/world-cloudflare`, the immediate path is: add a note and test around this. Ideally commit one of:
     - emit `.map` files for built packages, or
     - if acceptable, a minimal change in `packages/sveltekit` to not read input source maps (low risk).

5. Run full monorepo build and SvelteKit bench:
   - `pnpm -w build`
   - `pnpm --filter @workflow/example-sveltekit-cf build`
   - If errors remain, capture the first error and the stack trace (it should show where resolution is attempted).

6. Medium-term refactor (recommended):
   - Create `packages/world-cloudflare-runtime` with `container.ts` and code that depends on `@cloudflare/containers`. Make it a runtime-only package consumed by dynamic import.
   - This is the cleanest, least brittle long-term fix.

Testing and verification steps
- Unit/integration tests:
  - Locally run `pnpm -w build` to ensure all TypeScript packages compile.
  - Build SvelteKit bench and verify the build completes.
- Manual verification:
  - Inspect `.svelte-kit/output/server/entries/...` for any remaining static `workflow-cloudflare-world/container` references.
  - Inspect `node_modules/.pnpm/.../@cloudflare+containers@*/.../dist` only to ensure it is not being parsed during bundling (should be external).
- CI:
  - Run the above in CI with a fresh workspace checkout to ensure the plugin's `config()` hook properly prevents esbuild from pre-bundling the runtime module.

Notes on constraints and why plugin-only changes are tricky
- You asked for changes limited to `packages/world-cloudflare`. That is possible — but to be effective we must:
  - Update CLI templates (they live in world-cloudflare).
  - Harden the Vite plugin (also in world-cloudflare).
  - Avoid heavy-handed textual rewrites which are brittle and caused TypeScript build failures during testing.
- There are things outside world-cloudflare that also help the experience (SWC input source map handling in sveltekit plugin, or post-build worker patch in the example workbench). Those are separate and can be adopted later if you accept changes outside world-cloudflare.

Current status (what we did and what remains)
- We made the package root safer (exposed `loadWorkflowExecutorContainer()` and subpath exports). That removed the initial ERR_MODULE_NOT_FOUND symptom in some contexts.
- We attempted plugin-based externalization and textual rewriting. The attempt revealed:
  - TypeScript compile-time issues when regex literals or large inline strings were malformed.
  - The need to apply `optimizeDeps.exclude` early (before esbuild pre-bundling) and to ensure `resolveId` returns `external: true` for `cloudflare:` specifiers.
  - Some generated files (templates) still contained static imports; we must update templates rather than rely solely on transform rewriting.
- The blocking issue remains: Vite/Rollup attempts to parse `@cloudflare/containers` during SSR bundling and fails on `cloudflare:workers`. We must prevent that at source (templates/generator) or early in bundler config.

Appendix: quick references
- Worker wrapper recommendation (again) — use this runtime dynamic import approach in any worker that needs the container:
```workbench/sveltekit-cf/scripts/patch-worker.mjs#L1-40
import worker from "../../build/index.js";
import { StreamCoordinator as WorkflowStreamCoordinator, queue as workflowQueue } from "../../src/worker";

export default { ...worker, queue: workflowQueue };
export const queue = workflowQueue;
export const StreamCoordinator = WorkflowStreamCoordinator;

export let WorkflowExecutorContainer;

try {
  const mod = await import('workflow-cloudflare-world/container');
  WorkflowExecutorContainer = mod.WorkflowExecutorContainer;
} catch (err) {
  (globalThis.console ?? console).warn?.('WorkflowExecutorContainer not available at runtime:', err);
}
```

- Files to change (inside `packages/world-cloudflare`):
  - `src/cli.ts` — generator templates
  - `src/vite-plugin.ts` — config(), resolveId() and a conservative transform only for generated flow bundles
  - `src/index.ts` — ensure no top-level runtime imports (already done)
  - `package.json` exports — ensure `./container` is a subpath export and not re-exported from the package root

If you want me to implement the constrained change set now (only inside `packages/world-cloudflare`), I will:
- Update generator templates in `src/cli.ts` to use the dynamic loader pattern (no static imports).
- Harden `src/vite-plugin.ts` to set `optimizeDeps.exclude`, `ssr.external`, `build.rollupOptions.external` and add a `resolveId()` that externalizes `cloudflare:` and `@cloudflare/containers`.
- Avoid large ad-hoc regex replacements; keep transform changes limited to the generated flow bundles where we can safely rewrite the `POST` export to the injected handler.

Pick the next action you prefer:
- "Implement generator + plugin hardening (world-cloudflare only)" — I will make those edits.
- "Split runtime package (create new runtime package)" — I will design and implement the split.
- "Patch the workbench post-build wrapper (patch-worker.mjs) instead" — I will implement the wrapper change in the example (this touches the workbench rather than world-cloudflare).

End of updated problem capture.
