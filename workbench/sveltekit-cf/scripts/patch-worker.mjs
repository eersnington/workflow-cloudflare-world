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

const wrapper = `import worker from "../../build/index.js";
import { StreamCoordinator as WorkflowStreamCoordinator, WorkflowExecutorContainer, queue as workflowQueue } from "../../src/worker";

const workflowWorker = {
  ...worker,
  queue: workflowQueue,
};

export default workflowWorker;
export const queue = workflowQueue;
export const StreamCoordinator = WorkflowStreamCoordinator;
export { WorkflowExecutorContainer };
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
