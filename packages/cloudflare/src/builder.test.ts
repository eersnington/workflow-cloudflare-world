import { describe, expect, test, vi } from 'vitest';

vi.mock('@workflow/builders', () => {
  class BaseBuilder {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  }

  const createBaseBuilderConfig = vi.fn((config) => config);

  return {
    BaseBuilder,
    createBaseBuilderConfig,
  };
});
import {
  WorkflowCloudflareBuilder,
  createWorkflowCloudflareBuilder,
} from './builder.js';

describe('createWorkflowCloudflareBuilder', () => {
  test('returns a builder instance by default', () => {
    const builder = createWorkflowCloudflareBuilder();
    expect(builder).toBeInstanceOf(WorkflowCloudflareBuilder);
  });

  test('respects custom directories and options', () => {
    const builder = createWorkflowCloudflareBuilder({
      dirs: ['custom/workflows'],
      outDir: '.custom',
      watch: true,
    });
    expect(builder).toBeInstanceOf(WorkflowCloudflareBuilder);
  });
});
