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
