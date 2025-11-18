import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DEFAULT_OUTPUT_DIR, HANDLER_FILENAMES } from './constants.js';

const WORKFLOW_DOCS_URL =
  'https://useworkflow.dev/docs/how-it-works/framework-integrations';

export interface WorkflowClientOptions {
  /**
   * Directory where workflow bundles exist.
   * Defaults to `.well-known/workflow/v1` from process.cwd().
   */
  buildDir?: string;
  /**
   * Override the base working directory. Defaults to process.cwd().
   */
  cwd?: string;
}

export type GeneratedWorkflow<
  TArgs extends unknown[] = unknown[],
  TResult = unknown,
> = (...args: TArgs) => Promise<TResult>;

/**
 * Dynamically loads a workflow function from the generated client bundle.
 * Ensures the workflow metadata (workflowId) is available for start().
 */
export async function getWorkflow<
  TWorkflow extends GeneratedWorkflow = GeneratedWorkflow,
>(name: string, options: WorkflowClientOptions = {}): Promise<TWorkflow> {
  const cwd = options.cwd ?? process.cwd();
  const buildDir = resolve(cwd, options.buildDir ?? DEFAULT_OUTPUT_DIR);
  const clientBundlePath = join(buildDir, `${HANDLER_FILENAMES.client}.js`);

  try {
    const moduleUrl = pathToFileURL(clientBundlePath).href;
    const clientBundle = (await import(moduleUrl)) as Record<string, unknown>;
    const workflow = clientBundle[name];

    if (typeof workflow === 'function') {
      return workflow as TWorkflow;
    }

    throw new Error(
      `Workflow '${name}' not found in client bundle. Make sure it is exported and run "workflow build" to regenerate the client bundle.`
    );
  } catch (error) {
    if (isClientBundleMissing(error)) {
      throw new Error(
        [
          `Workflow client bundle not found. Please run "workflow build" before starting your server.`,
          `Expected client bundle at: ${clientBundlePath}`,
          `See: ${WORKFLOW_DOCS_URL}`,
        ].join('\n')
      );
    }
    throw error;
  }
}

function isClientBundleMissing(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message ?? '';
  return (
    message.includes('Cannot find module') ||
    message.includes('ENOENT') ||
    message.includes('MODULE_NOT_FOUND') ||
    message.includes('Unknown file extension')
  );
}
