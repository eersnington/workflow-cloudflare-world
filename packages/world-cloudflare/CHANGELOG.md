# workflow-cloudflare-world

## 4.1.0-beta.0

### Major Changes

- **Architectural Overhaul**: This package is now a standalone, deployable runtime application. The consumer-facing components (Vite plugin, container client) have been moved to a new `cloudflare-workflow-bindings` package. **BREAKING CHANGE:** Consumer applications should no longer install or import `workflow-cloudflare-world`. Instead, install `cloudflare-workflow-bindings` for Worker integration.

### Features

- **Pre-built Worker Entrypoint**: A new canonical `src/worker.ts` entrypoint is now included. Users can point their `wrangler.toml` `main` field directly to the pre-built script in `node_modules`, eliminating the need for boilerplate worker code.
- **Updated CLI Wizard**: The `npx workflow-cloudflare-world init` command has been updated to scaffold a project that uses the new pre-built entrypoint, simplifying the setup process by removing worker code generation.

### Chores

- **Documentation**: Updated `README.md` and `HOW_IT_WORKS.md` to reflect the new two-package architecture, clarifying the roles of the runtime and the bindings.
- **Package Cleanup**: Removed `vite-plugin` and `container-client` from the package `exports` to prevent them from being accidentally bundled in consumer applications. Removed global side-effects from the package's entrypoint.

## 4.0.1-beta.3
