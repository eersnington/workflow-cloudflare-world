export const WORKFLOW_ROUTES = {
  base: '/.well-known/workflow/v1',
  flow: '/.well-known/workflow/v1/flow',
  step: '/.well-known/workflow/v1/step',
  webhook: '/.well-known/workflow/v1/webhook',
} as const;

export const DEFAULT_WORKFLOW_DIRS = [
  'workflows',
  'src/workflows',
  'app',
  'src/app',
  'routes',
  'src/routes',
  'api',
  'src/api',
] as const;

export const HANDLER_FILENAMES = {
  flow: 'flow.js',
  step: 'step.js',
  webhook: 'webhook.js',
  client: 'client.js',
} as const;

export const DEFAULT_OUTPUT_DIR = '.well-known/workflow/v1';

export const FASTIFY_PLUGIN_NAME = 'workflow-fastify';

export const FASTIFY_PLUGIN_VERSION = '4.x';
