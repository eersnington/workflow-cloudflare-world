import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

// Wrangler only uploads the module referenced by `wrangler.json.main`. For SvelteKit,
// adapter-cloudflare writes `.svelte-kit/cloudflare/_worker.js`, which does not know
// about the Workflow queue handler or Durable Object exports. This post-build patch
// overwrites that generated file so the default fetch export still comes from the
// adapter, but the queue handler and StreamCoordinator re-exports live alongside it.
// This script runs as part of `pnpm build`; do not remove it unless you replace it
// with another automation that wires up the Workflow exports.

const root = process.cwd();
const workerPath = resolve(root, '.svelte-kit/cloudflare/_worker.js');

const wrapper = `
// Dynamic wrapper: avoid static imports so the bundler does not resolve dev/runtime-only deps.
// This wrapper dynamically loads the built worker and the runtime worker module at runtime.
// It exports live bindings that will be populated asynchronously to avoid static analysis.
// For Durable Objects, wrangler expects a class constructor at module evaluation time.
// We export placeholder stubs that throw if instantiated before the dynamic loader runs.
// The dynamic loader will overwrite these with the real implementations at runtime.
export class StreamCoordinator {
  constructor(state, env) {}
  async fetch(request) {
    return new Response('StreamCoordinator stub: dynamic import of real implementation failed or is in progress.', { status: 501 });
  }
}
export class WorkflowExecutorContainer {
  constructor(state, env) {}
  async fetch(request) {
    return new Response('WorkflowExecutorContainer stub: dynamic import of real implementation failed or is in progress.', { status: 501 });
  }
}

export let loadWorkflowExecutorContainer = undefined;
export let queue = (..._args) => {
  throw new Error('Workflow queue handler not loaded yet. Await dynamic loader or run a full build.');
};

let _builtWorker = null;
async function getBuiltWorker() {
  if (_builtWorker) return _builtWorker;
  try {
    // Dynamic import so bundlers do not statically include the build artifact or its deps.
    _builtWorker = await import('../../build/index.js');
    // normalize default export
    _builtWorker = _builtWorker && (_builtWorker.default ?? _builtWorker);
    return _builtWorker;
  } catch (err) {
    (globalThis.console ?? console).warn?.('Failed to dynamically import build/index.js:', err);
    throw err;
  }
}

// Load runtime helper exports (underscored names) without static imports.
// This avoids the bundler pulling in packages referenced only for local dev.
(async () => {
  try {
    const workerPath = '../../src/' + 'worker';
    const mod = await import(workerPath);
    StreamCoordinator = mod._StreamCoordinator ?? mod.StreamCoordinator ?? undefined;
    WorkflowExecutorContainer = mod._WorkflowExecutorContainer ?? mod.WorkflowExecutorContainer ?? undefined;
    loadWorkflowExecutorContainer = mod._loadWorkflowExecutorContainer ?? mod.loadWorkflowExecutorContainer ?? undefined;
    if (typeof mod.queue === 'function') {
      queue = mod.queue;
    } else if (mod.queue) {
      queue = mod.queue;
    }
  } catch (err) {
    (globalThis.console ?? console).warn?.('Dynamic import of src/worker failed:', err);
    // leave placeholders intact so the module can still be bundled; runtime code can still call loader
  }
})();

// Default export forwards to the dynamically loaded built worker's fetch handler.
// This keeps the wrapper free of static imports while still delegating to the adapter output.
export default {
  async fetch(request, env, ctx) {
    try {
      const built = await getBuiltWorker();
      if (!built) return new Response('No built worker available', { status: 500 });
      if (typeof built === 'function') {
        return await built(request, env, ctx);
      }
      if (typeof built.fetch === 'function') {
        return await built.fetch(request, env, ctx);
      }
      return new Response('Worker has no fetch handler', { status: 500 });
    } catch (err) {
      return new Response('Failed to load built worker: ' + String(err), { status: 500 });
    }
  }
};


`;

try {
  await readFile(workerPath, 'utf-8');
  await writeFile(workerPath, wrapper, 'utf-8');
  console.log(
    `Patched ${workerPath} to export StreamCoordinator + queue handlers.`
  );
} catch (error) {
  console.error('Failed to patch Cloudflare worker output:', error);
  process.exit(1);
}
