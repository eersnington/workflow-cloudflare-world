# PROBLEM: `wrangler dev` fails with bundling and runtime errors
Repo area: `workbench/sveltekit`, `packages/world-cloudflare`

## Summary

`wrangler dev` and `wrangler build` consistently fail for the SvelteKit Cloudflare example app (`workbench/sveltekit`). The failures manifest in several ways, but they all stem from a core architectural conflict: the build process for an app hosted in a Worker (like the SvelteKit app) is attempting to process and bundle modules that are only intended for a different, incompatible runtime (the Cloudflare Containers runtime or a local Node.js dev environment).

The key issues are:

1.  **Bundling of Runtime-Only Code:** The build process tries to resolve and bundle Cloudflare-specific code (e.g., `@cloudflare/containers` which internally uses `cloudflare:` imports). This fails because the build environment (Node.js) does not support the `cloudflare:` protocol.
2.  **ESM/CJS Incompatibility:** The bundler (`esbuild` used by Wrangler) fails when it encounters transitive dependencies (e.g., `npm-run-path` -> `unicorn-magic`) with incompatible module formats (named ESM imports from a CJS-style default export).
3.  **Invalid Worker Startup for Durable Objects:** The Cloudflare Workers runtime (`workerd`) requires that exported Durable Object classes be synchronously available as valid constructors when the worker script is first evaluated. Dynamic loading strategies that populate these exports asynchronously cause a fatal startup crash.
4.  **Incorrect Runtime Module Paths:** In the local `wrangler dev` environment, the worker script runs from a temporary directory. Dynamic imports using relative paths that point to the original source tree (e.g., `../../src/worker`) fail because those files do not exist at that location.

## Key Failing Logs & Evolution of the Problem

The problem has manifested in four distinct phases as we attempted to fix it.

### Phase 1: Unsupported ESM URL Scheme (`cloudflare:`)

This was the initial and most persistent problem during the SvelteKit build (`vite build`).

- **Error:** `Error [ERR_UNSUPPORTED_ESM_URL_SCHEME]: ... Received protocol 'cloudflare:'`
- **Cause:** The SvelteKit SSR build graph included `packages/world-cloudflare/src/container.ts`, which statically imported `@cloudflare/containers`. This package, in turn, statically imports `cloudflare:workers`, which the Node.js ESM loader cannot resolve.
- **Why it was included:** Static imports in various places (`src/worker.ts`, the SvelteKit `+server.ts` route, and CLI-generated templates) created a dependency path for the bundler to find and attempt to process this runtime-only code.

### Phase 2: Bundling Errors in `wrangler build` (`unicorn-magic`)

After attempting to fix Phase 1 by making imports dynamic, `wrangler build` started failing with a different error.

- **Error:** `No matching export in "unicorn-magic/default.js" for import "toPath"`
- **Cause:** A transitive dependency (`npm-run-path@6.0.0`) used named ESM imports from `unicorn-magic`. However, the resolved version of `unicorn-magic` provided a default export (CJS-style) without the expected named exports, causing `esbuild` to fail.

### Phase 3: `wrangler dev` Runtime Crash (`Uncaught TypeError`)

After temporarily fixing the `unicorn-magic` issue, `wrangler dev` would start, but the runtime would immediately crash.

- **Error:** `Uncaught TypeError: Cannot initialize N7workerd3api15ExportedHandlerE with required members from an undefined or null value.`
- **Cause:** `wrangler.json` defines Durable Object bindings for `StreamCoordinator` and `WorkflowExecutorContainer`. The Cloudflare runtime (`workerd`) requires these to be **synchronously available as class constructors** when the worker script starts. A dynamic wrapper that exported `let StreamCoordinator = undefined;` (to be populated asynchronously) caused `workerd` to see `undefined` at startup and crash.

### Phase 4: `wrangler dev` Dynamic Import Failure

After updating the wrapper to export synchronous *stub* classes to satisfy `workerd`, `wrangler dev` still failed.

- **Error:** `Dynamic import of src/worker failed: Error: No such module "../../src/worker"`
- **Cause:** The wrapper tried to dynamically import the real implementation from `../../src/worker`, a relative path pointing to the original source code. `wrangler dev` runs its final worker script from an isolated, temporary directory (`.wrangler/tmp/dev-...`) where this relative path is invalid. The dynamic import failed, the stubs were never replaced with the real implementations, and the runtime crashed as a result of not having the final, valid classes.
