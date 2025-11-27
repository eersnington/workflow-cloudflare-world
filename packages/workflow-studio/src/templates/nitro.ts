import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const nitroPlaceholders: TemplateFileFactory = {
  'workflows/user-signup.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NITRO_MINIMAL__';
`,
};

const nitroAiPlaceholders: TemplateFileFactory = {
  'workflows/sequential-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_SEQUENTIAL__';
`,
  'workflows/orchestrator-workflow.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_ORCHESTRATOR__';
`,
  'server/api/workflows.post.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NITRO_AI_ROUTE__';
`,
  'index.html': () => `<!-- __WORKFLOW_NITRO_AI_PAGE__ -->\n`,
};

const nitroConfig = `import { defineConfig } from 'nitro';

export default defineConfig({
  modules: ['workflow/nitro'],
});
`;

const nitroFiles: TemplateFileFactory = {
  'nitro.config.ts': () => nitroConfig,
  'server/api/signup.post.ts': () => `import { start } from 'workflow/api';
import { handleUserSignup } from "../../workflows/user-signup";

export default defineEventHandler(async (event) => {
  const { email } = await readBody(event);
  // Executes asynchronously and doesn't block your app
  await start(handleUserSignup, [email]);
  return {
    message: "User signup workflow started",
  };
});`,
};

export const nitroTemplates: TemplateDefinition = {
  label: 'Nitro',
  handlebars: 'nitro',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow triggered from a Nitro route.',
      placeholders: nitroPlaceholders,
      files: nitroFiles,
      codemods: ['nitro/api/route', 'nitro/workflow'],
    },
    ai: {
      label: 'AI Workflows',
      description:
        'Sequential marketing copy generation and orchestrator feature planning with AI SDK.',
      placeholders: nitroAiPlaceholders,
      codemods: [
        'nitro/ai/page',
        'nitro/ai/route',
        'nitro/ai/sequential-workflow',
        'nitro/ai/orchestrator-workflow',
      ],
    },
  },
};
