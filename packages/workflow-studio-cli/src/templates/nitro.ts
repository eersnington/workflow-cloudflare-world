import type { TemplateDefinition, TemplateFileFactory } from './types.js';

const nitroPlaceholders: TemplateFileFactory = {
  'workflows/user-signup.ts': () =>
    `export const WORKFLOW_STUDIO_PLACEHOLDER = '__WORKFLOW_NITRO_MINIMAL__';
`,
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
  description: 'Universal web server framework with built-in Workflow support.',
  examples: {
    minimal: {
      label: 'Minimal workflow starter',
      description: 'Hello-world workflow triggered from a Nitro route.',
      placeholders: nitroPlaceholders,
      files: nitroFiles,
      codemods: [
        'nitro/config/with-workflow',
        'nitro/api/route',
        'nitro/workflow',
        'nitro/package/scripts',
      ],
    },
  },
};
