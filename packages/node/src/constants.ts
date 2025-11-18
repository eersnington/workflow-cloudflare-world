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

export const DEFAULT_OUTPUT_DIR = '.well-known/workflow/v1';

export const HANDLER_FILENAMES = {
  flow: 'flow',
  step: 'step',
  webhook: 'webhook',
  client: 'client',
} as const;

export type WorkflowRouteKey = keyof typeof WORKFLOW_ROUTES;
