import * as flowModule from './.well-known/workflow/v1/flow.mjs';
import * as stepModule from './.well-known/workflow/v1/step.mjs';
import * as webhookModule from './.well-known/workflow/v1/webhook.mjs';
import { createWorkflowCloudflareFetchHandler } from 'workflow-cloudflare/server';
import { start } from 'workflow/api';
import { handleGreeting } from './workflows/example.js';

const workflowHandler = await createWorkflowCloudflareFetchHandler({
  modules: {
    flow: flowModule,
    step: stepModule,
    webhook: webhookModule,
  },
});

export default {
  async fetch(request: Request) {
    const workflowResponse = await workflowHandler(request, {}, {});
    if (workflowResponse) {
      return workflowResponse;
    }

    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/test') {
      const input = await request.json().catch(() => ({}));
      const name =
        typeof input?.name === 'string' ? input.name : 'workflow-user';
      const run = await start(handleGreeting, [name]);
      return Response.json({ runId: run.runId });
    }

    return new Response('Not Found', { status: 404 });
  },
};
