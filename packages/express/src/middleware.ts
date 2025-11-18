import type { RequestHandler } from 'express';
import { access, constants } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { WORKFLOW_ROUTES } from './constants.js';
import type { WorkflowOptions } from './index.js';

/**
 * Creates Express middleware for handling workflow requests
 * Assumes workflow files have been pre-built with `workflow build`
 */
export function createWorkflowMiddleware(
  _options: WorkflowOptions = {}
): RequestHandler {
  const buildDir = resolve(process.cwd(), '.well-known/workflow/v1');

  return async (req, res, next) => {
    // Check if this is a workflow request
    if (!req.path?.startsWith(WORKFLOW_ROUTES.base)) {
      return next();
    }

    // Verify workflow files exist
    try {
      await Promise.all([
        access(join(buildDir, 'step.js'), constants.F_OK),
        access(join(buildDir, 'flow.js'), constants.F_OK),
        access(join(buildDir, 'webhook.js'), constants.F_OK),
      ]);
    } catch {
      return next(
        new Error(
          'Workflow files not found. Please run "workflow build" before starting your server.\n' +
            'See: https://useworkflow.dev/docs/how-it-works/framework-integrations'
        )
      );
    }

    // Route workflow requests
    try {
      return await handleWorkflowRequest(req, res);
    } catch (error) {
      return next(error);
    }
  };
}

/**
 * Routes workflow requests to appropriate handlers
 */
async function handleWorkflowRequest(req: any, res: any): Promise<void> {
  const { path, method } = req;

  // Load handlers (pre-built files should exist)
  try {
    if (path === WORKFLOW_ROUTES.flow && method === 'POST') {
      const { handleFlow } = await import('./handlers.js');
      return handleFlow(req, res);
    }

    if (path === WORKFLOW_ROUTES.step && method === 'POST') {
      const { handleStep } = await import('./handlers.js');
      return handleStep(req, res);
    }

    if (path?.startsWith(WORKFLOW_ROUTES.webhook)) {
      const { handleWebhook } = await import('./handlers.js');
      return handleWebhook(req, res);
    }

    res.status(404).send('Not Found');
  } catch (error) {
    console.error('[workflow-express] Error loading workflow handlers:', error);
    res.status(500).send('Internal Server Error');
  }
}
