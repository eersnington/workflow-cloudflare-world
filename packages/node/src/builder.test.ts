import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  WorkflowNodeLocalBuilder,
  WorkflowNodeVercelBuilder,
  createWorkflowNodeBuilder,
} from './builder.js';

describe('createWorkflowNodeBuilder', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.VERCEL;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('returns a local builder by default', () => {
    const builder = createWorkflowNodeBuilder();
    expect(builder).toBeInstanceOf(WorkflowNodeLocalBuilder);
  });

  test('returns a Vercel builder when target is explicitly set', () => {
    const builder = createWorkflowNodeBuilder({ target: 'vercel' });
    expect(builder).toBeInstanceOf(WorkflowNodeVercelBuilder);
  });

  test('auto-detects the Vercel environment variables', () => {
    process.env.VERCEL = '1';
    const builder = createWorkflowNodeBuilder();
    expect(builder).toBeInstanceOf(WorkflowNodeVercelBuilder);
  });
});
