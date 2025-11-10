import { describe, expect, it } from 'vitest';
import { cloudflareWorkflowTransformer } from './vite-plugin';

describe('cloudflareWorkflowTransformer', () => {
  it('transforms generated flow export into container forwarding handler', async () => {
    const sampleBundle = `// biome-ignore-all lint: generated file
/* eslint-disable */
import { workflowEntrypoint } from 'workflow/runtime';

const workflowCode = \`console.log('hello world');\`;

export const POST = workflowEntrypoint(workflowCode);
`;

    const plugin = cloudflareWorkflowTransformer();
    // plugin.transform is defined as an async function in the plugin implementation
    const result = await (plugin.transform as any)?.(
      sampleBundle,
      '/virtual/.well-known/workflow/v1/flow.js'
    );

    expect(result).toBeTruthy();
    const code = (result as any).code as string;

    // Should inject a POST handler that forwards to container client
    expect(code).toContain('export const POST');
    expect(code).toContain('__wf__container_client');
    // Should no longer directly call workflowEntrypoint(workflowCode)
    expect(code).not.toContain('workflowEntrypoint(workflowCode)');
    // Should still retain the original workflowCode constant
    expect(code).toContain('const workflowCode =');
  });

  it('does not transform unrelated files', async () => {
    const unrelated = `// some random file
export function hello() {
  return 'world';
}
`;
    const plugin = cloudflareWorkflowTransformer();
    const result = await (plugin.transform as any)?.(
      unrelated,
      '/virtual/src/some-file.js'
    );
    expect(result).toBeNull();
  });
});
