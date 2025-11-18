/**
 * @workflow/fastify - Fastify plugin for Vercel Workflow DevKit
 *
 * Automatically registers the standard workflow HTTP routes, spins up the
 * FastifyBuilder when the plugin registers, and exposes helpers for listing/loading
 * workflows exactly like other framework integrations.
 *
 * @example
 * ```ts
 * import Fastify from 'fastify';
 * import workflow from '@workflow/fastify';
 * import { handleGreeting } from './workflows/example';
 * import { start } from 'workflow/api';
 *
 * const fastify = Fastify({ logger: true });
 *
 * await fastify.register(workflow, {
 *   dirs: ['workflows'],
 *   workflowManifestPath: '.well-known/workflow/manifest.json',
 *   hmr: process.env.NODE_ENV !== 'production',
 * });
 *
 * fastify.post('/greet', async (req) => {
 *   const run = await start(handleGreeting, [req.body.name]);
 *   return { runId: run.runId };
 * });
 * ```
 */

import workflowFastifyPlugin, { enableHMR } from './plugin.js';

export default workflowFastifyPlugin;

export type {
  WorkflowFastifyOptions,
  WorkflowRequest,
  WorkflowReply,
  WorkflowHandler,
  WebhookHandlers,
  WorkflowError,
  WorkflowContext,
  WorkflowFastifyPlugin,
} from './types.js';
export type { WorkflowFastifyPluginOptions } from './plugin.js';

export { FastifyBuilder } from './builder.js';

export {
  WORKFLOW_ROUTES,
  DEFAULT_WORKFLOW_DIRS,
  HANDLER_FILENAMES,
  DEFAULT_OUTPUT_DIR,
  FASTIFY_PLUGIN_NAME,
  FASTIFY_PLUGIN_VERSION,
} from './constants.js';

// Re-export HMR utilities
export { enableHMR };

// Export plugin as named export for those who prefer it
export const workflow = workflowFastifyPlugin;
