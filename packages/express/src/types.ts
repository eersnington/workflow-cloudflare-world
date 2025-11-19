import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';

export interface WorkflowRequest extends ExpressRequest {
  // Express Request already has everything we need for Web API compatibility
}

export interface WorkflowResponse extends ExpressResponse {
  // Express Response already has everything we need for Web API compatibility
}

export interface WorkflowOptions {
  /**
   * Absolute or relative path where generated bundles live.
   * Defaults to `.well-known/workflow/v1` from process.cwd().
   */
  outputDir?: string;

  /**
   * Directories to search for workflow source files if ExpressBuilder is used.
   * Defaults to a curated list of common workflow directories.
   */
  dirs?: string[];

  /**
   * Enable development mode.
   * If true, the workflow builder will run in watch mode within the middleware.
   * Defaults to process.env.NODE_ENV !== 'production'
   */
  dev?: boolean;
}
