import type { RequestHandler } from 'express';
import { access, constants } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  DEFAULT_OUTPUT_DIR,
  HANDLER_FILENAMES,
  WORKFLOW_ROUTES,
} from './constants.js';
import type { WorkflowOptions } from './types.js';
import { handleFlow, handleStep, handleWebhook } from './handlers.js';

import { ExpressBuilder } from './builder.js';

/**
 * Creates Express middleware for handling workflow requests
 * Assumes workflow files have been pre-built with `workflow build`
 */
export function createWorkflowMiddleware(
  options: WorkflowOptions = {}
): RequestHandler {
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const buildDir = resolve(process.cwd(), outputDir);
  const isDev = options.dev ?? process.env.NODE_ENV !== 'production';

  if (isDev) {
    const builder = new ExpressBuilder({ ...options, dev: true });
    // Start the builder in the background
    builder.build().catch((err) => {
      console.error('[workflow-express] Failed to start dev builder:', err);
    });
  }

  let handlersChecked = false;
  async function ensureHandlersExist() {
    if (handlersChecked) return;
    await Promise.all(
      Object.values(HANDLER_FILENAMES).map((file) =>
        access(join(buildDir, file), constants.F_OK)
      )
    );
    handlersChecked = true;
  }

  return async (req, res, next) => {
    if (!req.path?.startsWith(WORKFLOW_ROUTES.base)) {
      return next();
    }

    try {
      await ensureHandlersExist();
    } catch {
      return next(
        new Error(
          'Workflow bundles missing. Please run "workflow build" before starting your server.\n' +
            'See https://useworkflow.dev/docs/how-it-works/framework-integrations'
        )
      );
    }

    try {
      if (req.path === WORKFLOW_ROUTES.flow && req.method === 'POST') {
        await handleFlow(req, res, options);
        return;
      }

      if (req.path === WORKFLOW_ROUTES.step && req.method === 'POST') {
        await handleStep(req, res, options);
        return;
      }

      if (req.path?.startsWith(WORKFLOW_ROUTES.webhook)) {
        await handleWebhook(req, res, options);
        return;
      }

      res.status(404).send('Not Found');
    } catch (error) {
      console.error(
        '[workflow-express] Failed to handle workflow request',
        error
      );
      next(error);
    }
  };
}
