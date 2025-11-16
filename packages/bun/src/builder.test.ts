import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  WorkflowBunLocalBuilder,
  WorkflowBunVercelBuilder,
  createWorkflowBunBuilder,
} from './builder.js';

describe('createWorkflowBunBuilder', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.VERCEL;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('returns the local builder by default', () => {
    const builder = createWorkflowBunBuilder();
    expect(builder).toBeInstanceOf(WorkflowBunLocalBuilder);
  });

  test('respects an explicit vercel target', () => {
    const builder = createWorkflowBunBuilder({ target: 'vercel' });
    expect(builder).toBeInstanceOf(WorkflowBunVercelBuilder);
  });

  test('auto-detects when running on Vercel', () => {
    process.env.VERCEL_DEPLOYMENT_ID = 'deployment';
    const builder = createWorkflowBunBuilder();
    expect(builder).toBeInstanceOf(WorkflowBunVercelBuilder);
  });
});
