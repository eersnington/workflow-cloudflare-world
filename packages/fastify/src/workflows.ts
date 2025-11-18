/**
 * Workflow utilities for Fastify integration
 *
 * This module provides workflow functions with the necessary workflowId metadata
 * for the `start()` function, following the same pattern as workflow-express
 * but optimized for Fastify's ecosystem.
 *
 * Usage:
 * ```ts
 * import { getWorkflow } from '@workflow/fastify/workflows';
 * const handleGreeting = await getWorkflow('handleGreeting');
 * const run = await start(handleGreeting, ['name']);
 * ```
 *
 * Features:
 * - Dynamic loading from generated client bundles
 * - Fastify-specific error handling and logging
 * - Performance optimizations with caching
 * - HMR support for development
 * - Type safety with TypeScript
 */

import { DEFAULT_OUTPUT_DIR } from './constants.js';
import type { WorkflowFastifyOptions } from './types.js';
import { access, constants } from 'node:fs/promises';
import { join } from 'node:path';

// Cache for loaded client bundles and workflows
const workflowCache = new Map<string, any>();
const cacheTimestamps = new Map<string, number>();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes - shorter than handlers for more frequent updates

/**
 * Dynamically import and cache workflow functions from client bundle
 * Enhanced for Fastify with better error handling and performance
 */
export async function getWorkflow(
  name: string,
  options: WorkflowFastifyOptions = {}
) {
  const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
  const cacheKey = `${outputDir}:${name}`;

  // Check cache first
  if (workflowCache.has(cacheKey)) {
    const cachedTime = cacheTimestamps.get(cacheKey) || 0;
    const now = Date.now();

    // Return cached workflow if still valid
    if (now - cachedTime < CACHE_TTL) {
      return workflowCache.get(cacheKey);
    } else {
      // Clear expired cache
      workflowCache.delete(cacheKey);
      cacheTimestamps.delete(cacheKey);
    }
  }

  try {
    // Validate client bundle exists before attempting import
    const clientBundlePath = join(process.cwd(), outputDir, 'client.js');
    await validateClientBundle(clientBundlePath);

    // Dynamic import with proper error handling
    const clientBundle = await importClientBundle(clientBundlePath);
    const workflow = clientBundle[name];

    if (!workflow) {
      throw new WorkflowNotFoundError(
        name,
        getAvailableWorkflows(clientBundle)
      );
    }

    // Validate workflow structure
    validateWorkflowFunction(workflow, name);

    // Cache the workflow for performance
    workflowCache.set(cacheKey, workflow);
    cacheTimestamps.set(cacheKey, Date.now());

    return workflow;
  } catch (error) {
    // Clear cache on any error to ensure fresh load on retry
    workflowCache.delete(cacheKey);
    cacheTimestamps.delete(cacheKey);

    if (
      error instanceof WorkflowNotFoundError ||
      error instanceof WorkflowBundleNotFoundError
    ) {
      throw error;
    }

    // Wrap unexpected errors
    throw new WorkflowLoadError(
      name,
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * List all available workflows in the client bundle
 */
export async function listWorkflows(
  options: WorkflowFastifyOptions = {}
): Promise<string[]> {
  try {
    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    const clientBundlePath = join(process.cwd(), outputDir, 'client.js');

    await validateClientBundle(clientBundlePath);
    const clientBundle = await importClientBundle(clientBundlePath);

    return getAvailableWorkflows(clientBundle);
  } catch (error) {
    if (error instanceof WorkflowBundleNotFoundError) {
      return [];
    }
    throw error;
  }
}

/**
 * Get workflow metadata (workflowId, description, etc.)
 */
export async function getWorkflowMetadata(
  name: string,
  options: WorkflowFastifyOptions = {}
) {
  try {
    const workflow = await getWorkflow(name, options);

    return {
      name,
      workflowId: workflow.workflowId,
      description: workflow.description,
      parameters: workflow.parameters || [],
      returnType: workflow.returnType,
    };
  } catch (error) {
    if (error instanceof WorkflowNotFoundError) {
      return null;
    }
    throw error;
  }
}

/**
 * Clear the workflow cache (useful for HMR)
 */
export function clearWorkflowCache(): void {
  workflowCache.clear();
  cacheTimestamps.clear();
}

/**
 * Get cache statistics for monitoring
 */
export function getCacheStats(): {
  size: number;
  entries: Array<{ key: string; timestamp: number; age: number }>;
} {
  const now = Date.now();
  const entries = Array.from(cacheTimestamps.entries()).map(
    ([key, timestamp]) => ({
      key,
      timestamp,
      age: now - timestamp,
    })
  );

  return {
    size: workflowCache.size,
    entries,
  };
}

/**
 * Validate that client bundle exists and is readable
 */
async function validateClientBundle(clientBundlePath: string): Promise<void> {
  try {
    await access(clientBundlePath, constants.R_OK);
  } catch (error) {
    throw new WorkflowBundleNotFoundError(clientBundlePath);
  }
}

/**
 * Import client bundle with error handling
 */
async function importClientBundle(clientBundlePath: string): Promise<any> {
  try {
    // Convert file path to file URL for ES modules
    const fileUrl = `file://${clientBundlePath}`;
    return await import(fileUrl);
  } catch (error) {
    throw new WorkflowBundleLoadError(
      clientBundlePath,
      error instanceof Error ? error.message : 'Unknown import error'
    );
  }
}

/**
 * Get list of available workflow names from client bundle
 */
function getAvailableWorkflows(clientBundle: any): string[] {
  return Object.keys(clientBundle).filter((key) => {
    const value = clientBundle[key];
    return typeof value === 'function' && value.workflowId;
  });
}

/**
 * Validate that workflow function has required properties
 */
function validateWorkflowFunction(workflow: any, name: string): void {
  if (typeof workflow !== 'function') {
    throw new WorkflowInvalidError(name, 'Workflow must be a function');
  }

  if (!workflow.workflowId) {
    throw new WorkflowInvalidError(
      name,
      'Workflow missing required workflowId property'
    );
  }
}

/**
 * Custom error classes for better error handling
 */
export class WorkflowNotFoundError extends Error {
  constructor(name: string, availableWorkflows: string[] = []) {
    const message = `Workflow '${name}' not found in client bundle.${
      availableWorkflows.length > 0
        ? ` Available workflows: ${availableWorkflows.join(', ')}`
        : ' No workflows found in client bundle.'
    }`;
    super(message);
    this.name = 'WorkflowNotFoundError';
  }
}

export class WorkflowBundleNotFoundError extends Error {
  constructor(bundlePath: string) {
    super(
      `Workflow client bundle not found at '${bundlePath}'.\n` +
        `Please run 'workflow build' before starting your server.\n` +
        `Command: workflow build\n` +
        `See: https://useworkflow.dev/docs/how-it-works/framework-integrations`
    );
    this.name = 'WorkflowBundleNotFoundError';
  }
}

export class WorkflowBundleLoadError extends Error {
  constructor(bundlePath: string, importError: string) {
    super(
      `Failed to load workflow client bundle from '${bundlePath}': ${importError}\n` +
        `Please check that 'workflow build' completed successfully and the bundle is valid.`
    );
    this.name = 'WorkflowBundleLoadError';
  }
}

export class WorkflowLoadError extends Error {
  constructor(name: string, originalError: string) {
    super(`Failed to load workflow '${name}': ${originalError}`);
    this.name = 'WorkflowLoadError';
  }
}

export class WorkflowInvalidError extends Error {
  constructor(name: string, reason: string) {
    super(`Workflow '${name}' is invalid: ${reason}`);
    this.name = 'WorkflowInvalidError';
  }
}

/**
 * Type guard for workflow errors
 */
export function isWorkflowError(
  error: unknown
): error is WorkflowNotFoundError | WorkflowBundleNotFoundError {
  return (
    error instanceof WorkflowNotFoundError ||
    error instanceof WorkflowBundleNotFoundError ||
    error instanceof WorkflowBundleLoadError ||
    error instanceof WorkflowLoadError ||
    error instanceof WorkflowInvalidError
  );
}
