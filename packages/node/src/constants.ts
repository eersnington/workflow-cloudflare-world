export const WORKFLOW_ROUTES = {
  flow: '/.well-known/workflow/v1/flow',
  step: '/.well-known/workflow/v1/step',
  webhook: '/.well-known/workflow/v1/webhook',
} as const;

export const HANDLER_FILENAMES = {
  flow: 'flow',
  step: 'step',
  webhook: 'webhook',
} as const;

export type WorkflowRouteKey = keyof typeof WORKFLOW_ROUTES;
