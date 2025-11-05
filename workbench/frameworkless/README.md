# Frameworkless Workbench (prototype)

scratchpad for experimenting with the standalone runtime helpers. this is never shipping to main; it exists so we can iterate quickly on the adapters while we spike out apis.

## workflow

1. build the workflow bundles:

```bash
pnpm --filter @workflow/frameworkless-app build
```

2. start the tiny http server (compiles `server.ts` with `tsc` first):

```bash
pnpm --filter @workflow/frameworkless-app start
```

the server will boot on `http://127.0.0.1:${PORT || 3000}` (plain `node dist/server.js`) and expose the usual workflow endpoints under `/.well-known/workflow/v1` plus a helper `POST /api/test` route that starts the sample workflow.
set `PORT` if you need a different listener.

## notes

- the server imports from `@workflow/standalone`, so make sure that package is built when testing changes locally (`pnpm --filter @workflow/standalone build`).
- manifests matter here: the build step emits `manifest.cjs`, and the server loads it so we can map workflow ids back to exports when we add queue triggers later.
- this workbench is intentionally bare—just a single `hello` workflow for now. continue spiking features on top of it as the standalone package evolves.
- `server.ts` stays TypeScript; the start script runs `tsc --project tsconfig.server.json` to emit `dist/server.js` before booting node, so we avoid extra runtime loaders.
- looking to poke at it? see `TESTING.md` for instructions covering the runtime script, cli integration, and curl-based debugging.
