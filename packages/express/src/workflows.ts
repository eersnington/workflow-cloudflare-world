/**
 * Workflow imports with metadata
 *
 * This module provides workflow functions with the necessary workflowId metadata
 * for the `start()` function.
 *
 * Usage:
 * ```ts
 * import { getWorkflow } from 'workflow-express/workflows';
 * const handleGreeting = await getWorkflow('handleGreeting');
 * const run = await start(handleGreeting, ['name']);
 * ```
 *
 * Note: Make sure to run `workflow build` before importing workflow functions.
 */

import { DEFAULT_OUTPUT_DIR } from './constants.js';
import type { WorkflowOptions } from './types.js';

// Dynamically import from the generated client bundle at runtime
// This avoids TypeScript compilation issues while still providing workflow metadata
/**
 * @deprecated Use the generated client bundle directly for type safety.
 *
 * Example:
 * ```ts
 * import { myWorkflow } from './.well-known/workflow/v1/client';
 * ```
 */
export async function getWorkflow(name: string, options: WorkflowOptions = {}) {
  try {
    // Use a dynamic import that will work at runtime
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    const clientBundlePath = `${process.cwd()}/${outputDir}/client.js`;
    const clientBundle = await import(clientBundlePath);
    return clientBundle[name];
  } catch (error) {
    // Handle both import errors and missing workflow function errors
    const isImportError =
      error instanceof Error &&
      (error.message.includes('Cannot find module') ||
        error.message.includes('ENOENT') ||
        error.message.includes('MODULE_NOT_FOUND'));

    if (isImportError) {
      throw new Error(
        `Workflow client bundle not found. Please run 'workflow build' before starting your server.\n` +
          `Command: workflow build\n` +
          `See: https://useworkflow.dev/docs/how-it-works/framework-integrations`
      );
    }

    throw new Error(
      `Workflow '${name}' not found in client bundle. Make sure the workflow is exported correctly.\n` +
        `Available workflows: Run 'workflow build' to generate the client bundle.`
    );
  }
}
